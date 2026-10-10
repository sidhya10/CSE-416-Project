import { z } from 'zod';

const cents = z.number().int().min(0).max(100_000_000);
const id = z.string().min(1).max(100);
const uniqueIds = z.array(id).min(1).max(100).refine(ids => new Set(ids).size === ids.length, 'Duplicate participants');
export const expenseInput = z.object({
  title: z.string().trim().min(1).max(500),
  expenseDate: z.iso.date(),
  paidByUserId: id,
  splitMode: z.enum(['EQUAL', 'ITEMS']),
  participantIds: uniqueIds,
  items: z.array(z.object({
    name: z.string().trim().min(1).max(2000),
    unitPriceCents: cents.refine(value => value > 0, 'Price must be positive'),
    quantity: z.number().int().min(1).max(999),
    assignedUserIds: z.array(id).max(100).default([]).refine(ids => new Set(ids).size === ids.length, 'Duplicate assignments'),
  }).strict()).min(1).max(200),
  taxCents: cents.default(0), tipCents: cents.default(0), otherCents: cents.default(0),
}).strict().superRefine((value, context) => {
  const fail = (message: string) => context.addIssue({ code: 'custom', message });
  if (!value.participantIds.includes(value.paidByUserId)) fail('The payer must be a participant');
  for (const item of value.items) {
    if (item.assignedUserIds.some(userId => !value.participantIds.includes(userId))) fail('Assignments must reference participants');
    if (value.splitMode === 'ITEMS' && !item.assignedUserIds.length) fail('Assign every receipt item');
    if (value.splitMode === 'EQUAL' && item.assignedUserIds.length) fail('Equal splits do not use item assignments');
  }
  const total = value.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, value.taxCents + value.tipCents + value.otherCents);
  if (total > 2_000_000_000) fail('Expense total is too large');
});
export const createExpenseInput = z.object({ clientRequestId: z.uuid(), expense: expenseInput }).strict();
export const editExpenseInput = z.object({ version: z.number().int().positive(), expense: expenseInput }).strict();
export type ExpenseInput = z.infer<typeof expenseInput>;

// Largest remainders, with participant order breaking ties, match the frontend preview.
function allocate(amount: number, weights: number[]) {
  const sum = weights.reduce((total, weight) => total + BigInt(weight), 0n);
  if (!sum) return weights.map(() => 0);
  const products = weights.map(weight => BigInt(amount) * BigInt(weight));
  const result = products.map(product => Number(product / sum));
  const order = products.map((product, index) => ({ index, remainder: product % sum }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  let remainder = amount - result.reduce((total, value) => total + value, 0);
  for (const entry of order) {
    if (!remainder) break;
    result[entry.index] = (result[entry.index] ?? 0) + 1;
    remainder--;
  }
  return result;
}

export function calculateExpense(input: ExpenseInput) {
  const amounts = input.items.map(item => item.unitPriceCents * item.quantity);
  const subtotal = amounts.reduce((sum, value) => sum + value, 0);
  const fees = input.taxCents + input.tipCents + input.otherCents;
  const totalCents = subtotal + fees;
  let base = input.participantIds.map(() => 0);
  let totals: number[];
  if (input.splitMode === 'EQUAL') {
    base = allocate(subtotal, base.map(() => 1));
    totals = allocate(totalCents, base.map(() => 1));
  } else {
    input.items.forEach((item, position) => {
      const shares = allocate(amounts[position]!, input.participantIds.map(userId => item.assignedUserIds.includes(userId) ? 1 : 0));
      base = base.map((value, index) => value + shares[index]!);
    });
    const allocatedFees = allocate(fees, base);
    totals = base.map((value, index) => value + allocatedFees[index]!);
  }
  return { totalCents, shares: input.participantIds.map((userId, position) => ({ userId, position, baseCents: base[position]!, totalCents: totals[position]! })) };
}
