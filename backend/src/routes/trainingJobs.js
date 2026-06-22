'use strict';

const prisma = require('../db/client');
const config = require('../config');

const TRAINING_SERVICE = process.env.TRAINING_SERVICE_URL || 'http://localhost:5003';

async function dispatchToGpu(jobId, payload) {
  try {
    const res = await fetch(`${TRAINING_SERVICE}/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, ...payload }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null; // GPU service offline — job stays queued, can be picked up later
  }
}

module.exports = async function trainingJobsRoutes(fastify) {
  // ── GET /api/training/jobs ─────────────────────────────────────────────────
  fastify.get('/jobs', async (req) => {
    const { status, limit = 50, offset = 0 } = req.query;
    const where = status ? { status } : {};
    const [total, jobs] = await Promise.all([
      prisma.trainingJob.count({ where }),
      prisma.trainingJob.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: Math.min(parseInt(limit) || 50, 200),
        skip: parseInt(offset) || 0,
        select: {
          id: true, name: true, dataset_id: true, dataset_name: true,
          base_model: true, epochs: true, batch_size: true,
          learning_rate: true, img_size: true, status: true,
          current_epoch: true, best_map50: true, best_map95: true,
          model_url: true, model_version_id: true, gpu_job_id: true,
          started_at: true, completed_at: true, created_at: true, error_message: true,
        },
      }),
    ]);
    return { total, jobs };
  });

  // ── POST /api/training/jobs ────────────────────────────────────────────────
  fastify.post('/jobs', async (req, reply) => {
    const {
      name, dataset_id, dataset_name, base_model = 'yolov8n.pt',
      epochs = 100, batch_size = 16, learning_rate = 0.01, img_size = 640,
    } = req.body || {};

    if (!name) return reply.status(400).send({ error: 'name is required' });

    const epochsN = parseInt(epochs);
    const batchN  = parseInt(batch_size);
    const lrN     = parseFloat(learning_rate);
    const imgN    = parseInt(img_size);

    if (epochsN < 1 || epochsN > 1000) return reply.status(400).send({ error: 'epochs must be 1–1000' });
    if (batchN < 1 || batchN > 512)    return reply.status(400).send({ error: 'batch_size must be 1–512' });
    if (lrN <= 0 || lrN >= 1)          return reply.status(400).send({ error: 'learning_rate must be in (0, 1)' });

    const job = await prisma.trainingJob.create({
      data: {
        name,
        dataset_id: dataset_id || null,
        dataset_name: dataset_name || null,
        base_model,
        epochs: epochsN,
        batch_size: batchN,
        learning_rate: lrN,
        img_size: imgN,
        status: 'queued',
        created_by: req.user?.id || null,
      },
    });

    // Attempt GPU dispatch (non-blocking — if offline, job stays queued)
    const gpuResp = await dispatchToGpu(job.id, {
      dataset_id, dataset_name, base_model, epochs: epochsN, batch_size: batchN,
      learning_rate: lrN, img_size: imgN,
    });

    if (gpuResp?.job_id) {
      await prisma.trainingJob.update({
        where: { id: job.id },
        data: { gpu_job_id: gpuResp.job_id, status: 'running', started_at: new Date() },
      });
    }

    const fresh = await prisma.trainingJob.findUnique({ where: { id: job.id } });
    return reply.status(201).send(fresh);
  });

  // ── GET /api/training/jobs/:id ─────────────────────────────────────────────
  fastify.get('/jobs/:id', async (req, reply) => {
    const job = await prisma.trainingJob.findUnique({ where: { id: req.params.id } });
    if (!job) return reply.status(404).send({ error: 'Not found' });
    return job;
  });

  // ── POST /api/training/jobs/:id/progress ──────────────────────────────────
  // GPU service (or manual demo) posts epoch metrics here.
  fastify.post('/jobs/:id/progress', async (req, reply) => {
    const job = await prisma.trainingJob.findUnique({ where: { id: req.params.id } });
    if (!job) return reply.status(404).send({ error: 'Not found' });
    if (!['queued', 'running'].includes(job.status)) {
      return reply.status(409).send({ error: `Job is ${job.status}, cannot update progress` });
    }

    const { epoch, box_loss, cls_loss, dfl_loss, precision, recall, map50, map95 } = req.body || {};
    if (epoch === undefined) return reply.status(400).send({ error: 'epoch required' });

    const epochEntry = {
      epoch: parseInt(epoch),
      box_loss: parseFloat(box_loss) || 0,
      cls_loss: parseFloat(cls_loss) || 0,
      dfl_loss: parseFloat(dfl_loss) || 0,
      precision: parseFloat(precision) || 0,
      recall: parseFloat(recall) || 0,
      map50: parseFloat(map50) || 0,
      map95: parseFloat(map95) || 0,
    };

    const existing = Array.isArray(job.metrics_history) ? job.metrics_history : [];
    const history = [...existing.filter(e => e.epoch !== epochEntry.epoch), epochEntry]
      .sort((a, b) => a.epoch - b.epoch);

    const bestMap50 = Math.max(...history.map(e => e.map50 || 0));
    const bestMap95 = Math.max(...history.map(e => e.map95 || 0));

    const updated = await prisma.trainingJob.update({
      where: { id: req.params.id },
      data: {
        current_epoch: epochEntry.epoch,
        metrics_history: history,
        best_map50: bestMap50,
        best_map95: bestMap95,
        status: 'running',
        started_at: job.started_at || new Date(),
      },
    });

    return updated;
  });

  // ── POST /api/training/jobs/:id/complete ──────────────────────────────────
  // GPU service signals training is done + provides model_url.
  fastify.post('/jobs/:id/complete', async (req, reply) => {
    const job = await prisma.trainingJob.findUnique({ where: { id: req.params.id } });
    if (!job) return reply.status(404).send({ error: 'Not found' });

    const { model_url, error } = req.body || {};

    const updated = await prisma.trainingJob.update({
      where: { id: req.params.id },
      data: {
        status: error ? 'failed' : 'completed',
        model_url: model_url || null,
        error_message: error || null,
        completed_at: new Date(),
      },
    });
    return updated;
  });

  // ── PATCH /api/training/jobs/:id/cancel ───────────────────────────────────
  fastify.patch('/jobs/:id/cancel', async (req, reply) => {
    const job = await prisma.trainingJob.findUnique({ where: { id: req.params.id } });
    if (!job) return reply.status(404).send({ error: 'Not found' });
    if (!['queued', 'running'].includes(job.status)) {
      return reply.status(409).send({ error: `Cannot cancel a ${job.status} job` });
    }

    // Tell GPU service to stop if running
    if (job.gpu_job_id) {
      try {
        await fetch(`${TRAINING_SERVICE}/train/${job.gpu_job_id}/cancel`, {
          method: 'POST',
          signal: AbortSignal.timeout(3000),
        });
      } catch { /* GPU service offline — just mark cancelled in DB */ }
    }

    const updated = await prisma.trainingJob.update({
      where: { id: req.params.id },
      data: { status: 'cancelled', completed_at: new Date() },
    });
    return updated;
  });

  // ── POST /api/training/jobs/:id/deploy ────────────────────────────────────
  // Register completed job's model as a new ModelVersion (staging).
  fastify.post('/jobs/:id/deploy', async (req, reply) => {
    const job = await prisma.trainingJob.findUnique({ where: { id: req.params.id } });
    if (!job) return reply.status(404).send({ error: 'Not found' });
    if (job.status !== 'completed') {
      return reply.status(409).send({ error: 'Can only deploy completed jobs' });
    }
    if (!job.model_url) {
      return reply.status(409).send({ error: 'Job has no model_url — cannot deploy' });
    }
    if (job.model_version_id) {
      return reply.status(409).send({ error: 'Already deployed as model version ' + job.model_version_id });
    }

    const { model_name = 'defect_detector', activate = false } = req.body || {};
    const version = `v-${new Date().toISOString().slice(0, 10)}-job-${job.id.slice(0, 8)}`;

    const existing = await prisma.modelVersion.findFirst({
      where: { model_name, status: 'active' },
    });

    const ops = [
      prisma.modelVersion.create({
        data: {
          model_name,
          version,
          weights_url: job.model_url,
          metrics: {
            map50: job.best_map50 ? parseFloat(job.best_map50) : null,
            map95: job.best_map95 ? parseFloat(job.best_map95) : null,
            epochs: job.current_epoch,
            batch_size: job.batch_size,
            learning_rate: parseFloat(job.learning_rate),
          },
          trained_from: job.dataset_id || null,
          status: activate ? 'active' : 'staging',
        },
      }),
    ];

    if (activate && existing) {
      ops.push(prisma.modelVersion.update({ where: { id: existing.id }, data: { status: 'rolled_back' } }));
    }

    const [mv] = await prisma.$transaction(ops);

    await prisma.trainingJob.update({
      where: { id: job.id },
      data: { model_version_id: mv.id },
    });

    return reply.status(201).send({ model_version: mv, activated: activate });
  });

  // ── DELETE /api/training/jobs/:id ─────────────────────────────────────────
  fastify.delete('/jobs/:id', async (req, reply) => {
    const job = await prisma.trainingJob.findUnique({ where: { id: req.params.id } });
    if (!job) return reply.status(404).send({ error: 'Not found' });
    if (job.status === 'running') {
      return reply.status(409).send({ error: 'Cancel the job before deleting' });
    }
    await prisma.trainingJob.delete({ where: { id: req.params.id } });
    return reply.status(204).send();
  });
};
