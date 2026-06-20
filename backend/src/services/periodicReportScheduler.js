/**
 * Periodic report scheduler — auto-generates an aggregate report per shift/day/week
 * once the period rolls over. Distinct from the per-session PDF report; this is a
 * JSON aggregate (totals, FP/FN counts, system uptime proxy) stored in PeriodicReport.
 *
 * "System uptime" here is a proxy: completed_sessions / (completed + failed) within
 * the period — there's no continuous service-uptime monitor running yet (see
 * System Health Dashboard, which is simulated). This is the most honest signal
 * available from real data today.
 */
const axios = require('axios');
const prisma = require('../db/client');
const config = require('../config');

const SHIFT_HOURS = 8;
const PERIOD_TYPES = ['shift', 'day', 'week'];
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

function getCurrentPeriodStart(periodType, date = new Date()) {
  const d = new Date(date);
  if (periodType === 'shift') {
    d.setMinutes(0, 0, 0);
    d.setHours(Math.floor(d.getHours() / SHIFT_HOURS) * SHIFT_HOURS);
    return d;
  }
  if (periodType === 'day') {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (periodType === 'week') {
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0 = Sunday
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diffToMonday);
    return d;
  }
  throw new Error(`Unknown period type: ${periodType}`);
}

function getPeriodEnd(periodType, start) {
  const end = new Date(start);
  if (periodType === 'shift') end.setHours(end.getHours() + SHIFT_HOURS);
  else if (periodType === 'day') end.setDate(end.getDate() + 1);
  else if (periodType === 'week') end.setDate(end.getDate() + 7);
  return end;
}

// Boundaries of the most recently *completed* period (not the one still in progress).
function getPreviousPeriod(periodType, now = new Date()) {
  const currentStart = getCurrentPeriodStart(periodType, now);
  const prevStart = new Date(currentStart);
  if (periodType === 'shift') prevStart.setHours(prevStart.getHours() - SHIFT_HOURS);
  else if (periodType === 'day') prevStart.setDate(prevStart.getDate() - 1);
  else if (periodType === 'week') prevStart.setDate(prevStart.getDate() - 7);
  return { start: prevStart, end: currentStart };
}

async function generatePeriodicReport(periodType, { start, end }) {
  const sessions = await prisma.inspectionSession.findMany({
    where: { started_at: { gte: start, lt: end } },
    select: { status: true, critical_defects: true },
  });

  const totalSessions = sessions.length;
  const completedSessions = sessions.filter((s) => s.status === 'completed').length;
  const failedSessions = sessions.filter((s) => s.status === 'failed').length;
  const criticalDefects = sessions.reduce((sum, s) => sum + (s.critical_defects || 0), 0);

  const totalDefects = await prisma.defect.count({ where: { created_at: { gte: start, lt: end } } });

  const [falsePositiveCount, falseNegativeCount] = await Promise.all([
    prisma.defectReviewLog.count({ where: { created_at: { gte: start, lt: end }, log_type: 'false_positive' } }),
    prisma.defectReviewLog.count({ where: { created_at: { gte: start, lt: end }, log_type: 'false_negative' } }),
  ]);

  const denom = completedSessions + failedSessions;
  const systemUptimePct = denom > 0 ? Math.round((completedSessions / denom) * 1000) / 10 : null;

  const row = await prisma.periodicReport.upsert({
    where: { period_type_period_start: { period_type: periodType, period_start: start } },
    update: {
      period_end: end,
      total_sessions: totalSessions,
      completed_sessions: completedSessions,
      failed_sessions: failedSessions,
      total_defects: totalDefects,
      critical_defects: criticalDefects,
      false_positive_count: falsePositiveCount,
      false_negative_count: falseNegativeCount,
      system_uptime_pct: systemUptimePct,
      generated_at: new Date(),
    },
    create: {
      period_type: periodType,
      period_start: start,
      period_end: end,
      total_sessions: totalSessions,
      completed_sessions: completedSessions,
      failed_sessions: failedSessions,
      total_defects: totalDefects,
      critical_defects: criticalDefects,
      false_positive_count: falsePositiveCount,
      false_negative_count: falseNegativeCount,
      system_uptime_pct: systemUptimePct,
    },
  });

  // Render the PDF via the Python report_generator service — Node owns the
  // aggregate math + DB row, the PDF is just a rendering of it.
  try {
    const resp = await axios.post(
      `${config.services.reportGenerator}/generate_periodic`,
      {
        id: row.id,
        period_type: row.period_type,
        period_start: row.period_start,
        period_end: row.period_end,
        total_sessions: row.total_sessions,
        completed_sessions: row.completed_sessions,
        failed_sessions: row.failed_sessions,
        total_defects: row.total_defects,
        critical_defects: row.critical_defects,
        false_positive_count: row.false_positive_count,
        false_negative_count: row.false_negative_count,
        system_uptime_pct: systemUptimePct,
      },
      { timeout: 30_000 },
    );
    return prisma.periodicReport.update({ where: { id: row.id }, data: { pdf_url: resp.data.pdf_url } });
  } catch (err) {
    console.error({ msg: 'Periodic PDF generation failed — report row saved without pdf_url', period_type: periodType, error: err.message });
    return row;
  }
}

async function checkAndGenerateAll(log = console) {
  for (const periodType of PERIOD_TYPES) {
    const period = getPreviousPeriod(periodType);
    try {
      const existing = await prisma.periodicReport.findUnique({
        where: { period_type_period_start: { period_type: periodType, period_start: period.start } },
      });
      if (!existing) {
        await generatePeriodicReport(periodType, period);
        log.info?.(`Auto-generated ${periodType} periodic report for ${period.start.toISOString()}`);
      }
    } catch (err) {
      (log.error || log)({ msg: `Periodic report generation failed for ${periodType}`, error: err.message });
    }
  }
}

function startScheduler(log = console) {
  checkAndGenerateAll(log);
  setInterval(() => checkAndGenerateAll(log), CHECK_INTERVAL_MS);
}

module.exports = {
  startScheduler,
  checkAndGenerateAll,
  generatePeriodicReport,
  getPreviousPeriod,
  getCurrentPeriodStart,
  getPeriodEnd,
};
