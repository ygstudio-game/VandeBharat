const prisma = require('../db/client');
const axios = require('axios');
const archiver = require('archiver');
const cloudinary = require('../services/cloudinaryService');
const { logAction } = require('../services/auditLog');

async function datasets(fastify) {
  // GET /api/datasets — list all datasets
  fastify.get('/', async (req) => {
    const { status = 'active', source } = req.query;
    const where = {};
    if (status !== 'all') where.status = status;
    if (source) where.source = source;

    const rows = await prisma.dataset.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });

    const stats = await prisma.dataset.aggregate({
      where: { status: 'active' },
      _sum: { image_count: true, annotation_count: true },
      _count: { id: true },
    });

    const allClasses = rows.flatMap((r) => (Array.isArray(r.class_list) ? r.class_list : []));
    const uniqueClasses = [...new Set(allClasses)];

    return {
      datasets: rows,
      summary: {
        total:       stats._count.id,
        images:      stats._sum.image_count ?? 0,
        annotations: stats._sum.annotation_count ?? 0,
        classes:     uniqueClasses.length,
      },
    };
  });

  // POST /api/datasets — register a dataset manually
  fastify.post('/', async (req, reply) => {
    const { name, version, description, source = 'manual', class_list, image_count, annotation_count, storage_url } = req.body ?? {};
    if (!name || !version) return reply.status(400).send({ error: 'name and version required' });

    const dataset = await prisma.dataset.create({
      data: {
        name,
        version,
        description,
        source,
        class_list:       class_list ?? [],
        image_count:      image_count ?? 0,
        annotation_count: annotation_count ?? 0,
        storage_url,
        created_by: req.user?.id ?? null,
      },
    });

    await logAction({
      userId: req.user?.id, action: 'DATASET_REGISTERED', resourceType: 'Dataset',
      resourceId: dataset.id, ip: req.ip,
      metadata: { name, version, source, image_count: dataset.image_count },
    });

    reply.status(201);
    return dataset;
  });

  // GET /api/datasets/:id — single dataset
  fastify.get('/:id', async (req, reply) => {
    const dataset = await prisma.dataset.findUnique({ where: { id: req.params.id } });
    if (!dataset) return reply.status(404).send({ error: 'Dataset not found' });
    return dataset;
  });

  // PATCH /api/datasets/:id — update metadata
  fastify.patch('/:id', async (req, reply) => {
    const { name, version, description, class_list, image_count, annotation_count, storage_url, status } = req.body ?? {};
    const dataset = await prisma.dataset.findUnique({ where: { id: req.params.id } });
    if (!dataset) return reply.status(404).send({ error: 'Dataset not found' });

    const updated = await prisma.dataset.update({
      where: { id: req.params.id },
      data: {
        ...(name            !== undefined && { name }),
        ...(version         !== undefined && { version }),
        ...(description     !== undefined && { description }),
        ...(class_list      !== undefined && { class_list }),
        ...(image_count     !== undefined && { image_count }),
        ...(annotation_count !== undefined && { annotation_count }),
        ...(storage_url     !== undefined && { storage_url }),
        ...(status          !== undefined && { status }),
      },
    });

    return updated;
  });

  // DELETE /api/datasets/:id — archive (soft) or hard delete
  fastify.delete('/:id', async (req, reply) => {
    const hard = req.query.hard === 'true';
    const dataset = await prisma.dataset.findUnique({ where: { id: req.params.id } });
    if (!dataset) return reply.status(404).send({ error: 'Dataset not found' });

    if (hard) {
      await prisma.dataset.delete({ where: { id: req.params.id } });
    } else {
      await prisma.dataset.update({ where: { id: req.params.id }, data: { status: 'archived' } });
    }

    await logAction({
      userId: req.user?.id, action: hard ? 'DATASET_DELETED' : 'DATASET_ARCHIVED',
      resourceType: 'Dataset', resourceId: req.params.id, ip: req.ip,
    });

    reply.status(204).send();
  });

  // POST /api/datasets/from-export — generate YOLO dataset from confirmed defects + auto-register
  fastify.post('/from-export', async (req, reply) => {
    const { name, description, version } = req.body ?? {};

    const defects = await prisma.defect.findMany({
      where: { review_status: 'confirmed' },
      include: { frame: { select: { cloudinary_url: true, width_px: true, height_px: true } } },
    });

    const usable = defects.filter((d) => d.bbox_x != null && d.frame?.width_px && d.frame?.height_px);
    if (usable.length === 0) {
      return reply.status(422).send({ error: 'No confirmed defects with bbox + frame dimensions. Review and confirm defects first.' });
    }

    const classNames = [...new Set(usable.map((d) => d.defect_type))].sort();
    const classIndex = new Map(classNames.map((n, i) => [n, i]));

    // Build ZIP in memory, upload to Cloudinary as raw
    const archive = archiver('zip', { zlib: { level: 6 } });
    const chunks = [];
    archive.on('data', (chunk) => chunks.push(chunk));

    archive.append(classNames.join('\n'), { name: 'classes.txt' });

    let included = 0;
    for (const d of usable) {
      try {
        const resp = await axios.get(d.frame.cloudinary_url, { responseType: 'arraybuffer', timeout: 15000 });
        archive.append(Buffer.from(resp.data), { name: `images/${d.id}.jpg` });
        const fw = d.frame.width_px, fh = d.frame.height_px;
        const cx = (d.bbox_x + d.bbox_w / 2) / fw;
        const cy = (d.bbox_y + d.bbox_h / 2) / fh;
        const w  = d.bbox_w / fw;
        const h  = d.bbox_h / fh;
        archive.append(`${classIndex.get(d.defect_type)} ${cx.toFixed(6)} ${cy.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}\n`, {
          name: `labels/${d.id}.txt`,
        });
        included++;
      } catch (err) {
        req.log.warn({ msg: 'Skipping defect in dataset export', defect_id: d.id, error: err.message });
      }
    }

    await archive.finalize();
    const zipBuffer = Buffer.concat(chunks);

    const exportId = `dataset-export-${Date.now()}`;
    let storageUrl = null;
    try {
      const b64 = zipBuffer.toString('base64');
      const upload = await cloudinary.uploader.upload(
        `data:application/zip;base64,${b64}`,
        { resource_type: 'raw', folder: 'vande/datasets', public_id: exportId },
      );
      storageUrl = upload.secure_url;
    } catch (err) {
      req.log.warn({ msg: 'Cloudinary upload failed, registering dataset without storage_url', error: err.message });
    }

    const dsName    = name    || `YOLO Export ${new Date().toISOString().slice(0, 10)}`;
    const dsVersion = version || `v${Date.now()}`;

    const dataset = await prisma.dataset.create({
      data: {
        name:             dsName,
        version:          dsVersion,
        description:      description || `Auto-generated from ${included} confirmed defects`,
        source:           'auto_export',
        class_list:       classNames,
        image_count:      included,
        annotation_count: included,
        storage_url:      storageUrl,
        export_id:        exportId,
        created_by:       req.user?.id ?? null,
      },
    });

    await logAction({
      userId: req.user?.id, action: 'DATASET_EXPORTED', resourceType: 'Dataset',
      resourceId: dataset.id, ip: req.ip,
      metadata: { image_count: included, class_count: classNames.length, export_id: exportId },
    });

    reply.status(201);
    return { dataset, image_count: included, class_count: classNames.length, storage_url: storageUrl };
  });
}

module.exports = datasets;
