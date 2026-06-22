const prisma = require('../db/client');

const ACTIVE_DAYS  = parseInt(process.env.ARCHIVE_ACTIVE_DAYS  || '30',  10);
const COLD_DAYS    = parseInt(process.env.ARCHIVE_COLD_DAYS    || '90',  10);
const DELETE_DAYS  = parseInt(process.env.ARCHIVE_DELETE_DAYS  || '180', 10);

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Runs one pass of the archive job:
 *  active → archived  : frames older than ACTIVE_DAYS
 *  archived → cold    : frames older than COLD_DAYS
 *  cold → deleted     : frames older than DELETE_DAYS (metadata-only; Cloudinary not touched)
 * Returns counts of rows updated per transition.
 */
async function runArchivePass() {
  const [toArchived, toCold, toDeleted] = await Promise.all([
    prisma.frame.updateMany({
      where: {
        storage_tier: 'active',
        created_at: { lt: daysAgo(ACTIVE_DAYS) },
      },
      data: { storage_tier: 'archived', archived_at: new Date() },
    }),
    prisma.frame.updateMany({
      where: {
        storage_tier: 'archived',
        created_at: { lt: daysAgo(COLD_DAYS) },
      },
      data: { storage_tier: 'cold' },
    }),
    prisma.frame.updateMany({
      where: {
        storage_tier: 'cold',
        created_at: { lt: daysAgo(DELETE_DAYS) },
      },
      data: { storage_tier: 'deleted' },
    }),
  ]);

  return {
    to_archived: toArchived.count,
    to_cold:     toCold.count,
    to_deleted:  toDeleted.count,
  };
}

/**
 * Aggregate stats — total frames per storage tier + estimated sizes.
 */
async function getArchiveStats() {
  const [tierCounts, totalFrames, totalSize] = await Promise.all([
    prisma.frame.groupBy({
      by: ['storage_tier'],
      _count: { id: true },
      _sum:   { file_size_bytes: true },
    }),
    prisma.frame.count(),
    prisma.frame.aggregate({ _sum: { file_size_bytes: true } }),
  ]);

  const byTier = {};
  for (const row of tierCounts) {
    byTier[row.storage_tier] = {
      count:      row._count.id,
      size_bytes: row._sum.file_size_bytes ? Number(row._sum.file_size_bytes) : 0,
    };
  }

  return {
    total_frames:     totalFrames,
    total_size_bytes: totalSize._sum.file_size_bytes ? Number(totalSize._sum.file_size_bytes) : 0,
    by_tier: byTier,
    policy: {
      active_days:  ACTIVE_DAYS,
      cold_days:    COLD_DAYS,
      delete_days:  DELETE_DAYS,
    },
  };
}

/**
 * Restore a frame from archived/cold back to active tier.
 */
async function restoreFrame(frameId) {
  return prisma.frame.update({
    where: { id: frameId },
    data:  { storage_tier: 'active', archived_at: null },
  });
}

module.exports = { runArchivePass, getArchiveStats, restoreFrame };
