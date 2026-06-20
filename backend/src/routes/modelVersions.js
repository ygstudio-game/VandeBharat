/**
 * Model registry — staging/active/rolled_back lifecycle for retrained weights.
 * GPU/yolo/model_manager.py reads the 'active' row per model_name at startup;
 * promoting or rolling back a model is a DB write here, not a file copy +
 * manual restart on the GPU box.
 */
const prisma = require('../db/client');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../services/auditLog');
const { ROLES } = require('../constants/roles');

async function modelVersionRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireRole(ROLES.ADMIN));

  // GET /api/models?model_name=defect_detector
  fastify.get('/', async (req) => {
    const where = req.query.model_name ? { model_name: req.query.model_name } : {};
    const versions = await prisma.modelVersion.findMany({ where, orderBy: { created_at: 'desc' } });
    return { versions };
  });

  // POST /api/models — register a newly (manually) retrained version as 'staging'
  fastify.post('/', async (req, reply) => {
    const { model_name, version, weights_url, metrics, trained_from } = req.body || {};
    if (!model_name || !version || !weights_url) {
      reply.status(400);
      return { error: 'model_name, version, and weights_url are required' };
    }

    const row = await prisma.modelVersion.create({
      data: { model_name, version, weights_url, metrics: metrics ?? undefined, trained_from: trained_from || null, status: 'staging' },
    });

    await logAction({
      userId: req.user.id, action: 'MODEL_VERSION_REGISTERED', resourceType: 'ModelVersion',
      resourceId: row.id, ip: req.ip, metadata: { model_name, version },
    });

    reply.status(201);
    return { version: row };
  });

  // PATCH /api/models/:id/activate — promotes this version, demotes the previously
  // active version (of the same model_name) to 'rolled_back'. Calling this again
  // on an older version is exactly how a rollback works — no separate endpoint needed.
  fastify.patch('/:id/activate', async (req, reply) => {
    const target = await prisma.modelVersion.findUnique({ where: { id: req.params.id } });
    if (!target) {
      reply.status(404);
      return { error: 'Model version not found' };
    }

    const previousActive = await prisma.modelVersion.findFirst({
      where: { model_name: target.model_name, status: 'active', NOT: { id: target.id } },
    });

    await prisma.$transaction([
      ...(previousActive
        ? [prisma.modelVersion.update({ where: { id: previousActive.id }, data: { status: 'rolled_back' } })]
        : []),
      prisma.modelVersion.update({ where: { id: target.id }, data: { status: 'active' } }),
    ]);

    await logAction({
      userId: req.user.id, action: 'MODEL_VERSION_ACTIVATED', resourceType: 'ModelVersion',
      resourceId: target.id, ip: req.ip,
      metadata: { model_name: target.model_name, version: target.version, previous_active_version: previousActive?.version || null },
    });

    const updated = await prisma.modelVersion.findUnique({ where: { id: target.id } });
    return { version: updated, demoted: previousActive?.version || null };
  });
}

module.exports = modelVersionRoutes;
