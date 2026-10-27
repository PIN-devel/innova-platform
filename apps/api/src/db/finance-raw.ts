import { randomUUID, createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { financeRawDocumentSchema, type FinanceRawFile, type FinanceRawImport, type FinanceRawReadback } from "@innova/contracts";
import type { createDatabase } from "./client.js";
import { financeRawFiles, financeRawRows } from "./schema.js";
import type { RawCipher } from "../finance-raw-crypto.js";
import { AppError } from "../errors.js";

type StoredFile = typeof financeRawFiles.$inferSelect;
const publicFile = (file: StoredFile): FinanceRawFile => ({ id: file.id, batchId: file.batchId, kind: file.kind as FinanceRawFile["kind"], parserVersion: "kb-raw-v1", rowCount: file.rowCount, createdAt: file.createdAt.toISOString() });
const aad = (owner: string, file: string, row: string | number) => JSON.stringify(["finance-raw", 1, owner, file, row]);
export interface FinanceRawRepository {
  list(owner: string): Promise<FinanceRawFile[]>;
  find(owner: string, id: string): Promise<FinanceRawReadback | undefined>;
  import(owner: string, input: FinanceRawImport,context?:{sessionHash:string}): Promise<{ file: FinanceRawFile; duplicate: boolean }>;
}

export function createFinanceRawRepository(db: ReturnType<typeof createDatabase>, cipher: RawCipher): FinanceRawRepository {
  return {
    async list(owner) {
      return (await db.select().from(financeRawFiles).where(eq(financeRawFiles.ownerId, owner)).orderBy(desc(financeRawFiles.createdAt)).limit(100)).map(publicFile);
    },
    async find(owner, id) {
      const [file] = await db.select().from(financeRawFiles).where(and(eq(financeRawFiles.ownerId, owner), eq(financeRawFiles.id, id)));
      if (!file) return undefined;
      const rows = await db.select().from(financeRawRows).where(and(eq(financeRawRows.ownerId, owner), eq(financeRawRows.fileId, id))).orderBy(financeRawRows.sequence);
      const document = financeRawDocumentSchema.parse({ kind: file.kind, fileHash: file.fileHash, parserVersion: file.parserVersion,
        metadata: cipher.open(file.metadataCiphertext, aad(owner, id, "metadata")),
        rows: rows.map(r => cipher.open(r.payloadCiphertext, aad(owner, id, r.sequence))),
      });
      if (document.rows.length !== file.rowCount) throw new Error("Incomplete Raw readback");
      const { fileHash: _, ...safe } = document;
      return { file: publicFile(file), document: safe };
    },
    async import(owner, input,context) {
      const doc = financeRawDocumentSchema.parse(input.document);
      const digest = createHash("sha256").update(JSON.stringify(doc)).digest("hex");
      const id = randomUUID();
      const encryptedRows = doc.rows.map(row => ({ sequence: row.sequence, payload: cipher.seal(row, aad(owner, id, row.sequence)) }));
      // One statement / transaction: no partial file or rows on interruption.
      // The unique document constraint arbitrates simultaneous imports; a retry
      // reads the winning file in a subsequent statement (fresh MVCC snapshot).
      const lease=input.pdfPasswordRevision??null,attemptId=input.pdfPasswordAttemptId??null;
      const committed=await db.execute(sql`with credential as (
        select c.owner_id from finance_pdf_secrets c join finance_pdf_secret_attempts a on a.owner_id=c.owner_id
        where c.owner_id=${owner} and c.revision=${lease} and c.payload_ciphertext is not null and a.id=${attemptId}
          and a.expected_revision=c.revision and a.purpose='use' and a.session_hash=${context?.sessionHash??''} and a.consumed_at is not null and a.expires_at>now()
        for share of c,a
      ), actor as (select id from users where id=${owner} and approval_status='approved' for share), batch as (
        insert into finance_raw_batches (owner_id,id) select id,${input.batchId} from actor where ${lease}::integer is null or exists(select 1 from credential)
        on conflict (owner_id,id) do update set id=excluded.id returning id
      ), file as (
        insert into finance_raw_files (id,owner_id,batch_id,kind,file_hash,payload_digest,parser_version,row_count,metadata_ciphertext)
        select ${id},${owner},batch.id,${doc.kind},${doc.fileHash},${digest},${doc.parserVersion},${doc.rows.length},${cipher.seal(doc.metadata, aad(owner, id, "metadata"))} from batch
        on conflict (owner_id,kind,file_hash) do nothing returning id
      ), inserted as (insert into finance_raw_rows (owner_id,file_id,sequence,payload_ciphertext)
        select ${owner},file.id,r.sequence,r.payload from file cross join jsonb_to_recordset(${JSON.stringify(encryptedRows)}::jsonb) as r(sequence integer,payload text) returning sequence)
      select (${lease}::integer is null or exists(select 1 from credential)) and exists(select 1 from actor) as permitted`);
      if(!committed.rows[0]?.permitted)throw new AppError(409,'CONFLICT','PDF password or approval changed; use manual input');
      const [file] = await db.select().from(financeRawFiles).where(and(eq(financeRawFiles.ownerId, owner),eq(financeRawFiles.kind,doc.kind),eq(financeRawFiles.fileHash,doc.fileHash)));
      if (!file) throw new Error("Raw commit not found");
      if (file.payloadDigest !== digest) throw new AppError(409, "CONFLICT", "Document extraction differs; review required");
      return { file: publicFile(file), duplicate: file.id !== id };
    },
  };
}
