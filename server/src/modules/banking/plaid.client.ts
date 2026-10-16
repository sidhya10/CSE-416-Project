import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { env } from '../../config/env.js';

export class BankingError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

let client: PlaidApi | undefined;

export function plaid() {
  if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) throw new BankingError('Bank connections are not configured on this server', 503);
  client ??= new PlaidApi(new Configuration({
    basePath: PlaidEnvironments[env.PLAID_ENV],
    baseOptions: { headers: { 'PLAID-CLIENT-ID': env.PLAID_CLIENT_ID, 'PLAID-SECRET': env.PLAID_SECRET } },
  }));
  return client;
}

export function plaidErrorCode(error: unknown): string | undefined {
  return (error as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
}
