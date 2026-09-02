import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { gradeRouter } from './routes/grade.js';
import { getGradingProvider } from './grading/index.js';

const app = express();
const port = Number(process.env.PORT) || 8787;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, gradingProvider: getGradingProvider().name });
});

app.use('/api/grade', gradeRouter);

app.listen(port, () => {
  console.log(`server listening on :${port} (grading provider: ${getGradingProvider().name})`);
});
