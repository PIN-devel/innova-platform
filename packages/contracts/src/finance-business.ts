import { z } from "zod";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.string().regex(/^-?(0|[1-9]\d{0,24})$/);
export const businessReasonSchema = z.enum([
  "user-deleted", "invalid-source", "bank-check-failed", "missing-source-identity", "different-bank-account",
  "overlapping-document", "possible-duplicate", "unknown-purchase", "unresolved-adjustment",
  "missing-period", "statement-only", "missing-fee", "unlinked-refund",
]);
export const businessStateSchema = z.enum(["accepted", "needs-review", "invalid"]);
export const businessTotalsSchema = z.object({
  inflow: money.nullable(), outflow: money.nullable(), opening: money.nullable(), closing: money.nullable(),
  observedPurchases: money.nullable(), billedPrincipal: money.nullable(), billedFees: money.nullable(), billedTotal: money.nullable(),
});
export const businessDocumentSchema = z.object({
  id: z.uuid(), rawFileId: z.uuid(), kind: z.enum(["kb-bank-pdf", "kb-card-xlsx"]),
  currency: z.literal("KRW"), scale: z.literal(0), state: businessStateSchema, processorVersion: z.literal("kb-business-v1"), createdAt: z.string(),
  eventCount: z.number().int().nonnegative(), proposedEventCount: z.number().int().nonnegative(),
  reasons: z.array(businessReasonSchema), candidateDocumentIds: z.array(z.uuid()),
  period: z.object({ start: day.nullable(), end: day.nullable(), fullCalendarMonth: z.boolean(), coverage: z.enum(["reported-period", "unknown"]) }),
  billingMonth: z.string().regex(/^\d{4}-\d{2}$/).nullable(), dueDate: day.nullable(), totals: businessTotalsSchema,
});
export const businessEventSchema = z.object({
  id: z.uuid(), rawFileId: z.uuid().nullable(), rawSequence: z.number().int().positive().nullable(), sourcePage: z.number().int().positive().nullable(), sourceRow: z.number().int().positive().nullable(), relatedSequences: z.array(z.number().int().positive()),
  kind: z.enum(["bank-cash", "card-purchase", "card-charge", "card-fee", "card-adjustment", "manual-expense"]),
  source: z.enum(["manual", "bank", "card"]).optional(),
  status: z.enum(["confirmed", "observed", "needs-review"]), reason: businessReasonSchema.nullable(),
  occurredOn: day.nullable(), occurredAt: z.string().max(32).nullable(),
  amount: money.nullable(), consumptionAmount: money.nullable(), fee: money.nullable(),
  inflow: money.nullable(), outflow: money.nullable(), balance: money.nullable(), remaining: money.nullable(),
  installment: z.object({ number: z.number().int().positive(), total: z.number().int().positive() }).nullable(),
  description: z.string().max(12288), counterparty: z.string().max(4096).nullable(),
  cashRole: z.enum(["salary-candidate", "card-settlement-candidate", "transfer-candidate", "unclassified"]).nullable(),
});
export const businessDetailSchema = z.object({ document: businessDocumentSchema, events: z.array(businessEventSchema) });
export const businessListSchema = z.object({ documents: z.array(businessDocumentSchema), settlements: z.array(z.object({
  cardDocumentId: z.uuid(), state: z.enum(["matched", "missing-period", "unknown-total", "unmatched", "amount-mismatch", "ambiguous"]),
  bankEventIds: z.array(z.uuid()), bankDocumentIds: z.array(z.uuid()),
})) });
export const businessProcessSchema = z.object({ rawFileId: z.uuid() }).strict();
export type BusinessReason = z.infer<typeof businessReasonSchema>;
export type BusinessDocument = z.infer<typeof businessDocumentSchema>;
export type BusinessEvent = z.infer<typeof businessEventSchema>;
export type BusinessDetail = z.infer<typeof businessDetailSchema>;
export type BusinessList = z.infer<typeof businessListSchema>;
