import { prepareAttachment } from './receipt.attachment.js';
import express, { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth.js';
import { parseReceipt } from './receipt.service.js';

export const receiptsRouter = Router();
receiptsRouter.use(requireAuth);
receiptsRouter.use(['/parse', '/prepare-attachment'], express.json({ limit: '17mb' }));
receiptsRouter.post('/parse', async (req, res) => {
  const input = z.object({ base64: z.string().min(1).max(16_777_216), mimeType: z.enum(['image/jpeg', 'image/png', 'application/pdf', 'image/heic', 'image/heif']) }).strict().parse(req.body);
  res.set('Cache-Control', 'no-store');
  res.json(await parseReceipt(req.userId!, input.base64, input.mimeType));
});

receiptsRouter.post('/prepare-attachment', async (req, res) => {
  const input = z.object({ name: z.string().trim().min(1).max(255), base64: z.string().min(1).max(16_777_216), mimeType: z.enum(['image/jpeg', 'image/png', 'application/pdf', 'image/heic', 'image/heif']) }).strict().parse(req.body);
  res.set('Cache-Control', 'no-store').json(await prepareAttachment(input));
});
