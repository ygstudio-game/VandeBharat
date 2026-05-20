// Phase 4: wire to real aggregates from PostgreSQL
async function dashboard(fastify) {
  fastify.get('/kpis', async () => ({
    total_sessions: 0,
    sessions_today: 0,
    total_defects: 0,
    critical_defects: 0,
    avg_health_score: null,
  }));

  fastify.get('/live-queue', async () => ({ queue: [] }));
}

module.exports = dashboard;
