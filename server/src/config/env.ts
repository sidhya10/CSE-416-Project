import { config } from 'dotenv';
import { z } from 'zod';

config({ path: process.env.ENV_FILE ?? '../.env' });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must contain at least 32 characters'),
  AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: z.preprocess(value => value || undefined, z.string().url().refine(value => { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && url.hostname.endsWith('.cognitiveservices.azure.com'); }, 'Use the HTTPS endpoint from your Azure Document Intelligence resource').optional()),
  AZURE_DOCUMENT_INTELLIGENCE_KEY: z.preprocess(value => value || undefined, z.string().min(1).optional()),
  RECEIPT_MONTHLY_PAGE_LIMIT: z.coerce.number().int().min(0).max(500).default(450),
  RECEIPT_DAILY_USER_LIMIT: z.coerce.number().int().min(0).max(100).default(20),
  GOOGLE_CLIENT_ID: z.preprocess(value => value || process.env.VITE_GOOGLE_CLIENT_ID || undefined, z.string().trim().min(1).optional()),
  PLAID_CLIENT_ID: z.preprocess(value => value || undefined, z.string().min(1).optional()),
  PLAID_SECRET: z.preprocess(value => value || undefined, z.string().min(1).optional()),
  PLAID_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  // Optional dedicated key for encrypting Plaid access tokens; falls back to a key derived from JWT_SECRET.
  BANK_TOKEN_KEY: z.preprocess(value => value || undefined, z.string().min(32).optional()),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', z.treeifyError(parsed.error));
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
