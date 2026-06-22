const prisma = require('../db/client');

// ── helpers ───────────────────────────────────────────────────────────────────

function calcMetrics(tp, fp, fn) {
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall    = tp + fn > 0 ? tp / (tp + fn) : null;
  const f1 = precision !== null && recall !== null && precision + recall > 0
    ? (2 * precision * recall) / (precision + recall)
    : null;
  return { tp, fp, fn, precision, recall, f1 };
}

function round2(n) {
  return n !== null && n !== undefined ? Math.round(n * 1000) / 1000 : null;
}

// ── routes ────────────────────────────────────────────────────────────────────

async function aiPerformance(fastify) {

  // GET /api/ai/performance — overall P/R/F1 from defect review data
  fastify.get('/performance', async () => {
    const [reviewCounts, reviewLogCounts, totalDefects, defectsByType, recentSessions] = await Promise.all([
      // From Defect.review_status
      prisma.defect.groupBy({
        by: ['review_status'],
        _count: { id: true },
      }),
      // From DefectReviewLog.log_type
      prisma.defectReviewLog.groupBy({
        by: ['log_type'],
        _count: { id: true },
      }),
      prisma.defect.count(),
      // Precision/recall breakdown by defect_type
      prisma.defect.groupBy({
        by: ['defect_type', 'review_status'],
        _count: { id: true },
      }),
      // Recent session-level health trend (last 10)
      prisma.inspectionSession.findMany({
        where:   { status: 'completed' },
        orderBy: { started_at: 'desc' },
        take:    10,
        select:  { id: true, session_code: true, started_at: true, health_score: true, critical_defects: true, ocr_confidence: true, _count: { select: { defects: true } } },
      }),
    ]);

    const byStatus = {};
    for (const r of reviewCounts) byStatus[r.review_status || 'pending'] = r._count.id;

    const byLogType = {};
    for (const r of reviewLogCounts) byLogType[r.log_type] = r._count.id;

    // TP: confirmed in Defect.review_status + DefectReviewLog
    // FP: false_positive in either
    // FN: false_negative in DefectReviewLog (missed defects — not in Defect table)
    const tp = (byStatus['confirmed']      || 0) + (byLogType['confirmed']       || 0);
    const fp = (byStatus['false_positive'] || 0) + (byLogType['false_positive']  || 0);
    const fn = byLogType['false_negative'] || 0;
    const pendingCount = byStatus['pending'] || (totalDefects - (byStatus['confirmed'] || 0) - (byStatus['false_positive'] || 0) - (byStatus['false_negative'] || 0));

    const metrics = calcMetrics(tp, fp, fn);

    // Per-defect-type breakdown
    const typeMap = {};
    for (const row of defectsByType) {
      const t = row.defect_type;
      if (!typeMap[t]) typeMap[t] = { defect_type: t, tp: 0, fp: 0, fn: 0, pending: 0, total: 0 };
      const s = row.review_status || 'pending';
      const n = row._count.id;
      typeMap[t].total += n;
      if (s === 'confirmed')       typeMap[t].tp += n;
      else if (s === 'false_positive') typeMap[t].fp += n;
      else if (s === 'false_negative') typeMap[t].fn += n;
      else                             typeMap[t].pending += n;
    }

    const byType = Object.values(typeMap).map(t => {
      const m = calcMetrics(t.tp, t.fp, t.fn);
      return { ...t, ...m };
    }).sort((a, b) => b.total - a.total);

    return {
      summary: {
        tp, fp, fn,
        pending_count:  pendingCount,
        total_defects:  totalDefects,
        reviewed_count: tp + fp + fn,
        coverage_pct:   totalDefects > 0 ? round2((tp + fp + fn) / totalDefects) : 0,
        precision: round2(metrics.precision),
        recall:    round2(metrics.recall),
        f1:        round2(metrics.f1),
      },
      by_type: byType.map(t => ({
        ...t,
        precision: round2(t.precision),
        recall:    round2(t.recall),
        f1:        round2(t.f1),
      })),
      recent_sessions: recentSessions.map(s => ({
        id:               s.id,
        session_code:     s.session_code,
        started_at:       s.started_at,
        health_score:     s.health_score ? Number(s.health_score) : null,
        critical_defects: s.critical_defects,
        ocr_confidence:   s.ocr_confidence ? Number(s.ocr_confidence) : null,
        defect_count:     s._count.defects,
      })),
    };
  });

  // GET /api/ai/performance/history?range=7d|30d|all
  fastify.get('/performance/history', async (req) => {
    const range = req.query.range || '30d';
    const rangeMap = { '7d': 7, '30d': 30, '90d': 90 };
    const days = rangeMap[range];
    const since = days ? new Date(Date.now() - days * 86400000) : null;

    const where = { status: 'completed' };
    if (since) where.started_at = { gte: since };

    const sessions = await prisma.inspectionSession.findMany({
      where,
      orderBy: { started_at: 'asc' },
      select: {
        id:               true,
        session_code:     true,
        started_at:       true,
        health_score:     true,
        ocr_confidence:   true,
        critical_defects: true,
        defects: {
          select: { review_status: true, severity: true },
        },
      },
    });

    const points = sessions.map(s => {
      const tp = s.defects.filter(d => d.review_status === 'confirmed').length;
      const fp = s.defects.filter(d => d.review_status === 'false_positive').length;
      const fn = s.defects.filter(d => d.review_status === 'false_negative').length;
      const m  = calcMetrics(tp, fp, fn);
      return {
        session_code:   s.session_code,
        date:           s.started_at,
        health_score:   s.health_score ? Number(s.health_score) : null,
        ocr_confidence: s.ocr_confidence ? Number(s.ocr_confidence) : null,
        total_defects:  s.defects.length,
        tp, fp, fn,
        precision: round2(m.precision),
        recall:    round2(m.recall),
        f1:        round2(m.f1),
      };
    });

    return { range, data_points: points };
  });

  // GET /api/ai/performance/model-comparison
  fastify.get('/performance/model-comparison', async () => {
    const versions = await prisma.modelVersion.findMany({
      orderBy: { created_at: 'desc' },
    });

    return {
      models: versions.map(v => ({
        id:          v.id,
        model_name:  v.model_name,
        version:     v.version,
        status:      v.status,
        created_at:  v.created_at,
        // metrics JSON may contain precision, recall, map50, etc. — stored when registering
        precision: v.metrics?.precision ?? null,
        recall:    v.metrics?.recall    ?? null,
        f1:        v.metrics?.f1        ?? null,
        map50:     v.metrics?.map50     ?? null,
        eval_set:  v.metrics?.eval_set_size ?? null,
      })),
    };
  });
}

module.exports = aiPerformance;
