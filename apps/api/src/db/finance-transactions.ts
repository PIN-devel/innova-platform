import {and,eq,sql} from 'drizzle-orm';
import {classificationStateSchema,scheduleStateSchema,transactionWorkspaceSchema,transactionImpactSchema,type BusinessDetail,type ClassificationState,type ScheduleState,type TransactionWorkspace,type TransactionImpact,type TransactionDelete} from '@innova/contracts';
import type {createDatabase} from './client.js';
import type {FinanceManualRepository} from './finance-manual.js';
import type {FinanceBusinessRepository} from './finance-business.js';
import type {FinanceClassificationRepository} from './finance-classification.js';
import type {RawCipher} from '../finance-raw-crypto.js';
import {financeRevision,acquireFinanceScope} from './finance-write-scope.js';
import {financeClassificationWorkspaces as classes,financeScheduleWorkspaces as schedules,financeDeletedTransactions as deleted,financeRawRows as rawRows,financeTransactionOperations as operations} from './schema.js';
import {AppError} from '../errors.js';
const aad=(domain:string,owner:string,revision:number)=>JSON.stringify([domain,1,owner,revision,'state']);
export interface FinanceTransactionRepository {
 read(owner:string):Promise<TransactionWorkspace>;
 impact(owner:string,id:string):Promise<TransactionImpact>;
 remove(owner:string,input:TransactionDelete):Promise<{id:string;deleted:true;revision:number}>;
 deletion(owner:string,id:string):Promise<{id:string;deleted:true;revision:number}>;
}
export function createFinanceTransactionRepository(db:ReturnType<typeof createDatabase>,business:FinanceBusinessRepository,manual:FinanceManualRepository,classification:FinanceClassificationRepository,cipher:RawCipher,fingerprint:(owner:string,value:unknown)=>string):FinanceTransactionRepository {
 async function snapshot(owner:string){
  const revision=await financeRevision(db,owner),list=await business.list(owner),details:BusinessDetail[]=[];
  if(list.documents.reduce((n,d)=>n+d.eventCount,0)>50000)throw new AppError(503,'INTERNAL_ERROR','Transaction history requires pagination');
  for(let offset=0;offset<list.documents.length;offset+=8){const batch=await Promise.all(list.documents.slice(offset,offset+8).map(d=>business.find(owner,d.id)));for(const d of batch)if(d)details.push(d);}
  const records=await manual.list(owner);
  return {revision,list,details,records};
 }
 const repository:FinanceTransactionRepository={
  async read(owner){for(let attempt=0;attempt<3;attempt++){
   const s=await snapshot(owner),classified=await classification.read(owner),fileTransactions=s.details.flatMap(d=>d.events.map(e=>({id:e.id,documentId:d.document.id,date:e.occurredOn,description:e.description,kind:e.kind,amount:e.amount,source:d.document.kind==='kb-bank-pdf'?'bank' as const:'card' as const})));
   const duplicateCandidates=s.records.map(t=>({manualId:t.id,eventIds:fileTransactions.filter(e=>e.date===t.date&&e.amount!==null&&(e.amount.startsWith('-')?e.amount.slice(1):e.amount)===t.amount).map(e=>e.id)})).filter(c=>c.eventIds.length);
   if(await financeRevision(db,owner)!==s.revision)continue;
   return transactionWorkspaceSchema.parse({categories:classified.categories,revision:s.revision,manual:s.records,duplicateCandidates,fileTransactions});
  }throw new AppError(409,'CONFLICT','Finance data changed; retry');},
  async impact(owner,id){const s=await snapshot(owner),m=s.records.find(t=>t.id===id),detail=s.details.find(d=>d.events.some(e=>e.id===id)),event=detail?.events.find(e=>e.id===id);
   if(!m&&!event)throw new AppError(404,'NOT_FOUND','Transaction unavailable');
   const [row]=await db.select().from(schedules).where(eq(schedules.ownerId,owner));
   const state=row?scheduleStateSchema.parse(cipher.open(row.payloadCiphertext,aad('finance-schedule',owner,row.revision))):null;
   const classified=await classification.read(owner);
   if(await financeRevision(db,owner)!==s.revision)throw new AppError(409,'CONFLICT','Finance data changed; retry');
   return transactionImpactSchema.parse({id,source:m?'manual':detail!.document.kind==='kb-bank-pdf'?'bank':'card',revision:s.revision,month:m?.date.slice(0,7)??event?.occurredOn?.slice(0,7)??null,affectedMonths:[...new Set([...(m?[m.date.slice(0,7)]:[]),...(detail?.events.flatMap(e=>e.occurredOn?[e.occurredOn.slice(0,7)]:[])??[])])].sort(),relatedEventIds:[...new Set([...(detail?.events.filter(e=>e.id!==id&&(e.rawSequence!==null&&e.rawSequence===event?.rawSequence||e.relatedSequences.includes(event?.rawSequence??-1))).map(e=>e.id)??[]),...classified.transactions.filter(t=>t.effective?.refundOf===id).map(t=>t.event.id)])],scheduleCount:state?.overrides.filter(o=>o.evidenceId===id).length??0,rawRowRemoved:!!event?.rawSequence,warning:'앱에서 되돌릴 수 없습니다. 해당 연결·분할·보정을 정리합니다. 개인정보가 남지 않도록 전체 분류·일정 변경 이력을 재기준화하며 다른 거래의 현재 보정·일정은 보존합니다. 은행 자료는 부분 상태로 표시될 수 있습니다. 원본 파일·기존 다운로드 사본과 백업은 즉시 지워지지 않습니다.'});
  },
  async deletion(owner,id){const [row]=await db.select().from(deleted).where(and(eq(deleted.ownerId,owner),eq(deleted.eventId,id)));if(!row)throw new AppError(404,'NOT_FOUND','Deletion not confirmed');return {id,deleted:true,revision:await financeRevision(db,owner)};},
  async remove(owner,input){
   const digest=fingerprint(owner,input),[op]=await db.select().from(operations).where(and(eq(operations.ownerId,owner),eq(operations.operationId,input.operationId)));
   if(op){if(op.digest!==digest)throw new AppError(409,'CONFLICT','Operation differs');return repository.deletion(owner,input.id);}
   const [prior]=await db.select().from(deleted).where(and(eq(deleted.ownerId,owner),eq(deleted.eventId,input.id)));if(prior)return repository.deletion(owner,input.id);
   const s=await snapshot(owner);if(s.revision!==input.expectedRevision)throw new AppError(409,'CONFLICT','Deletion impact changed; preview again');
   const m=s.records.find(t=>t.id===input.id),detail=s.details.find(d=>d.events.some(e=>e.id===input.id)),target=detail?.events.find(e=>e.id===input.id);
   if(!m&&!target)throw new AppError(404,'NOT_FOUND','Transaction unavailable');
   const [c]=await db.select().from(classes).where(eq(classes.ownerId,owner)),[h]=await db.select().from(schedules).where(eq(schedules.ownerId,owner));
   const cs:ClassificationState|null=c?classificationStateSchema.parse(cipher.open(c.payloadCiphertext,aad('finance-classification',owner,c.revision))):null;
   if(cs)cs.edits=cs.edits.filter(e=>e.eventId!==input.id&&e.refundOf!==input.id);
   const ss:ScheduleState|null=h?scheduleStateSchema.parse(cipher.open(h.payloadCiphertext,aad('finance-schedule',owner,h.revision))):null;
   if(ss)ss.overrides=ss.overrides.filter(o=>o.evidenceId!==input.id);
   const now=new Date().toISOString(),cr=(c?.revision??0)+1,sr=(h?.revision??0)+1;
   const fileId=target?.rawFileId??null,sequence=target?.rawSequence??null;
   const originalRows=fileId?await db.select().from(rawRows).where(and(eq(rawRows.ownerId,owner),eq(rawRows.fileId,fileId))):[];
   const retainedRows=originalRows.flatMap(row=>{
    const body=cipher.open(row.payloadCiphertext,JSON.stringify(['finance-raw',1,owner,fileId,row.sequence])) as import('@innova/contracts').FinanceRawReadback['document']['rows'][number];
    if(row.sequence===sequence||body.kind==='summary')return [];
    if(detail?.document.kind==='kb-bank-pdf')body.cells=body.cells.map(cell=>cell.column==='잔액'?{...cell,value:null}:cell);
    return [{sequence:row.sequence,payload:cipher.seal(body,JSON.stringify(['finance-raw',1,owner,fileId,row.sequence]))}];
   });
   const retainedEvents=detail?.events.filter(e=>e.id!==input.id).map(e=>{
    const value=structuredClone(e);
    if(sequence!==null&&(e.rawSequence===sequence||e.relatedSequences.includes(sequence))){value.rawSequence=null;value.sourcePage=null;value.sourceRow=null;value.relatedSequences=[];value.status='needs-review';value.reason='user-deleted';value.description='연결된 원천 행 삭제 · 재검토 필요';value.counterparty=null;if(value.kind==='card-adjustment')value.consumptionAmount=null;}
    if(detail.document.kind==='kb-bank-pdf')value.balance=null;
    return {id:value.id,sequence:value.rawSequence,payload:cipher.seal(value,JSON.stringify(['finance-business',1,owner,value.id,'event']))};
   })??[];
   const remainingDates=detail?.events.filter(e=>e.id!==input.id).flatMap(e=>e.occurredOn?[e.occurredOn]:[]).sort()??[];
   const document=detail?{...detail.document,eventCount:retainedEvents.length,proposedEventCount:retainedEvents.length,reasons:[...new Set([...detail.document.reasons,'user-deleted'])],period:{...detail.document.period,...(detail.document.kind==='kb-card-xlsx'||!retainedEvents.length?{start:remainingDates[0]??null,end:remainingDates.at(-1)??null}:{}),fullCalendarMonth:false,coverage:'unknown'},totals:Object.fromEntries(Object.keys(detail.document.totals).map(k=>[k,null]))}:null;
   const result=await db.execute(sql`with actor as(select id from users where id=${owner} and approval_status='approved' for share),${acquireFinanceScope(owner,s.revision)},
    marker as(insert into finance_deleted_transactions(owner_id,event_id,raw_file_id,raw_sequence) select ${owner},${input.id},${fileId},${sequence}::integer from acquired on conflict do nothing returning event_id),
    removed_manual as(delete from finance_manual_transactions where owner_id=${owner} and id=${input.id} and exists(select 1 from marker) returning id),
    removed_event as(delete from finance_business_events where owner_id=${owner} and id=${input.id} and exists(select 1 from marker) returning id),
    events_cleaned as(update finance_business_events e set raw_sequence=r.sequence,payload_ciphertext=r.payload from jsonb_to_recordset(${JSON.stringify(retainedEvents)}::jsonb) as r(id text,sequence integer,payload text) where e.owner_id=${owner} and e.id=r.id and exists(select 1 from marker) returning e.id),
    rows_cleaned as(update finance_raw_rows r set payload_ciphertext=v.payload from jsonb_to_recordset(${JSON.stringify(retainedRows)}::jsonb) as v(sequence integer,payload text) where r.owner_id=${owner} and r.file_id=${fileId} and r.sequence=v.sequence and exists(select 1 from marker) returning r.sequence),
    rows_removed as(delete from finance_raw_rows where owner_id=${owner} and file_id=${fileId} and sequence not in(select r.sequence from jsonb_to_recordset(${JSON.stringify(retainedRows)}::jsonb) as r(sequence integer,payload text)) and exists(select 1 from marker) and (select count(*) from events_cleaned)>=0 returning sequence),
    file_cleaned as(update finance_raw_files set row_count=${retainedRows.length},metadata_ciphertext=${cipher.seal([{key:'user-deleted',value:'원천 일부 영구 삭제',page:1}],JSON.stringify(['finance-raw',1,owner,fileId,'metadata']))} where owner_id=${owner} and id=${fileId} and exists(select 1 from marker) returning id),
    document_cleaned as(update finance_business_documents set payload_ciphertext=${document?cipher.seal(document,JSON.stringify(['finance-business',1,owner,detail!.document.id,'document'])):''},scope_keys=(select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements_text(scope_keys) value where value not like 'candidate:%') where owner_id=${owner} and id=${detail?.document.id??null} and exists(select 1 from marker) returning id),
    classes_cleaned as(update finance_classification_workspaces set revision=${cr},payload_ciphertext=${cs?cipher.seal(cs,aad('finance-classification',owner,cr)):''},updated_at=${now}::timestamptz where owner_id=${owner} and exists(select 1 from marker) returning owner_id),
    class_history_removed as(delete from finance_classification_revisions where owner_id=${owner} and exists(select 1 from marker) returning revision),
    schedules_cleaned as(update finance_schedule_workspaces set revision=${sr},payload_ciphertext=${ss?cipher.seal(ss,aad('finance-schedule',owner,sr)):''},updated_at=${now}::timestamptz where owner_id=${owner} and exists(select 1 from marker) returning owner_id),
    schedule_history_removed as(delete from finance_schedule_revisions where owner_id=${owner} and exists(select 1 from marker) returning revision)
    insert into finance_transaction_operations(owner_id,operation_id,transaction_id,digest) select ${owner},${input.operationId},event_id,${digest} from marker returning transaction_id`);
   if(!result.rows.length)throw new AppError(409,'CONFLICT','Finance data changed; preview again');
   return repository.deletion(owner,input.id);
  },
 };return repository;
}
