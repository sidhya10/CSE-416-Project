import { z } from 'zod';

export const receiptResult = z.object({
  merchant: z.string(),
  items: z.array(z.object({ name: z.string(), unitPriceCents: z.number().int().nullable(), quantity: z.number().int() })),
  taxCents: z.number().int(), tipCents: z.number().int(), totalCents: z.number().int().nullable(),
  warnings: z.array(z.string()),
});
export type ReceiptResult = z.infer<typeof receiptResult>;
type Field = { valueString?: string; valueNumber?: number; valueCurrency?: { amount?: number; currencyCode?: string }; valueArray?: Field[]; valueObject?: Record<string, Field>; confidence?: number };
export type AzureResult = { documents?: { fields?: Record<string, Field> }[] };
const amount = (field?: Field) => {
  const value = field?.valueCurrency?.amount ?? field?.valueNumber;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000 ? Math.round(value * 100) : null;
};

export function normalizeReceipt(result: AzureResult): ReceiptResult {
  const fields = result.documents?.[0]?.fields ?? {};
  const warnings = new Set<string>(['Review all extracted values against your receipt before saving. Only the first page is scanned.']);
  if ((result.documents?.length ?? 0) > 1) warnings.add('Multiple receipts detected; only the first receipt was imported.');
  if (Object.values(fields).some(field => field.confidence !== undefined && field.confidence < 0.8)) warnings.add('Some values have low recognition confidence.');
  const currency = fields.Total?.valueCurrency?.currencyCode;
  if (currency && currency !== 'USD') throw new Error('This app currently supports USD receipts only. Enter converted values manually.');
  if (!currency) warnings.add('Currency was not identified. Confirm that the receipt is in USD.');
  const items = (fields.Items?.valueArray ?? []).slice(0, 200).map((item, index) => {
    const f = item.valueObject ?? {};
    if (Object.values(f).some(field => field.confidence !== undefined && field.confidence < 0.8)) warnings.add('Some item values have low recognition confidence.');
    let quantity = f.Quantity?.valueNumber ?? 1;
    let unitPriceCents = amount(f.Price);
    const total = amount(f.TotalPrice);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      warnings.add('A fractional or unsupported quantity was converted to one line item; check its price.');
      quantity = 1;
      unitPriceCents = total;
    } else if (unitPriceCents === null && total !== null) {
      if (total % quantity === 0) unitPriceCents = total / quantity;
      else { quantity = 1; unitPriceCents = total; warnings.add('An item total could not be divided into exact cents; imported as one line item.'); }
    }
    if (total !== null && unitPriceCents !== null && unitPriceCents * quantity !== total) warnings.add('An item price × quantity differs from its receipt total; check discounts and rounding.');
    if (!unitPriceCents) { unitPriceCents = null; warnings.add('Some item prices are missing or unsupported; enter them manually.'); }
    return { name: (f.Description?.valueString ?? `Item ${index + 1}`).slice(0, 2000), quantity, unitPriceCents };
  });
  if ((fields.Items?.valueArray?.length ?? 0) > 200) warnings.add('Only the first 200 items were imported.');
  if (!items.length) warnings.add('No receipt items were found. Try a clearer photo or enter items manually.');
  const taxCents = amount(fields.TotalTax) ?? 0;
  const tipCents = amount(fields.Tip) ?? 0;
  const totalCents = amount(fields.Total);
  const calculated = items.reduce((sum, item) => sum + (item.unitPriceCents ?? 0) * item.quantity, taxCents + tipCents);
  if (totalCents !== null && calculated !== totalCents) warnings.add('Extracted items, tax, and tip do not match the receipt total. Check fees, discounts, and missing items.');
  return { merchant: (fields.MerchantName?.valueString ?? '').slice(0, 500), items, taxCents, tipCents, totalCents, warnings: [...warnings] };
}
