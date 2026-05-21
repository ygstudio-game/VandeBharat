#!/usr/bin/env node
/**
 * VandeInspect — Full Data Cleanup
 *
 * Deletes ALL inspection data from:
 *   1. Cloudinary  — every asset under the vande/ folder
 *   2. PostgreSQL  — all rows from every inspection table (preserves schema + seed data)
 *
 * Usage:
 *   node cleanup.js          (dry-run: shows what would be deleted)
 *   node cleanup.js --confirm (actually deletes everything)
 */
'use strict';

const path = require('path');
const BACKEND_MODULES = path.join(__dirname, 'backend', 'node_modules');

// All packages live in backend/node_modules — resolve from there
const dotenv     = require(path.join(BACKEND_MODULES, 'dotenv'));
const cloudinary = require(path.join(BACKEND_MODULES, 'cloudinary')).v2;
const { PrismaClient } = require(path.join(BACKEND_MODULES, '@prisma', 'client'));

dotenv.config({ path: path.join(__dirname, 'backend', '.env') });

const DRY_RUN = !process.argv.includes('--confirm');
const prisma  = new PrismaClient();

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

function log(color, msg) { console.log(`${color}${msg}${C.reset}`); }

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Fetch all public_ids under vande/ (pages through cursor if > 500) ────────
async function getAllCloudinaryIds() {
  const ids = [];
  let cursor;
  do {
    const res = await cloudinary.api.resources({
      type:        'upload',
      prefix:      'vande/',
      max_results: 500,
      next_cursor: cursor,
    });
    ids.push(...res.resources.map(r => r.public_id));
    cursor = res.next_cursor;
  } while (cursor);
  return ids;
}

// ── Delete Cloudinary assets in batches of 100 ──────────────────────────────
async function deleteCloudinaryAssets(ids) {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const res = await cloudinary.api.delete_resources(batch);
    const count = Object.values(res.deleted).filter(v => v === 'deleted').length;
    deleted += count;
    log(C.gray, `  Cloudinary: deleted batch ${Math.floor(i / 100) + 1} — ${deleted}/${ids.length} assets`);
  }
  return deleted;
}

// ── Wipe DB tables in FK-safe order ─────────────────────────────────────────
async function wipeDatabase() {
  // child tables first, then parents
  const tables = [
    'defect',
    'frame',
    'pipelineStage',
    'report',
    'coach',
    'sessionCamera',
    'camera',
    'inspectionSession',
  ];

  const counts = {};
  for (const t of tables) {
    const before = await prisma[t].count();
    counts[t] = before;
  }

  if (DRY_RUN) return counts;

  for (const t of tables) {
    await prisma[t].deleteMany({});
    log(C.gray, `  DB: cleared ${t} (${counts[t]} rows)`);
  }
  return counts;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.cyan}VandeInspect — Data Cleanup${C.reset}`);

  if (DRY_RUN) {
    log(C.yellow, '\n[DRY RUN] Nothing will be deleted. Pass --confirm to actually clean up.\n');
  }

  // ── Cloudinary scan ────────────────────────────────────────────────────────
  log(C.cyan, 'Scanning Cloudinary (vande/ folder)...');
  const cloudIds = await getAllCloudinaryIds();
  log(C.bold, `  Found ${cloudIds.length} assets on Cloudinary`);

  // ── DB scan ────────────────────────────────────────────────────────────────
  log(C.cyan, '\nScanning PostgreSQL...');
  const dbCounts = await wipeDatabase(); // returns counts (and deletes if not dry-run)
  for (const [table, count] of Object.entries(dbCounts)) {
    if (count > 0) log(C.bold, `  ${table}: ${count} rows`);
  }

  if (DRY_RUN) {
    const totalDbRows = Object.values(dbCounts).reduce((a, b) => a + b, 0);
    console.log(`\n${C.yellow}Summary (dry-run):${C.reset}`);
    log(C.yellow, `  Cloudinary: ${cloudIds.length} assets would be deleted`);
    log(C.yellow, `  PostgreSQL: ${totalDbRows} rows would be deleted`);
    log(C.yellow, `\nRun with --confirm to proceed:\n  node cleanup.js --confirm\n`);
    return;
  }

  // ── Actually delete ────────────────────────────────────────────────────────
  if (cloudIds.length > 0) {
    log(C.cyan, '\nDeleting Cloudinary assets...');
    const deleted = await deleteCloudinaryAssets(cloudIds);
    log(C.green, `  Cloudinary: ${deleted} assets deleted`);
  } else {
    log(C.gray, '  Cloudinary: nothing to delete');
  }

  // Also delete the vande/ folder itself so it doesn't linger as empty
  try {
    await cloudinary.api.delete_folder('vande');
    log(C.green, '  Cloudinary: vande/ folder removed');
  } catch (_) { /* folder may not exist or may have sub-folders */ }

  const totalDbRows = Object.values(dbCounts).reduce((a, b) => a + b, 0);
  log(C.green, `\nPostgreSQL: ${totalDbRows} rows deleted`);
  log(C.green, `\nAll done. Database and Cloudinary are clean.\n`);
}

main()
  .catch(err => { console.error(C.red + err.message + C.reset); process.exit(1); })
  .finally(() => prisma.$disconnect());
