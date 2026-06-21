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

// Real DB row, not a fabricated id — every route that writes req.user.id into a
// UUID FK column (review_status, audit_logs, reports.signed_by, ...) needs a row
// that actually exists. A literal string like 'dev-admin' passes auth but throws
// P2023 (invalid UUID) the moment any handler tries to persist it.
let _devUserCache = null;

async function getDevUser() {
  if (_devUserCache) return _devUserCache;
  const user = await prisma.user.findFirst({ where: { email: 'admin@vande.local' } });
  if (!user) {
    throw new Error("AUTH_ENABLED=false dev bypass needs a seeded 'admin@vande.local' user — run npm run db:seed");
  }
  _devUserCache = { id: user.id, email: user.email, name: user.name, role: user.role };
  return _devUserCache;
}

async function authenticate(request, reply) {
  if (process.env.AUTH_ENABLED !== 'true') {
    request.user = await getDevUser();
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
