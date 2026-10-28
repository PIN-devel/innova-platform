import { z } from "zod";

export const bankRawColumns = ["거래일시", "적요", "보낸분/받는분", "출금액", "입금액", "잔액", "송금메모", "거래점"] as const;
export const cardRawColumns = [..."ABCDEFGHIJKL"];
const cell = z.object({ column: z.string().max(40), value: z.string().max(4096).nullable(), type: z.enum(["text", "number", "blank", "boolean", "error"]), source: z.string().max(128).optional() }).strict();
export const financeRawRowSchema = z.object({
  sequence: z.number().int().positive(), page: z.number().int().positive(), sourceRow: z.number().int().positive(),
  kind: z.enum(["transaction", "continuation", "summary", "header", "blank"]),
  cells: z.array(cell).min(8).max(12),
}).strict();
export const financeRawDocumentSchema = z.object({
  kind: z.enum(["kb-bank-pdf", "kb-card-xlsx"]), fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  parserVersion: z.literal("kb-raw-v1"),
  metadata: z.array(z.object({ key: z.string().max(80), value: z.string().max(4096).nullable(), page: z.number().int().positive() }).strict()).max(400),
  rows: z.array(financeRawRowSchema).min(1).max(5000),
}).strict().superRefine((doc, ctx) => {
  const columns = doc.kind === "kb-bank-pdf" ? bankRawColumns : cardRawColumns;
  for (const [index, row] of doc.rows.entries()) {
    if (row.sequence !== index + 1 || row.cells.length !== columns.length || row.cells.some((c, i) => c.column !== columns[i])) ctx.addIssue({ code: "custom", path: ["rows", index], message: "Invalid source layout" });
  }
});
export const financeRawImportSchema = z.object({ batchId: z.uuid(), document: financeRawDocumentSchema,pdfPasswordRevision:z.number().int().positive().optional(),pdfPasswordAttemptId:z.uuid().optional() }).strict().superRefine((input,ctx)=>{if((input.pdfPasswordRevision===undefined)!==(input.pdfPasswordAttemptId===undefined)||(input.pdfPasswordRevision!==undefined&&input.document.kind!=='kb-bank-pdf'))ctx.addIssue({code:'custom',message:'Invalid PDF password lease'});});
export const financeRawFileSchema = z.object({
  id: z.uuid(), batchId: z.uuid(), kind: z.enum(["kb-bank-pdf", "kb-card-xlsx"]),
  parserVersion: z.literal("kb-raw-v1"), rowCount: z.number().int().nonnegative(), deletedRows:z.number().int().nonnegative().optional(), createdAt: z.string(),
});
export const financeRawFilesSchema = z.object({ files: z.array(financeRawFileSchema) });
export const financeRawReadbackSchema = z.object({ file: financeRawFileSchema, document: z.object(financeRawDocumentSchema.shape).omit({ fileHash: true }).extend({rows:z.array(financeRawRowSchema).max(5000)}) });
export const financeRawResultSchema = z.object({ file: financeRawFileSchema, duplicate: z.boolean() });
export type FinanceRawDocument = z.infer<typeof financeRawDocumentSchema>;
export type FinanceRawImport = z.infer<typeof financeRawImportSchema>;
export type FinanceRawFile = z.infer<typeof financeRawFileSchema>;
export type FinanceRawReadback = z.infer<typeof financeRawReadbackSchema>;
