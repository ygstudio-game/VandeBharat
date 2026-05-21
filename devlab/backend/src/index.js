require('dotenv').config();
const express = require('express');
const cors = require('cors');

const sessionsRouter = require('./routes/sessions');
const ocrRouter = require('./routes/ocr');
const syncRouter = require('./routes/sync');
const yoloRouter = require('./routes/yolo');

const app = express();
const PORT = process.env.PORT || 8002;

app.use(cors());
app.use(express.json());

app.get('/health', (_, res) => res.json({ status: 'ok', port: PORT }));

app.use('/api/dev/sessions', sessionsRouter);
app.use('/api/dev/ocr', ocrRouter);
app.use('/api/dev/sync', syncRouter);
app.use('/api/dev/yolo', yoloRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => console.log(`DevLab backend running on port ${PORT}`));
