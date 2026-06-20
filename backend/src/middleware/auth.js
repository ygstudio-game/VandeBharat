/**
 * Real backend auth enforcement — previously RBAC/2FA existed only as a
 * frontend preview (Settings.jsx had an explicit "no backend enforcement"
 * disclosure banner). These two preHandlers are what close that gap.
 *
 * Set AUTH_ENABLED=true in .env to enforce JWT checks on all protected routes.
 * When unset (default in dev), a mock admin user is attached so routes still
 * function without a login flow — emergency rollback: set AUTH_ENABLED=false.
 */
const { verifyToken } = require('../auth/jwt');
const prisma = require('../db/client');

async function authenticate(request, reply) {
  if (process.env.AUTH_ENABLED !== 'true') {
    request.user = { id: 'dev-admin', email: 'admin@vande.local', name: 'Dev Admin', role: 'admin' };
    return;
  }

  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    reply.status(401);
    throw new Error('Missing Authorization bearer token');
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    reply.status(401);
    throw new Error('Invalid or expired token');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.is_active) {
    reply.status(401);
    throw new Error('User not found or deactivated');
  }

  request.user = { id: user.id, email: user.email, name: user.name, role: user.role };
}

function requireRole(...allowedRoles) {
  return async function (request, reply) {
    if (!request.user) {
      reply.status(401);
      throw new Error('Authentication required before role check');
    }
    if (!allowedRoles.includes(request.user.role)) {
      reply.status(403);
      throw new Error(`Role '${request.user.role}' is not permitted to perform this action`);
    }
  };
}

module.exports = { authenticate, requireRole };
