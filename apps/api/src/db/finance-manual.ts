import {and,eq,sql} from 'drizzle-orm';
import {manualTransactionSchema,manualSaveSchema,classificationStateSchema,type ManualTransaction,type ManualSave} from '@innova/contracts';
import type {createDatabase} from './client.js';
import type {RawCipher} from '../finance-raw-crypto.js';
import {financeManualTransactions as records,financeTransactionOperations as operations,financeClassificationWorkspaces as classes} from './schema.js';
import {financeRevision,acquireFinanceScope} from './finance-write-scope.js';
import {AppError,invalidInput} from '../errors.js';
export const manualAad=(owner:string,id:string,revision:number)=>JSON.stringify(['finance-manual',1,owner,id,revision]);
export interface FinanceManualRepository {list(owner:string):Promise<ManualTransaction[]>;save(owner:string,input:ManualSave):Promise<ManualTransaction>}
export function createFinanceManualRepository(db:ReturnType<typeof createDatabase>,cipher:RawCipher,fingerprint:(owner:string,value:unknown)=>string):FinanceManualRepository {
 const decode=(row:typeof records.$inferSelect)=>manualTransactionSchema.parse(cipher.open(row.payloadCiphertext,manualAad(row.ownerId,row.id,row.revision)));
 const repository:FinanceManualRepository={
  async list(owner){const rows=await db.select().from(records).where(eq(records.ownerId,owner)).limit(10001);if(rows.length>10000)throw new AppError(503,'INTERNAL_ERROR','Manual history requires review');return rows.map(decode).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));},
  async save(owner,value){
   const input=manualSaveSchema.parse(value),base=await financeRevision(db,owner),digest=fingerprint(owner,input);
   const [oldOperation]=await db.select().from(operations).where(and(eq(operations.ownerId,owner),eq(operations.operationId,input.operationId)));
   const [old]=await db.select().from(records).where(and(eq(records.ownerId,owner),eq(records.id,input.id)));
   if(oldOperation){if(oldOperation.digest!==digest||!old)throw new AppError(409,'CONFLICT','Operation or record changed');return decode(old);}
   if((old?.revision??0)!==input.expectedRevision)throw new AppError(409,'CONFLICT','Manual transaction changed');
   const [workspace]=await db.select().from(classes).where(eq(classes.ownerId,owner));
   const state=workspace?classificationStateSchema.parse(cipher.open(workspace.payloadCiphertext,JSON.stringify(['finance-classification',1,owner,workspace.revision,'state']))):null;
   if(input.input.categoryId!=='unclassified'&&!state?.categories.some(c=>c.id===input.input.categoryId))throw invalidInput('Unknown category');
   if(state)state.edits=state.edits.filter(e=>e.eventId!==input.id);
   const now=new Date().toISOString(),next=manualTransactionSchema.parse({...input.input,id:input.id,source:'manual',revision:input.expectedRevision+1,createdAt:old?.createdAt.toISOString()??now,updatedAt:now});
   const classRevision=(workspace?.revision??0)+1;
   const result=await db.execute(sql`with actor as(select id from users where id=${owner} and approval_status='approved' for share),${acquireFinanceScope(owner,base)},saved as(
    insert into finance_manual_transactions(id,owner_id,revision,payload_ciphertext,created_at,updated_at)
    select ${input.id},${owner},${next.revision},${cipher.seal(next,manualAad(owner,input.id,next.revision))},${next.createdAt}::timestamptz,${now}::timestamptz from acquired
    where (${input.expectedRevision}>0 or (select count(*) from finance_manual_transactions where owner_id=${owner})<10000) and not exists(select 1 from finance_deleted_transactions where owner_id=${owner} and event_id=${input.id})
    on conflict(id) do update set revision=excluded.revision,payload_ciphertext=excluded.payload_ciphertext,updated_at=excluded.updated_at
    where finance_manual_transactions.owner_id=${owner} and finance_manual_transactions.revision=${input.expectedRevision} returning id
   ),classified as(update finance_classification_workspaces set revision=${classRevision},payload_ciphertext=${state?cipher.seal(state,JSON.stringify(['finance-classification',1,owner,classRevision,'state'])):''},updated_at=${now}::timestamptz where owner_id=${owner} and exists(select 1 from saved) returning owner_id)
   insert into finance_transaction_operations(owner_id,operation_id,transaction_id,digest) select ${owner},${input.operationId},id,${digest} from saved returning transaction_id`);
   if(!result.rows.length)throw new AppError(409,'CONFLICT','Finance data changed; reload before saving');
   return next;
  },
 };return repository;
}
