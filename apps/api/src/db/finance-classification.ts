import {financeRevision,acquireFinanceScope} from './finance-write-scope.js';
import type {FinanceManualRepository} from './finance-manual.js';
import {and,desc,eq,lte,sql} from 'drizzle-orm';
import {applyClassification,classificationCommandSchema,classificationStateSchema,classificationView,emptyClassification,type BusinessDetail,type ClassificationCommand,type ClassificationState,type ClassificationView} from '@innova/contracts';
import type {createDatabase} from './client.js';
import type {FinanceBusinessRepository} from './finance-business.js';
import type {RawCipher} from '../finance-raw-crypto.js';
import {AppError,invalidInput} from '../errors.js';
import {financeClassificationWorkspaces as workspaces,financeClassificationRevisions as revisions} from './schema.js';
export interface FinanceClassificationRepository {read(owner:string):Promise<ClassificationView>;change(owner:string,command:ClassificationCommand):Promise<ClassificationView>}
const aad=(owner:string,revision:number,kind:string)=>JSON.stringify(['finance-classification',1,owner,revision,kind]);
export function createFinanceClassificationRepository(db:ReturnType<typeof createDatabase>,business:FinanceBusinessRepository,cipher:RawCipher,manual?:FinanceManualRepository):FinanceClassificationRepository {
 async function sources(owner:string){const list=await business.list(owner),details:BusinessDetail[]=[];let count=0;for(const d of list.documents){if(d.kind!=='kb-card-xlsx')continue;count+=d.eventCount;if(count>10000)throw new AppError(503,'INTERNAL_ERROR','Classification history requires review');const detail=d.state==='accepted'?await business.find(owner,d.id):{document:d,events:[]};if(detail)details.push(detail);}return details;}
 const decode=(owner:string,revision:number,payload:string)=>classificationStateSchema.parse(cipher.open(payload,aad(owner,revision,'state')));
 async function current(owner:string){const [row]=await db.select().from(workspaces).where(eq(workspaces.ownerId,owner));return {revision:row?.revision??0,state:row?decode(owner,row.revision,row.payloadCiphertext):emptyClassification(),updatedAt:row?.updatedAt.toISOString()??null};}
 const repository:FinanceClassificationRepository={
  async read(owner){for(let attempt=0;attempt<3;attempt++){
   const scope=await financeRevision(db,owner),snapshot=await current(owner);
   const history=await db.select().from(revisions).where(and(eq(revisions.ownerId,owner),lte(revisions.revision,snapshot.revision))).orderBy(desc(revisions.revision));
   const result=classificationView(snapshot.state,await sources(owner),snapshot.revision,snapshot.updatedAt,history.map(r=>{
    const record=cipher.open(r.payloadCiphertext,aad(owner,r.revision,'history')) as {command:ClassificationCommand},command=classificationCommandSchema.parse(record.command),change=command.change;
    return {revision:r.revision,operationId:r.operationId,createdAt:r.createdAt.toISOString(),type:change.type,eventId:change.type==='edit'?change.edit.eventId:'eventId' in change?change.eventId:null};
   }),await manual?.list(owner)??[]);
   if(await financeRevision(db,owner)===scope)return result;
  }throw new AppError(409,'CONFLICT','Finance data changed; retry classification');},
  async change(owner,command){
   const scope=await financeRevision(db,owner),snapshot=await current(owner);
   const [previous]=await db.select().from(revisions).where(and(eq(revisions.ownerId,owner),eq(revisions.operationId,command.operationId)));
   if(previous){const record=cipher.open(previous.payloadCiphertext,aad(owner,previous.revision,'history')) as {command:unknown};if(JSON.stringify(record.command)!==JSON.stringify(command))throw new AppError(409,'CONFLICT','Operation input differs');return repository.read(owner);}
   if(snapshot.revision!==command.expectedRevision)throw new AppError(409,'CONFLICT','Classification changed; reload before saving');
   if(snapshot.revision>=10000)throw new AppError(503,'INTERNAL_ERROR','Classification history requires review');
   let restore:ClassificationState|undefined;
   if(command.change.type==='restore'){const [row]=await db.select().from(revisions).where(and(eq(revisions.ownerId,owner),eq(revisions.revision,command.change.revision)));if(!row)throw new AppError(404,'NOT_FOUND','Revision unavailable');const record=cipher.open(row.payloadCiphertext,aad(owner,row.revision,'history')) as {state:unknown};restore=classificationStateSchema.parse(record.state);}
   let next:ClassificationState;try{next=applyClassification(snapshot.state,await sources(owner),command,restore,await manual?.list(owner)??[]);}catch(error){if(error instanceof AppError)throw error;throw invalidInput('Invalid classification, allocations or source confirmation');}
   const revision=snapshot.revision+1,now=new Date().toISOString(),state=cipher.seal(next,aad(owner,revision,'state')),history=cipher.seal({command,state:next},aad(owner,revision,'history'));
   const result=await db.execute(sql`with actor as (select id from users where id=${owner} and approval_status='approved' for share),${acquireFinanceScope(owner,scope)}, changed as (
    insert into finance_classification_workspaces (owner_id,revision,payload_ciphertext,created_at,updated_at)
    select ${owner},${revision},${state},${now}::timestamptz,${now}::timestamptz
    from acquired where (${snapshot.revision}=0 or exists(select 1 from finance_classification_workspaces where owner_id=${owner}))
    on conflict(owner_id) do update set revision=excluded.revision,payload_ciphertext=excluded.payload_ciphertext,updated_at=excluded.updated_at
    where finance_classification_workspaces.revision=${snapshot.revision}
    returning owner_id
   ) insert into finance_classification_revisions(owner_id,revision,operation_id,payload_ciphertext,created_at)
   select owner_id,${revision},${command.operationId},${history},${now}::timestamptz from changed returning revision`);
   if(!result.rows.length){const [retry]=await db.select().from(revisions).where(and(eq(revisions.ownerId,owner),eq(revisions.operationId,command.operationId)));if(retry){const record=cipher.open(retry.payloadCiphertext,aad(owner,retry.revision,'history')) as {command:unknown};if(JSON.stringify(record.command)===JSON.stringify(command))return repository.read(owner);}throw new AppError(409,'CONFLICT','Classification changed; reload before saving');}
   return repository.read(owner);
  },
 };
 return repository;
}
