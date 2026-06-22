const prisma = require('../db/client');

const ASSET_TYPES = ['Camera', 'Edge PC', 'UPS', 'Network Switch', 'GPU Server', 'Sensor', 'Other'];

async function assets(fastify) {
  // GET /api/assets/overdue — must register before /:id to avoid route conflict
  fastify.get('/overdue', async () => {
    const now = new Date();
    const overdue = await prisma.asset.findMany({
      where: {
        status: { notIn: ['retired'] },
        next_maintenance_at: { lt: now, not: null },
      },
      orderBy: { next_maintenance_at: 'asc' },
      include: { maintenance_logs: { orderBy: { performed_at: 'desc' }, take: 1 } },
    });
    return {
      overdue: overdue.map((a) => ({
        ...a,
        days_overdue: Math.floor((now - new Date(a.next_maintenance_at)) / 86400000),
      })),
      count: overdue.length,
    };
  });

  // GET /api/assets/types — available asset types
  fastify.get('/types', async () => ({ types: ASSET_TYPES }));

  // GET /api/assets?status=&asset_type=&limit=&offset=
  fastify.get('/', async (req) => {
    const { status, asset_type, limit = 100, offset = 0 } = req.query;
    const where = {};
    if (status)     where.status     = status;
    if (asset_type) where.asset_type = asset_type;

    const [items, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        orderBy: { name: 'asc' },
        take: Math.min(parseInt(limit, 10), 500),
        skip: parseInt(offset, 10),
        include: {
          maintenance_logs: {
            orderBy: { performed_at: 'desc' },
            take: 1,
            select: { performed_at: true, description: true, next_due_at: true },
          },
        },
      }),
      prisma.asset.count({ where }),
    ]);

    const now = new Date();
    return {
      assets: items.map((a) => ({
        ...a,
        is_overdue: a.next_maintenance_at && a.status !== 'retired'
          ? new Date(a.next_maintenance_at) < now
          : false,
      })),
      total,
    };
  });

  // POST /api/assets
  fastify.post('/', async (req, reply) => {
    const { asset_type, name, serial_number, location, installation_date, next_maintenance_at, notes, status } = req.body || {};
    if (!name)       return reply.status(400).send({ error: 'name required' });
    if (!asset_type) return reply.status(400).send({ error: 'asset_type required' });

    const asset = await prisma.asset.create({
      data: {
        asset_type,
        name,
        serial_number:       serial_number      || null,
        location:             location           || null,
        installation_date:    installation_date  ? new Date(installation_date)  : null,
        next_maintenance_at:  next_maintenance_at ? new Date(next_maintenance_at) : null,
        notes:                notes              || null,
        status:               status             || 'active',
      },
    });
    reply.status(201).send({ asset });
  });

  // GET /api/assets/:id
  fastify.get('/:id', async (req, reply) => {
    const asset = await prisma.asset.findUnique({
      where: { id: req.params.id },
      include: {
        maintenance_logs: { orderBy: { performed_at: 'desc' } },
      },
    });
    if (!asset) return reply.status(404).send({ error: 'Asset not found' });
    return { asset };
  });

  // PATCH /api/assets/:id
  fastify.patch('/:id', async (req, reply) => {
    const existing = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.status(404).send({ error: 'Asset not found' });

    const { asset_type, name, serial_number, location, installation_date, next_maintenance_at, last_maintenance_at, notes, status } = req.body || {};
    const data = {};
    if (asset_type          !== undefined) data.asset_type          = asset_type;
    if (name                !== undefined) data.name                = name;
    if (serial_number       !== undefined) data.serial_number       = serial_number || null;
    if (location            !== undefined) data.location            = location || null;
    if (installation_date   !== undefined) data.installation_date   = installation_date  ? new Date(installation_date)  : null;
    if (next_maintenance_at !== undefined) data.next_maintenance_at = next_maintenance_at ? new Date(next_maintenance_at) : null;
    if (last_maintenance_at !== undefined) data.last_maintenance_at = last_maintenance_at ? new Date(last_maintenance_at) : null;
    if (notes               !== undefined) data.notes               = notes || null;
    if (status              !== undefined) data.status              = status;

    const updated = await prisma.asset.update({ where: { id: req.params.id }, data });
    return { asset: updated };
  });

  // DELETE /api/assets/:id — retires the asset (soft) or hard-deletes
  fastify.delete('/:id', async (req, reply) => {
    const existing = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.status(404).send({ error: 'Asset not found' });
    const hard = req.query.hard === 'true';
    if (hard) {
      await prisma.asset.delete({ where: { id: req.params.id } });
    } else {
      await prisma.asset.update({ where: { id: req.params.id }, data: { status: 'retired' } });
    }
    reply.status(204).send();
  });

  // POST /api/assets/:id/maintenance-log
  fastify.post('/:id/maintenance-log', async (req, reply) => {
    const existing = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.status(404).send({ error: 'Asset not found' });

    const { performed_by, performed_at, description, next_due_at } = req.body || {};
    const performedDate = performed_at ? new Date(performed_at) : new Date();

    const [log] = await prisma.$transaction([
      prisma.maintenanceLog.create({
        data: {
          asset_id:     req.params.id,
          performed_by: performed_by || null,
          performed_at: performedDate,
          description:  description  || null,
          next_due_at:  next_due_at  ? new Date(next_due_at) : null,
        },
      }),
      prisma.asset.update({
        where: { id: req.params.id },
        data: {
          last_maintenance_at: performedDate,
          next_maintenance_at: next_due_at ? new Date(next_due_at) : undefined,
        },
      }),
    ]);

    reply.status(201).send({ log });
  });

  // GET /api/assets/:id/maintenance-log
  fastify.get('/:id/maintenance-log', async (req, reply) => {
    const existing = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.status(404).send({ error: 'Asset not found' });

    const logs = await prisma.maintenanceLog.findMany({
      where: { asset_id: req.params.id },
      orderBy: { performed_at: 'desc' },
    });
    return { logs };
  });
}

module.exports = assets;
