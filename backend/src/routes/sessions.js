// Phase 1: implement upload, list, get session
async function sessions(fastify) {
  fastify.get('/', async () => ({ sessions: [], total: 0 }));
  fastify.get('/:id', async (req) => ({ id: req.params.id }));
}

module.exports = sessions;
