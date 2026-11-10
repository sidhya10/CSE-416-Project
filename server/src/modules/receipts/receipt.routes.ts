import { prepareAttachment } from './receipt.attachment.js';
import express, { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth.js';
import { prisma } from '../../config/database.js';
import { parseReceipt, parseGuestReceipt } from './receipt.service.js';
import { putReceiptChunk, readReceiptUpload, startReceiptUpload, uploadClientKey, uploadMetadata, uploadReference } from './receipt.upload.js';

export const receiptsRouter = Router();
const uploadAuth: RequestHandler = (req, res, next) => req.query.guest === 'true' ? next() : requireAuth(req, res, next);
receiptsRouter.post('/uploads', express.json({ limit: '16kb' }), uploadAuth, async (req, res) => {
  const input = uploadMetadata.parse(req.body);
  res.set('Cache-Control', 'no-store').status(201).json(await startReceiptUpload(input, req.userId ?? null, uploadClientKey(req.userId ?? req.ip ?? 'unknown')));
});
receiptsRouter.put('/uploads/:uploadId/chunks/:index', express.json({ limit: '1500kb' }), uploadAuth, async (req, res) => {
  const { uploadToken, base64 } = z.object({ uploadToken: z.string().length(43), base64: z.string().max(1_398_104) }).strict().parse(req.body);
  const index = z.coerce.number().int().min(0).max(11).parse(req.params.index);
  await putReceiptChunk(uploadReference.parse({ uploadId: req.params.uploadId, uploadToken }), req.userId ?? null, index, base64);
  res.status(204).end();
});
const inlineReceipt = z.object({ base64: z.string().min(1).max(16_777_216), mimeType: z.enum(['image/jpeg', 'image/png', 'application/pdf', 'image/heic', 'image/heif']) }).strict();
const receiptInput = z.union([uploadReference, inlineReceipt]);
receiptsRouter.post('/guest/parse', express.json({ limit: '17mb' }), async (req, res) => {
  const input = receiptInput.parse(req.body);
  const receipt = 'uploadId' in input ? await readReceiptUpload(prisma, input, null) : input;
  try { res.set('Cache-Control', 'no-store').json(await parseGuestReceipt(receipt.base64, receipt.mimeType)); }
  finally { if ('uploadId' in input) await prisma.receiptUpload.deleteMany({ where: { id: input.uploadId } }).catch(() => undefined); }
});
receiptsRouter.use(requireAuth);
receiptsRouter.use(['/parse', '/prepare-attachment'], express.json({ limit: '17mb' }));
receiptsRouter.post('/parse', async (req, res) => {
  const input = receiptInput.parse(req.body);
  const receipt = 'uploadId' in input ? await readReceiptUpload(prisma, input, req.userId!) : input;
  try { res.set('Cache-Control', 'no-store').json(await parseReceipt(req.userId!, receipt.base64, receipt.mimeType)); }
  finally { if ('uploadId' in input) await prisma.receiptUpload.deleteMany({ where: { id: input.uploadId } }).catch(() => undefined); }
});
receiptsRouter.post('/prepare-attachment', async (req, res) => {
  const input = z.union([uploadReference, inlineReceipt.extend({ name: z.string().trim().min(1).max(255) })]).parse(req.body);
  const receipt = 'uploadId' in input ? await readReceiptUpload(prisma, input, req.userId!) : input;
  // Large PDFs stay referenced until expense confirmation, avoiding a large response and expense POST.
  if ('uploadId' in input && receipt.mimeType === 'application/pdf') { res.set('Cache-Control', 'no-store').json(input); return; }
  try { res.set('Cache-Control', 'no-store').json(await prepareAttachment(receipt)); }
  finally { if ('uploadId' in input) await prisma.receiptUpload.deleteMany({ where: { id: input.uploadId } }).catch(() => undefined); }
});
