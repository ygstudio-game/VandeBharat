'use strict';

const prisma = require('../db/client');

module.exports = async function rcaRoutes(fastify) {
  // ── GET /api/rca/correlation ───────────────────────────────────────────────
  // Correlate defects by camera, coach_number, and defect_type across all sessions.
  // Returns ranked groups with correlation strength (count / total_sessions).
  fastify.get('/correlation', async (req, reply) => {
    const { defect_type, limit = 20 } = req.query;
    const lim = Math.min(parseInt(limit) || 20, 100);

    const where = defect_type ? { defect_type } : {};

    const [totalSessions, byCamera, byCoach, byType] = await Promise.all([
      prisma.inspectionSession.count({ where: { status: 'completed' } }),

      // By camera: defects → frame → session_camera → camera
      prisma.$queryRawUnsafe(`
        SELECT
          c.id            AS camera_id,
          c.camera_code,
          c.camera_type,
          c.position_label,
          d.defect_type,
          COUNT(*)::int   AS defect_count,
          COUNT(DISTINCT d.session_id)::int AS session_count,
          AVG(d.confidence::float) AS avg_confidence,
          string_agg(DISTINCT s.train_number, ', ') AS train_numbers,
          string_agg(DISTINCT cs.station_name, ', ') AS stations
        FROM defects d
        JOIN frames f ON f.id = d.frame_id
        JOIN session_cameras sc ON sc.id = f.session_camera_id
        JOIN cameras c ON c.id = sc.camera_id
        JOIN inspection_sessions s ON s.id = d.session_id
        LEFT JOIN camera_setups cs ON cs.station_code = s.station_code
        ${defect_type ? `WHERE d.defect_type = $1` : ''}
        GROUP BY c.id, c.camera_code, c.camera_type, c.position_label, d.defect_type
        ORDER BY defect_count DESC
        LIMIT ${lim}
      `, ...(defect_type ? [defect_type] : [])),

      // By coach_number across sessions
      prisma.$queryRawUnsafe(`
        SELECT
          ch.coach_number,
          ch.coach_type,
          d.defect_type,
          COUNT(*)::int   AS defect_count,
          COUNT(DISTINCT d.session_id)::int AS session_count,
          AVG(d.confidence::float) AS avg_confidence,
          string_agg(DISTINCT s.train_number, ', ') AS train_numbers,
          string_agg(DISTINCT cs.station_name, ', ') AS stations
        FROM defects d
        JOIN coaches ch ON ch.id = d.coach_id
        JOIN inspection_sessions s ON s.id = d.session_id
        LEFT JOIN camera_setups cs ON cs.station_code = s.station_code
        ${defect_type ? `WHERE d.defect_type = $1` : ''}
        GROUP BY ch.coach_number, ch.coach_type, d.defect_type
        ORDER BY defect_count DESC
        LIMIT ${lim}
      `, ...(defect_type ? [defect_type] : [])),

      // By defect_type: overall frequency
      prisma.$queryRawUnsafe(`
        SELECT
          d.defect_type,
          d.severity,
          COUNT(*)::int   AS defect_count,
          COUNT(DISTINCT d.session_id)::int AS session_count,
          AVG(d.confidence::float) AS avg_confidence
        FROM defects d
        ${defect_type ? `WHERE d.defect_type = $1` : ''}
        GROUP BY d.defect_type, d.severity
        ORDER BY defect_count DESC
        LIMIT ${lim}
      `, ...(defect_type ? [defect_type] : [])),
    ]);

    const sessions = totalSessions || 1;

    const cameraGroups = byCamera.map(r => ({
      ...r,
      defect_count: Number(r.defect_count),
      session_count: Number(r.session_count),
      avg_confidence: parseFloat((r.avg_confidence || 0).toFixed(3)),
      correlation_strength: parseFloat((Number(r.session_count) / sessions).toFixed(3)),
      probable_cause: 'hardware_camera',
    }));

    const coachGroups = byCoach.map(r => ({
      ...r,
      defect_count: Number(r.defect_count),
      session_count: Number(r.session_count),
      avg_confidence: parseFloat((r.avg_confidence || 0).toFixed(3)),
      correlation_strength: parseFloat((Number(r.session_count) / sessions).toFixed(3)),
      probable_cause: 'coach_manufacturing',
    }));

    const typeGroups = byType.map(r => ({
      ...r,
      defect_count: Number(r.defect_count),
      session_count: Number(r.session_count),
      avg_confidence: parseFloat((r.avg_confidence || 0).toFixed(3)),
      correlation_strength: parseFloat((Number(r.session_count) / sessions).toFixed(3)),
    }));

    return {
      total_sessions: sessions,
      camera_correlations: cameraGroups,
      coach_correlations: coachGroups,
      type_summary: typeGroups,
    };
  });

  // ── GET /api/rca/defect-clusters ──────────────────────────────────────────
  // Cluster recurring defects by defect_type + camera position + coach type.
  fastify.get('/defect-clusters', async (req, reply) => {
    const { min_count = 2 } = req.query;
    const minC = parseInt(min_count) || 2;

    const clusters = await prisma.$queryRawUnsafe(`
      SELECT
        d.defect_type,
        d.severity,
        c.camera_code,
        c.position_label,
        ch.coach_type,
        COUNT(*)::int                       AS occurrence_count,
        COUNT(DISTINCT d.session_id)::int   AS affected_sessions,
        MAX(d.created_at)                   AS last_seen,
        MIN(d.created_at)                   AS first_seen,
        string_agg(DISTINCT s.train_number, ', ') AS train_numbers,
        string_agg(DISTINCT cs.station_name, ', ') AS stations
      FROM defects d
      JOIN frames f ON f.id = d.frame_id
      JOIN session_cameras sc ON sc.id = f.session_camera_id
      JOIN cameras c ON c.id = sc.camera_id
      JOIN coaches ch ON ch.id = d.coach_id
      JOIN inspection_sessions s ON s.id = d.session_id
      LEFT JOIN camera_setups cs ON cs.station_code = s.station_code
      GROUP BY d.defect_type, d.severity, c.camera_code, c.position_label, ch.coach_type
      HAVING COUNT(*) >= ${minC}
      ORDER BY occurrence_count DESC
      LIMIT 50
    `);

    return {
      clusters: clusters.map(r => ({
        ...r,
        occurrence_count: Number(r.occurrence_count),
        affected_sessions: Number(r.affected_sessions),
      })),
    };
  });

  // ── GET /api/rca/failure-trends ───────────────────────────────────────────
  // Time-series of defect counts per day, optionally filtered by type + camera.
  fastify.get('/failure-trends', async (req, reply) => {
    const { defect_type, camera_id, days = 30 } = req.query;
    const d = Math.min(parseInt(days) || 30, 90);

    const conditions = [`d.created_at >= NOW() - INTERVAL '${d} days'`];
    const params = [];
    let pi = 1;
    if (defect_type) { conditions.push(`d.defect_type = $${pi++}`); params.push(defect_type); }
    if (camera_id) {
      conditions.push(`sc.camera_id = $${pi++}::uuid`);
      params.push(camera_id);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const joinClause = camera_id
      ? `JOIN frames f ON f.id = d.frame_id JOIN session_cameras sc ON sc.id = f.session_camera_id`
      : '';

    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        DATE_TRUNC('day', d.created_at)::date AS date,
        d.defect_type,
        COUNT(*)::int AS count
      FROM defects d
      ${joinClause}
      ${whereClause}
      GROUP BY DATE_TRUNC('day', d.created_at), d.defect_type
      ORDER BY date ASC
    `, ...params);

    return {
      trends: rows.map(r => ({
        date: r.date,
        defect_type: r.defect_type,
        count: Number(r.count),
      })),
    };
  });

  // ── GET /api/rca/corrective-actions ───────────────────────────────────────
  fastify.get('/corrective-actions', async (req, reply) => {
    const { defect_type, effectiveness, limit = 50, offset = 0 } = req.query;
    const where = {};
    if (defect_type) where.defect_type = defect_type;
    if (effectiveness) where.effectiveness = effectiveness;

    const [total, rows] = await Promise.all([
      prisma.correctiveAction.count({ where }),
      prisma.correctiveAction.findMany({
        where,
        orderBy: { performed_at: 'desc' },
        take: Math.min(parseInt(limit) || 50, 200),
        skip: parseInt(offset) || 0,
      }),
    ]);

    return { total, corrective_actions: rows };
  });

  // ── POST /api/rca/corrective-actions ──────────────────────────────────────
  fastify.post('/corrective-actions', async (req, reply) => {
    const { defect_type, camera_id, coach_number, root_cause, description, performed_by, performed_at, effectiveness, notes } = req.body || {};
    if (!defect_type || !description || !performed_by || !performed_at) {
      return reply.status(400).send({ error: 'defect_type, description, performed_by, performed_at required' });
    }
    const action = await prisma.correctiveAction.create({
      data: {
        defect_type,
        camera_id: camera_id || null,
        coach_number: coach_number || null,
        root_cause: root_cause || null,
        description,
        performed_by,
        performed_at: new Date(performed_at),
        effectiveness: effectiveness || 'unknown',
        notes: notes || null,
      },
    });
    return reply.status(201).send(action);
  });

  // ── PATCH /api/rca/corrective-actions/:id ────────────────────────────────
  fastify.patch('/corrective-actions/:id', async (req, reply) => {
    const { id } = req.params;
    const allowed = ['effectiveness', 'notes', 'root_cause', 'description'];
    const data = {};
    for (const k of allowed) {
      if (req.body && req.body[k] !== undefined) data[k] = req.body[k];
    }
    const updated = await prisma.correctiveAction.update({
      where: { id },
      data,
    });
    return updated;
  });

  // ── POST /api/rca/report/generate ─────────────────────────────────────────
  // Generate a JSON RCA investigation report covering top correlations.
  fastify.post('/report/generate', async (req, reply) => {
    const { defect_type, title } = req.body || {};

    const [correlation, clusters, actions] = await Promise.all([
      // inline: re-run correlation logic
      (async () => {
        const sessions = await prisma.inspectionSession.count({ where: { status: 'completed' } });
        const byCamera = await prisma.$queryRawUnsafe(`
          SELECT c.camera_code, c.position_label, d.defect_type,
                 COUNT(*)::int AS defect_count, COUNT(DISTINCT d.session_id)::int AS session_count
          FROM defects d
          JOIN frames f ON f.id = d.frame_id
          JOIN session_cameras sc ON sc.id = f.session_camera_id
          JOIN cameras c ON c.id = sc.camera_id
          ${defect_type ? `WHERE d.defect_type = $1` : ''}
          GROUP BY c.camera_code, c.position_label, d.defect_type
          ORDER BY defect_count DESC LIMIT 10
        `, ...(defect_type ? [defect_type] : []));
        const byCoach = await prisma.$queryRawUnsafe(`
          SELECT ch.coach_number, ch.coach_type, d.defect_type,
                 COUNT(*)::int AS defect_count, COUNT(DISTINCT d.session_id)::int AS session_count
          FROM defects d
          JOIN coaches ch ON ch.id = d.coach_id
          ${defect_type ? `WHERE d.defect_type = $1` : ''}
          GROUP BY ch.coach_number, ch.coach_type, d.defect_type
          ORDER BY defect_count DESC LIMIT 10
        `, ...(defect_type ? [defect_type] : []));
        return { sessions, byCamera, byCoach };
      })(),
      prisma.$queryRawUnsafe(`
        SELECT d.defect_type, c.camera_code, ch.coach_type,
               COUNT(*)::int AS occurrence_count
        FROM defects d
        JOIN frames f ON f.id = d.frame_id
        JOIN session_cameras sc ON sc.id = f.session_camera_id
        JOIN cameras c ON c.id = sc.camera_id
        JOIN coaches ch ON ch.id = d.coach_id
        ${defect_type ? `WHERE d.defect_type = $1` : ''}
        GROUP BY d.defect_type, c.camera_code, ch.coach_type
        HAVING COUNT(*) >= 2
        ORDER BY occurrence_count DESC LIMIT 20
      `, ...(defect_type ? [defect_type] : [])),
      prisma.correctiveAction.findMany({
        where: defect_type ? { defect_type } : {},
        orderBy: { performed_at: 'desc' },
        take: 20,
      }),
    ]);

    const topCameraIssue = correlation.byCamera[0];
    const topCoachIssue = correlation.byCoach[0];

    const report = {
      title: title || `RCA Report — ${defect_type || 'All Defect Types'}`,
      generated_at: new Date().toISOString(),
      scope: { defect_type: defect_type || 'all', total_sessions_analyzed: correlation.sessions },
      executive_summary: [
        topCameraIssue
          ? `Camera ${topCameraIssue.camera_code} (${topCameraIssue.position_label || 'unknown position'}) shows highest defect concentration: ${Number(topCameraIssue.defect_count)} occurrences of "${topCameraIssue.defect_type}" across ${Number(topCameraIssue.session_count)} sessions — probable hardware/positioning issue.`
          : 'Insufficient camera correlation data.',
        topCoachIssue
          ? `Coach ${topCoachIssue.coach_number} (type: ${topCoachIssue.coach_type || 'unknown'}) is the highest-frequency coach: ${Number(topCoachIssue.defect_count)} "${topCoachIssue.defect_type}" defects — probable manufacturing or wear pattern.`
          : 'Insufficient coach correlation data.',
      ],
      top_camera_correlations: correlation.byCamera.map(r => ({
        ...r,
        defect_count: Number(r.defect_count),
        session_count: Number(r.session_count),
      })),
      top_coach_correlations: correlation.byCoach.map(r => ({
        ...r,
        defect_count: Number(r.defect_count),
        session_count: Number(r.session_count),
      })),
      defect_clusters: clusters.map(r => ({
        ...r,
        occurrence_count: Number(r.occurrence_count),
      })),
      corrective_actions_log: actions,
      disclaimer: 'Correlation ≠ causation. All findings are probable causes based on frequency analysis and require domain expert validation before corrective action.',
    };

    return report;
  });
};
