/**
 * Append-only audit trail. Never call update/delete against AuditLog rows
 * from application code — this table exists specifically so a real mutating
 * action (login, role change, sign-off) can't be silently undone or hidden.
 */
const prisma = require('../db/client');

async function logAction({ userId = null, sessionId = null, action, resourceType = null, resourceId = null, ip = null, metadata = null }) {
  try {
    await prisma.auditLog.create({
      data: {
        user_id: userId,
        session_id: sessionId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        ip_address: ip,
        metadata: metadata ?? undefined,
      },
    });
  } catch (err) {
    // Audit logging must never break the primary action — log and move on.
    console.error({ msg: 'Failed to write audit log', action, error: err.message });
  }
}

module.exports = { logAction };
