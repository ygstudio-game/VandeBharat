const bcrypt = require('bcryptjs');
const prisma = require('../db/client');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../services/auditLog');
const { ROLES } = require('../constants/roles');

const SAFE_SELECT = {
  id: true, email: true, name: true, role: true, is_active: true,
  totp_enabled: true, last_login_at: true, created_at: true,
};

async function usersRoutes(fastify) {
  // authenticate runs at the parent plugin level (app.js protectedApi scope).
  // This hook adds the additional ADMIN role guard on top.
  fastify.addHook('preHandler', requireRole(ROLES.ADMIN));

  // GET /api/users
  fastify.get('/', async () => {
    const users = await prisma.user.findMany({ select: SAFE_SELECT, orderBy: { created_at: 'asc' } });
    return { users };
  });

  // POST /api/users — create a new user
  fastify.post('/', async (req, reply) => {
    const { email, name, password, role } = req.body || {};
    if (!email || !name || !password || !role) {
      reply.status(400);
      return { error: 'email, name, password, and role are required' };
    }
    if (!Object.values(ROLES).includes(role)) {
      reply.status(400);
      return { error: `role must be one of: ${Object.values(ROLES).join(', ')}` };
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, name, password_hash, role },
      select: SAFE_SELECT,
    });

    await logAction({ userId: req.user.id, action: 'USER_CREATED', resourceType: 'User', resourceId: user.id, ip: req.ip, metadata: { role } });
    reply.status(201);
    return { user };
  });

  // PATCH /api/users/:id/role
  fastify.patch('/:id/role', async (req, reply) => {
    const { role } = req.body || {};
    if (!Object.values(ROLES).includes(role)) {
      reply.status(400);
      return { error: `role must be one of: ${Object.values(ROLES).join(', ')}` };
    }

    const before = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true } });
    if (!before) {
      reply.status(404);
      return { error: 'User not found' };
    }

    const user = await prisma.user.update({ where: { id: req.params.id }, data: { role }, select: SAFE_SELECT });
    await logAction({
      userId: req.user.id, action: 'ROLE_CHANGED', resourceType: 'User', resourceId: user.id, ip: req.ip,
      metadata: { from: before.role, to: role },
    });
    return { user };
  });

  // PATCH /api/users/:id/active — enable/disable an account
  fastify.patch('/:id/active', async (req, reply) => {
    const { is_active } = req.body || {};
    if (typeof is_active !== 'boolean') {
      reply.status(400);
      return { error: 'is_active must be a boolean' };
    }

    const user = await prisma.user.update({ where: { id: req.params.id }, data: { is_active }, select: SAFE_SELECT });
    await logAction({
      userId: req.user.id, action: is_active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      resourceType: 'User', resourceId: user.id, ip: req.ip,
    });
    return { user };
  });
}

module.exports = usersRoutes;
