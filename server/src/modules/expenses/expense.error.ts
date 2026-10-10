export class ExpenseError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
