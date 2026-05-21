const path = require('path');
const ROOT_CONFIG = require(path.join(__dirname, '..', '..', '..', 'config.json'));

async function configRoutes(fastify) {
  // GET /api/config — returns pipeline config for the frontend to use as defaults
  fastify.get('/', async () => ({
    pipeline: ROOT_CONFIG.pipeline,
    upload:   ROOT_CONFIG.upload,
  }));
}

module.exports = configRoutes;
