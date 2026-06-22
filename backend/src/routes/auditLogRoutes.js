const prisma = require('../db/client');
const { authenticate, requireRole } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');

function buildWhere({ user_id, action, date_from, date_to }) {
  const where = {};
  if (user_id)   where.user_id = user_id;
  if (action)    where.action  = action;
  if (date_from || date_to) {
    where.created_at = {};
    if (date_from) where.created_at.gte = new Date(date_from);
    if (date_to)   where.created_at.lte = new Date(date_to + 'T23:59:59Z');
  }
  return where;
}

function formatRow(l) {
  return {
    id:            l.id,
    action:        l.action,
    resource_type: l.resource_type,
    resource_id:   l.resource_id,
    actor_name:    l.user?.name  || 'system',
    actor_email:   l.user?.email || '',
    actor_role:    l.user?.role  || '',
    ip_address:    l.ip_address,
    metadata:      l.metadata,
    created_at:    l.created_at,
  };
}

async function auditLogRoutes(fastify) {
  const INCLUDE = { user: { select: { name: true, email: true, role: true } } };

  // GET /api/audit-log — paginated, filterable
  fastify.get('/', { preHandler: [requireRole(ROLES.ADMIN)] }, async (req) => {
    const limit  = Math.min(parseInt(req.query.limit,  10) || 50,  200);
    const page   = Math.max(parseInt(req.query.page,   10) || 1,   1);
    const offset = (page - 1) * limit;
    const where  = buildWhere(req.query);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
        include: INCLUDE,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      logs: logs.map(formatRow),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  });

  // GET /api/audit-log/actions — distinct action types for filter dropdown
  fastify.get('/actions', { preHandler: [requireRole(ROLES.ADMIN)] }, async () => {
    const rows = await prisma.auditLog.findMany({
      select: { action: true },
      distinct: ['action'],
      orderBy: { action: 'asc' },
    });
    return { actions: rows.map((r) => r.action) };
  });

  // GET /api/audit-log/export — CSV download
  fastify.get('/export', { preHandler: [requireRole(ROLES.ADMIN)] }, async (req, reply) => {
    const where = buildWhere(req.query);

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 10000,
      include: INCLUDE,
    });

    const header = 'timestamp,user_email,user_role,action,resource_type,resource_id,ip_address,metadata\n';
    const escape = (v) => {
      if (v == null) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows = logs.map((l) => [
      l.created_at.toISOString(),
      l.user?.email  || '',
      l.user?.role   || '',
      l.action,
      l.resource_type || '',
      l.resource_id   || '',
      l.ip_address    || '',
      l.metadata ? JSON.stringify(l.metadata) : '',
    ].map(escape).join(','));

    const csv = header + rows.join('\n');
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="audit_log_${Date.now()}.csv"`);
    return reply.send(csv);
  });
}

module.exports = auditLogRoutes;
