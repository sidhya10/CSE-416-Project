export type SplitMember = { id: string; name: string };
export type SplitItem = { id: number; name: string; cents: number };
export type SplitMode = 'equal' | 'items';
export type SplitAssignments = Record<number, string[]>;
export type SplitShare = { memberId: string; baseCents: number; totalCents: number; reimbursementCents: number };
export type PreviewSplit = {
  name: string;
  payerId: string;
  date: string;
  mode: SplitMode;
  items: SplitItem[];
  feeCents: number;
  totalCents: number;
  assignments: SplitAssignments;
  shares: SplitShare[];
};
export const formatCents = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);

// Largest remainders conserve cents; ties go to the earlier member in group order.
function allocate(amount: number, weights: number[]): number[] {
  const sum = weights.reduce((total, weight) => total + BigInt(weight), 0n);
  if (!sum) return weights.map(() => 0);
  const products = weights.map(weight => BigInt(amount) * BigInt(weight));
  const shares = products.map(product => Number(product / sum));
  let remainder = amount - shares.reduce((total, share) => total + share, 0);
  const order = products.map((product, index) => ({ index, remainder: product % sum }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const entry of order) {
    if (!remainder) break;
    shares[entry.index] = (shares[entry.index] ?? 0) + 1;
    remainder--;
  }
  return shares;
}

export function calculateSplit(items: SplitItem[], feeCents: number, members: SplitMember[], payerId: string, mode: SplitMode, assignments: SplitAssignments) {
  const subtotal = items.reduce((sum, item) => sum + item.cents, 0);
  const totalCents = subtotal + feeCents;
  if (!members.length || !members.some(member => member.id === payerId) || !items.length ||
    items.some(item => !Number.isSafeInteger(item.cents) || item.cents <= 0) ||
    !Number.isSafeInteger(feeCents) || feeCents < 0 || !Number.isSafeInteger(totalCents)) {
    throw new Error('Invalid split inputs');
  }
  const unassigned = mode === 'items' ? items.filter(item => !members.some(member => assignments[item.id]?.includes(member.id))) : [];
  let base: number[];
  let totals: number[];
  if (mode === 'equal') {
    base = allocate(subtotal, members.map(() => 1));
    totals = allocate(totalCents, members.map(() => 1));
  } else {
    base = members.map(() => 0);
    for (const item of items) {
      const itemShares = allocate(item.cents, members.map(member => assignments[item.id]?.includes(member.id) ? 1 : 0));
      base = base.map((value, index) => value + (itemShares[index] ?? 0));
    }
    const fees = unassigned.length ? members.map(() => 0) : allocate(feeCents, base);
    totals = base.map((value, index) => value + (fees[index] ?? 0));
  }
  const shares = members.map((member, index) => ({ memberId: member.id, baseCents: base[index] ?? 0,
    totalCents: totals[index] ?? 0, reimbursementCents: member.id === payerId ? 0 : totals[index] ?? 0 }));
  return { totalCents, shares, unassigned, valid: !unassigned.length && totals.reduce((sum, value) => sum + value, 0) === totalCents };
}
