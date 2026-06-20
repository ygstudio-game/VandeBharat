const prisma = require('../db/client');
const { authenticate, requireRole } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');

async function auditLogRoutes(fastify) {
  // GET /api/audit-log — admin-only read of the append-only trail.
  fastify.get('/', { preHandler: [authenticate, requireRole(ROLES.ADMIN)] }, async (req) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const logs = await prisma.auditLog.findMany({
      orderBy: { created_at: 'desc' },
      take: limit,
      include: { user: { select: { name: true, email: true, role: true } } },
    });
    return {
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        resource_type: l.resource_type,
        resource_id: l.resource_id,
        actor: l.user ? `${l.user.name} (${l.user.role})` : 'system',
        ip_address: l.ip_address,
        metadata: l.metadata,
        created_at: l.created_at,
      })),
    };
  });
}

module.exports = auditLogRoutes;
