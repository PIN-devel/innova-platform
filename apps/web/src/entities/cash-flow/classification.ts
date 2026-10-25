import type { CategoryAllocation, Transaction } from "./model";

export const unclassifiedCategory = "미분류";
export function isConsumption(transaction: Transaction) {
  return transaction.kind === "purchase" || transaction.kind === "refund" || transaction.kind === "fee";
}
export function allocationsFor(transaction: Transaction): CategoryAllocation[] {
  if (!isConsumption(transaction)) return [];
  return transaction.allocations ?? [{ category: transaction.category ?? unclassifiedCategory, amount: transaction.amount }];
}
