import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.status(200).json({ status: 'ok', service: 'cse-416-api' });
});

app.use((_request, response) => {
  response.status(404).json({ error: 'Not found' });
});
