import type { CashFlowSnapshot, SpendingAnalysis, Transaction } from "@/entities/cash-flow/model";
import { allocationsFor, isConsumption, unclassifiedCategory } from "@/entities/cash-flow/classification";

/** Derived read model for the synthetic wireframe only. */
export function buildSyntheticSpending(snapshot: CashFlowSnapshot, monthId: string, category: string | null): SpendingAnalysis {
  const index = snapshot.months.findIndex(m => m.id === monthId);
  const month = snapshot.months[index]!;
  const previousMonth = snapshot.months[index - 1];
  const comparable = month.consumption !== null && previousMonth?.consumption != null;
  const rows = month.transactions.filter(isConsumption);
  const allocationAmount = (t: Transaction, name: string | null) => allocationsFor(t).filter(a => !name || a.category === name).reduce((sum, a) => sum + a.amount, 0);
  const selected = rows.filter(t => !category || allocationsFor(t).some(a => a.category === category));
  const amount = selected.reduce((sum, t) => sum + allocationAmount(t, category), 0);
  const previous = comparable ? category ? previousMonth!.categories.find(c => c.name === category)?.amount ?? 0 : previousMonth!.consumption! : null;
  const purchases = selected.filter(t => t.kind !== "refund" && t.amount > 0);
  const previousPurchases = comparable ? previousMonth!.transactions.filter(t => isConsumption(t) && t.kind !== "refund" && t.amount > 0 && (!category || allocationsFor(t).some(a => a.category === category))) : [];
  const gross = purchases.reduce((sum, t) => sum + allocationAmount(t, category), 0);
  const recurring = selected.filter(t => t.recurring).reduce((sum, t) => sum + allocationAmount(t, category), 0);
  const merchants = new Map<string, SpendingAnalysis["merchants"][number]>();
  for (const t of selected) {
    const original = t.kind === "refund" ? snapshot.months.flatMap(m => m.transactions).find(row => row.id === t.relatedId) : undefined;
    const name = original?.title ?? t.title;
    const row = merchants.get(name) ?? { name, amount: 0, count: 0, transactionIds: [] };
    row.amount += allocationAmount(t, category);
    if (t.kind !== "refund" && t.amount > 0) row.count++;
    row.transactionIds.push(t.id);
    merchants.set(name, row);
  }
  const unclassified = rows.filter(t => allocationsFor(t).some(a => a.category === unclassifiedCategory));
  return {
    category, amount, total: month.consumption, previous, change: previous === null ? null : amount - previous,
    share: month.consumption && category ? amount / month.consumption * 100 : null,
    purchaseCount: purchases.length, averagePurchase: purchases.length ? Math.round(gross / purchases.length) : null,
    previousPurchaseCount: comparable ? previousPurchases.length : null,
    previousAveragePurchase: comparable && previousPurchases.length ? Math.round(previousPurchases.reduce((sum, t) => sum + allocationAmount(t, category), 0) / previousPurchases.length) : null,
    refunds: -selected.filter(t => t.kind === "refund").reduce((sum, t) => sum + allocationAmount(t, category), 0),
    recurring, other: amount - recurring,
    unclassifiedAmount: unclassified.reduce((sum, t) => sum + allocationAmount(t, unclassifiedCategory), 0),
    unclassifiedCount: unclassified.length,
    unclassifiedIds: unclassified.map(t => t.id),
    splitIds: rows.filter(t => allocationsFor(t).length > 1).map(t => t.id),
    splitCount: rows.filter(t => allocationsFor(t).length > 1 && t.kind !== "refund").length,
    categories: snapshot.categories.map(name => {
      const categoryRows = rows.filter(t => allocationsFor(t).some(a => a.category === name));
      const value = categoryRows.reduce((sum, t) => sum + allocationAmount(t, name), 0);
      const prior = comparable ? previousMonth!.categories.find(c => c.name === name)?.amount ?? 0 : null;
      return { name, amount: value, previous: prior, change: prior === null ? null : value - prior,
        count: categoryRows.filter(t => t.kind !== "refund" && t.amount > 0).length,
        share: month.consumption ? value / month.consumption * 100 : null };
    }).filter(c => c.amount !== 0 || (c.previous ?? 0) !== 0),
    trend: snapshot.months.map(m => ({ id: m.id, label: m.label, amount: m.consumption === null ? null : category ? m.categories.find(c => c.name === category)?.amount ?? 0 : m.consumption })),
    merchants: [...merchants.values()].sort((a, b) => b.amount - a.amount),
    transactions: selected.toSorted((a, b) => b.date.localeCompare(a.date)),
    allocatedAmounts: category ? Object.fromEntries(selected.map(t => [t.id, allocationAmount(t, category)])) : {},
  };
}
