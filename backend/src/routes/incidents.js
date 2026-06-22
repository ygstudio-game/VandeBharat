const prisma = require('../db/client');

async function incidents(fastify) {
  // GET /api/incidents?status=&severity=&limit=&offset=
  fastify.get('/', async (req) => {
    const { status, severity, limit = 50, offset = 0 } = req.query;
    const where = {};
    if (status)   where.status   = status;
    if (severity) where.severity = severity;

    const [items, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: Math.min(parseInt(limit, 10), 200),
        skip: parseInt(offset, 10),
      }),
      prisma.incident.count({ where }),
    ]);

    return { incidents: items, total };
  });

  // GET /api/incidents/summary — counts by status + severity
  fastify.get('/summary', async () => {
    const [byStatus, bySeverity] = await Promise.all([
      prisma.incident.groupBy({ by: ['status'],   _count: { id: true } }),
      prisma.incident.groupBy({ by: ['severity'], _count: { id: true } }),
    ]);

    const statusMap = { open: 0, in_progress: 0, resolved: 0 };
    for (const row of byStatus) statusMap[row.status] = row._count.id;

    const severityMap = { P1: 0, P2: 0, P3: 0 };
    for (const row of bySeverity) severityMap[row.severity] = row._count.id;

    return { by_status: statusMap, by_severity: severityMap };
  });

  // POST /api/incidents
  fastify.post('/', async (req, reply) => {
    const { title, severity, description, assigned_to } = req.body || {};
    if (!title)    return reply.status(400).send({ error: 'title required' });
    if (!severity || !['P1', 'P2', 'P3'].includes(severity))
      return reply.status(400).send({ error: 'severity must be P1|P2|P3' });

    const incident = await prisma.incident.create({
      data: {
        title,
        severity,
        description: description || null,
        assigned_to: assigned_to || null,
        created_by:  req.user?.id || null,
      },
    });

    reply.status(201).send({ incident });
  });

  // PATCH /api/incidents/:id
  fastify.patch('/:id', async (req, reply) => {
    const { id } = req.params;
    const { status, assigned_to, description } = req.body || {};

    const existing = await prisma.incident.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Incident not found' });

    const data = {};
    if (status) {
      const valid = ['open', 'in_progress', 'resolved'];
      if (!valid.includes(status))
        return reply.status(400).send({ error: 'status must be open|in_progress|resolved' });
      data.status = status;
      if (status === 'resolved') data.resolved_at = new Date();
      else if (status !== 'resolved') data.resolved_at = null;
    }
    if (assigned_to !== undefined) data.assigned_to = assigned_to || null;
    if (description !== undefined) data.description = description || null;

    const updated = await prisma.incident.update({ where: { id }, data });
    return { incident: updated };
  });

  // DELETE /api/incidents/:id
  fastify.delete('/:id', async (req, reply) => {
    const { id } = req.params;
    const existing = await prisma.incident.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Incident not found' });
    await prisma.incident.delete({ where: { id } });
    reply.status(204).send();
  });
}

module.exports = incidents;
