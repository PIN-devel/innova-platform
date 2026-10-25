import type { CalendarEdit, CashFlowSnapshot, CategoryAllocation, ImportDecision, TransactionEdit } from "@/entities/cash-flow/model";

/** Replace the in-memory adapter here when real commands are introduced. */
export interface CashFlowActions {
  saveCalendarEvent(id: string | null, edit: CalendarEdit, scope: "once" | "future"): CashFlowSnapshot;
  changeCalendarEvent(id: string, change: "skip" | "resume" | "end"): CashFlowSnapshot;
  setProtectedAmount(amount: number): CashFlowSnapshot;
  reclassify(transactionId: string, category: string): CashFlowSnapshot;
  applyImport(fileIds: string[], decisions: Record<string, ImportDecision>): CashFlowSnapshot;
  setPdfPasswordSaved(saved: boolean): CashFlowSnapshot;
  updateTransaction(transactionId: string, edit: TransactionEdit): CashFlowSnapshot;
  restoreTransaction(transactionId: string): CashFlowSnapshot;
  allocate(transactionId: string, allocations: CategoryAllocation[]): CashFlowSnapshot;
  addCategory(name: string): CashFlowSnapshot;
  renameCategory(name: string, next: string): CashFlowSnapshot;
  mergeCategory(name: string, target: string): CashFlowSnapshot;
  deleteCategory(name: string): CashFlowSnapshot;
}
