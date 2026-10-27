import { createHmac, hkdfSync } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { businessDetailSchema, businessDocumentSchema, businessEventSchema, type BusinessDetail, type BusinessList } from '@innova/contracts';
import { AppError } from '../errors.js';
import type { RawCipher } from '../finance-raw-crypto.js';
import { normalizeRaw, adjudicate, type PriorProjection } from '../finance-business/normalize.js';
import { matchSettlements } from '../finance-business/settlements.js';
import type { createDatabase } from './client.js';
import type { FinanceRawRepository } from './finance-raw.js';
import { financeBusinessDocuments as docs, financeBusinessEvents as events, financeBusinessScopes as scopes } from './schema.js';
const version = 'kb-business-v1';
const aad = (owner:string,id:string,kind:string) => JSON.stringify(['finance-business',1,owner,id,kind]);
export interface FinanceBusinessRepository {
  process(owner:string,rawFileId:string):Promise<BusinessDetail>;
  find(owner:string,id:string):Promise<BusinessDetail|undefined>;
  list(owner:string):Promise<BusinessList>;
}
export function createBusinessFingerprint(encoded = process.env.FINANCE_RAW_ENCRYPTION_KEY) {
  if (!encoded || !/^[a-f0-9]{64}$/i.test(encoded)) throw Error('Business key unavailable');
  const key = hkdfSync('sha256',Buffer.from(encoded,'hex'),'finance-business-v1','scope-identity',32);
  return (owner:string,value:unknown) => createHmac('sha256',Buffer.from(key)).update(JSON.stringify([owner,value])).digest('hex');
}
export function createFinanceBusinessRepository(db:ReturnType<typeof createDatabase>,raw:FinanceRawRepository,cipher:RawCipher,fingerprint:(owner:string,value:unknown)=>string):FinanceBusinessRepository {
  const summary = (owner:string,row:typeof docs.$inferSelect) => businessDocumentSchema.parse(cipher.open(row.payloadCiphertext,aad(owner,row.id,'document')));
  async function snapshot(owner:string):Promise<PriorProjection[]> {
    const rows = await db.select().from(docs).where(eq(docs.ownerId,owner)).orderBy(desc(docs.createdAt)).limit(10001);
    if (rows.length>10000) throw new AppError(503,'INTERNAL_ERROR','Business history requires review');
    return rows.map(row=>({document:summary(owner,row),scopeKeys:row.scopeKeys}));
  }
  const repository:FinanceBusinessRepository = {
    async find(owner,id) {
      const [row] = await db.select().from(docs).where(and(eq(docs.ownerId,owner),eq(docs.id,id)));
      if (!row) return undefined;
      const records = await db.select().from(events).where(and(eq(events.ownerId,owner),eq(events.documentId,id)));
      const result = businessDetailSchema.parse({document:summary(owner,row),events:records.map(e=>cipher.open(e.payloadCiphertext,aad(owner,e.id,'event')))});
      result.events.sort((a,b)=>a.rawSequence-b.rawSequence||a.kind.localeCompare(b.kind));
      if (result.events.length !== result.document.eventCount) throw Error('Incomplete business readback');
      return result;
    },
    async process(owner,rawFileId) {
      const source = await raw.find(owner,rawFileId);
      if (!source) throw new AppError(404,'NOT_FOUND','Source file not found');
      const normalized = normalizeRaw(source,value=>fingerprint(owner,value));
      for (let attempt=0;attempt<8;attempt++) {
        const [old] = await db.select().from(docs).where(and(eq(docs.ownerId,owner),eq(docs.rawFileId,rawFileId),eq(docs.processorVersion,version)));
        if (old) return (await repository.find(owner,old.id))!;
        const [scope] = await db.select().from(scopes).where(eq(scopes.ownerId,owner));
        const base = scope?.revision ?? 0;
        const projection = adjudicate(structuredClone(normalized),await snapshot(owner));
        const document = projection.document;
        const savedEvents = document.state==='accepted' ? projection.events : [];
        const encryptedEvents = savedEvents.map(e=>({id:e.id,sequence:e.rawSequence,kind:e.kind,payload:cipher.seal(e,aad(owner,e.id,'event'))}));
        // Owner CAS + complete document/events commit in one statement. A losing
        // writer re-reads decisions so overlapping files cannot both be accepted.
        const result = await db.execute(sql`with actor as (select id from users where id=${owner} and approval_status='approved' for share), acquired as (
          insert into finance_business_scopes (owner_id,revision) select id,1 from actor
          on conflict (owner_id) do update set revision=finance_business_scopes.revision+1 where finance_business_scopes.revision=${base}
          returning owner_id
        ), document as (
          insert into finance_business_documents (id,owner_id,raw_file_id,processor_version,kind,state,scope_keys,payload_ciphertext,created_at)
          select ${document.id},${owner},${rawFileId},${version},${document.kind},${document.state},${JSON.stringify(projection.scopeKeys)}::jsonb,${cipher.seal(document,aad(owner,document.id,'document'))},${document.createdAt}::timestamptz from acquired
          on conflict (owner_id,raw_file_id,processor_version) do nothing returning id
        ), inserted as (
          insert into finance_business_events (id,owner_id,document_id,raw_file_id,raw_sequence,kind,payload_ciphertext)
          select r.id,${owner},document.id,${rawFileId},r.sequence,r.kind,r.payload from document cross join jsonb_to_recordset(${JSON.stringify(encryptedEvents)}::jsonb) as r(id text,sequence integer,kind text,payload text)
          returning id
        ) select id from document`);
        if (result.rows.length) return (await repository.find(owner,document.id))!;
      }
      throw new AppError(409,'CONFLICT','Other files changed; retry processing');
    },
    async list(owner) {
      const documents = (await snapshot(owner)).map(p=>p.document);
      let bankEvents:BusinessDetail['events'] = [];
      if (documents.some(d=>d.state==='accepted'&&d.kind==='kb-card-xlsx'&&d.dueDate&&d.billingMonth&&d.totals.billedTotal!==null)) {
        const ids = documents.filter(d=>d.state==='accepted'&&d.kind==='kb-bank-pdf').map(d=>d.id);
        if (ids.length) {
          const rows = await db.select().from(events).where(and(eq(events.ownerId,owner),inArray(events.documentId,ids),eq(events.kind,'bank-cash'))).limit(50001);
          if (rows.length>50000) throw new AppError(503,'INTERNAL_ERROR','Settlement history requires review');
          bankEvents = rows.map(e=>businessEventSchema.parse(cipher.open(e.payloadCiphertext,aad(owner,e.id,'event'))));
        }
      }
      return { documents,settlements:matchSettlements(documents,bankEvents) };
    },
  };
  return repository;
}
