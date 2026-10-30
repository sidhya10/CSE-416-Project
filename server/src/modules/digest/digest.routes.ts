import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { sampleDigest } from './digest.sample.js';
import { buildWeeklyDigest, isDigestEmpty, type Digest } from './digest.service.js';
import { digestSubject, renderDigestHtml, renderDigestText } from './digest.template.js';

// Local preview of the weekly email. app.ts mounts this router outside production only, and nothing here sends mail.
export const digestRouter = Router();

const query = z.object({
  format: z.enum(['html', 'text', 'json']).default('html'),
  // Builds the email as if it were sent at this moment, for example 2026-10-30T14:00:00Z.
  now: z.iso.datetime().optional(),
});

function respond(request: Request, response: Response, digest: Digest) {
  const { format } = query.parse(request.query);
  const options = { appOrigin: env.APP_ORIGIN };
  response.setHeader('Cache-Control', 'no-store');
  if (format === 'json') { response.json({ subject: digestSubject(digest), empty: isDigestEmpty(digest), digest }); return; }
  if (format === 'text') { response.type('text/plain').send(renderDigestText(digest, options)); return; }
  response.type('text/html').send(renderDigestHtml(digest, options));
}

// The wireframe's numbers: needs no account, so the design can be reviewed on its own.
digestRouter.get('/sample', (request, response) => respond(request, response, sampleDigest));

// The signed-in user's real email for this week. Users with nothing to show get the note the scheduler would skip them with.
digestRouter.get('/preview', requireAuth, async (request, response) => {
  const { now } = query.parse(request.query);
  const digest = await buildWeeklyDigest(request.userId!, now ? new Date(now) : new Date());
  if (isDigestEmpty(digest) && query.parse(request.query).format === 'html') {
    response.type('text/html').send('<p style="font-family:sans-serif;padding:24px">Nothing to report this week, so no email would be sent. Add <code>?format=json</code> to see the data.</p>');
    return;
  }
  respond(request, response, digest);
});
