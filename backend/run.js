require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const app = require('./src/app');
const config = require('./src/config');
const { startScheduler } = require('./src/services/periodicReportScheduler');

app.listen({ port: config.port, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`VandeInspect API running at ${address}`);
  startScheduler(app.log);
});
