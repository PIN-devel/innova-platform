/** UI read models only; these are not bank parsers or server contracts. Amounts are KRW. */
export type Coverage = "complete" | "missing" | "delayed";
export type CashFlowScreen = "review" | "spending" | "upcoming" | "import" | "settings";
export type CategoryAllocation = { category: string; amount: number };
export type Transaction = {
  id: string;
  date: string;
  title: string;
  amount: number;
  source: "bank" | "card";
  kind: "purchase" | "refund" | "income" | "transfer" | "card-payment" | "fee";
  category: string | null;
  recurring: boolean;
  note: string;
  relatedId?: string;
  original?: { title: string; date: string; amount: number; memo?: string };
  userEdited?: boolean;
  memo?: string;
  allocations?: CategoryAllocation[];
  classificationUpdated?: boolean;
  classificationNote?: string;
};
export type CategorySummary = { name: string; amount: number; previous: number | null };
export type PlannedPayment = {
  id: string; title: string; date: string; amount: number | null;
  status: "scheduled" | "matched" | "unconfirmed";
  note: string; transactionId?: string;
};
export type CashFlowMonth = {
  id: string; label: string; period: string; updatedAt: string;
  bankCoverage: Coverage; cardCoverage: Coverage;
  consumption: number | null; income: number | null;
  bank: { opening: number; incoming: number; outgoing: number; closing: number; transfersOut: number; transfersIn: number; cardPayment: number } | null;
  categories: CategorySummary[];
  recurringConsumption: number | null;
  transactions: Transaction[];
  payments: PlannedPayment[];
  insight: { title: string; description: string; category: string | null } | null;
};
export type ImportFile = {
  id: string; name: string; source: "bank" | "card"; monthId: string;
  issue?: "unreadable" | "wrong-account";
};
export type ImportConflict = { id: string; title: string; monthId: string; before: number; after: number; userEdited: boolean };
export type ImportMonthCoverage = { id: string; label: string; bank: boolean; card: boolean };
export type ImportPreview = {
  added: number; duplicates: number; corrections: ImportConflict[];
  months: ImportMonthCoverage[]; issues: { fileId: string; name: string; message: string }[];
};
export type ImportDecision = "keep" | "replace";
export type ImportResult = { added: number; duplicates: number; corrected: number; kept: number; skippedFiles: number; months: ImportMonthCoverage[] };
export type TransactionEdit = { title: string; date: string; amount: number; memo: string };
export type CashFlowSnapshot = { months: CashFlowMonth[]; categories: string[]; importHistory: string[]; importFiles: ImportFile[]; pdfPasswordSaved: boolean };
export type CashFlowPart = {
  id: string; label: string; amount: number; detail: string; transactionIds: string[];
};
export type ReviewFinding = {
  id: string; title: string; description: string; actionLabel: string;
  target: { type: "transaction"; monthId: string; id: string } | { type: "category"; monthId: string; category: string };
};
export type MonthlyReview = {
  headline: string;
  consumptionChange: number | null;
  cashChange: number | null;
  incoming: CashFlowPart[];
  outgoing: CashFlowPart[];
  findings: ReviewFinding[];
};
export type SpendingLens = "size" | "changes" | "recurring" | "classification";
export type SpendingSort = "amount" | "increase" | "decrease";
export type SpendingAnalysis = {
  category: string | null; amount: number; total: number | null; previous: number | null; change: number | null; share: number | null;
  purchaseCount: number; averagePurchase: number | null; refunds: number; recurring: number; other: number;
  previousPurchaseCount: number | null; previousAveragePurchase: number | null;
  unclassifiedAmount: number; unclassifiedCount: number; splitCount: number;
  unclassifiedIds: string[]; splitIds: string[];
  categories: { name: string; amount: number; previous: number | null; change: number | null; count: number; share: number | null }[];
  trend: { id: string; label: string; amount: number | null }[];
  merchants: { name: string; amount: number; count: number; transactionIds: string[] }[];
  transactions: Transaction[]; allocatedAmounts: Record<string, number>;
};
export interface CashFlowSource {
  read(): CashFlowSnapshot;
  review(monthId: string): MonthlyReview;
  spending(monthId: string, category: string | null): SpendingAnalysis;
  calendar(monthId: string): CashCalendar;
  previewImport(fileIds: string[]): ImportPreview;
}

/** Calendar read models. Dates and amounts describe plans, never ledger writes. */
export type CalendarEvent = {
  id: string; title: string; date: string; amount: number | null;
  direction: "income" | "expense" | "transfer";
  method: "bank" | "card" | "points";
  certainty: "confirmed" | "estimate";
  repeat: "none" | "monthly"; note: string;
  status: "planned" | "matched" | "skipped";
  transactionId?: string;
};
export type CalendarEdit = Pick<CalendarEvent, "title" | "date" | "amount" | "direction" | "method" | "certainty" | "repeat" | "note">;
export type CashCalendar = {
  monthId: string; months: string[]; asOf: string; historical: boolean;
  opening: number | null; income: number; outgoing: number;
  projected: number | null; available: number | null;
  futureCardReserve: number | null; protectedAmount: number;
  unknownCount: number; incomplete: boolean; warnings: string[];
  lowest: { date: string; amount: number } | null;
  nextIncome: string | null; beforeIncome: number;
  items: (CalendarEvent & { balance: number | null })[];
  completed: CalendarEvent[];
};
