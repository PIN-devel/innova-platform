import {and,eq,sql} from 'drizzle-orm';
import {applySchedule,buildSchedule,buildScheduleSources,buildFinanceAnalysis,emptySchedule,scheduleStateSchema,scheduleCommandSchema,type ScheduleState,type ScheduleCommand,type ScheduleView,type BusinessDetail} from '@innova/contracts';
import type {createDatabase} from './client.js';
import type {FinanceBusinessRepository} from './finance-business.js';
import type {FinanceClassificationRepository} from './finance-classification.js';
import type {RawCipher} from '../finance-raw-crypto.js';
import {AppError,invalidInput} from '../errors.js';
import {financeScheduleWorkspaces as workspaces,financeScheduleRevisions as revisions} from './schema.js';
export interface FinanceScheduleRepository {read(owner:string,month:string):Promise<ScheduleView>;change(owner:string,month:string,command:ScheduleCommand):Promise<ScheduleView>}
const aad=(owner:string,revision:number,kind:string)=>JSON.stringify(['finance-schedule',1,owner,revision,kind]);
export function createFinanceScheduleRepository(db:ReturnType<typeof createDatabase>,business:FinanceBusinessRepository,classification:FinanceClassificationRepository,cipher:RawCipher):FinanceScheduleRepository {
 const decode=(owner:string,revision:number,payload:string)=>scheduleStateSchema.parse(cipher.open(payload,aad(owner,revision,'state')));
 async function current(owner:string){const [row]=await db.select().from(workspaces).where(eq(workspaces.ownerId,owner));return {revision:row?.revision??0,state:row?decode(owner,row.revision,row.payloadCiphertext):emptySchedule()};}
 async function sources(owner:string,month:string){const [list,classified]=await Promise.all([business.list(owner),classification.read(owner)]),docs=list.documents.filter(d=>d.state==='accepted'&&d.kind==='kb-bank-pdf');if(docs.reduce((sum,d)=>sum+d.eventCount,0)>60000)throw new AppError(503,'INTERNAL_ERROR','Schedule history requires review');const details:BusinessDetail[]=[];for(let index=0;index<docs.length;index+=8){const batch=await Promise.all(docs.slice(index,index+8).map(d=>business.find(owner,d.id)));for(const d of batch){if(!d)throw new AppError(409,'CONFLICT','Source changed');details.push(d);}}return {...buildScheduleSources(list,details,classified),analysis:buildFinanceAnalysis(month,classified,new Date().toISOString())};
 }

 const repository:FinanceScheduleRepository={async read(owner,month){const snapshot=await current(owner),source=await sources(owner,month);return buildSchedule(month,snapshot.state,source.evidence,source.bills,source.analysis,snapshot.revision,new Date().toISOString());},async change(owner,month,command){
  const snapshot=await current(owner),[old]=await db.select().from(revisions).where(and(eq(revisions.ownerId,owner),eq(revisions.operationId,command.operationId)));
  if(old){const record=cipher.open(old.payloadCiphertext,aad(owner,old.revision,'history')) as {command:unknown};if(JSON.stringify(record.command)!==JSON.stringify(command))throw new AppError(409,'CONFLICT','Operation differs');return repository.read(owner,month);}
  if(snapshot.revision!==command.expectedRevision)throw new AppError(409,'CONFLICT','Schedule changed; reload before saving');if(snapshot.revision>=10000)throw new AppError(503,'INTERNAL_ERROR','Schedule history requires review');
  const source=await sources(owner,month);let next:ScheduleState;try{next=applySchedule(snapshot.state,scheduleCommandSchema.parse(command),source.evidence);}catch{throw invalidInput('Invalid schedule, date or evidence');}
  const revision=snapshot.revision+1,now=new Date().toISOString(),payload=cipher.seal(next,aad(owner,revision,'state')),history=cipher.seal({command,state:next},aad(owner,revision,'history'));
  const result=await db.execute(sql`with actor as (select id from users where id=${owner} and approval_status='approved' for share), changed as (
   insert into finance_schedule_workspaces(owner_id,revision,payload_ciphertext,created_at,updated_at)
   select ${owner},${revision},${payload},${now}::timestamptz,${now}::timestamptz
   from actor where (${snapshot.revision}=0 or exists(select 1 from finance_schedule_workspaces where owner_id=${owner}))
   on conflict(owner_id) do update set revision=excluded.revision,payload_ciphertext=excluded.payload_ciphertext,updated_at=excluded.updated_at where finance_schedule_workspaces.revision=${snapshot.revision} returning owner_id
  ) insert into finance_schedule_revisions(owner_id,revision,operation_id,payload_ciphertext,created_at) select owner_id,${revision},${command.operationId},${history},${now}::timestamptz from changed returning revision`);
  if(!result.rows.length){const [retry]=await db.select().from(revisions).where(and(eq(revisions.ownerId,owner),eq(revisions.operationId,command.operationId)));if(retry){const record=cipher.open(retry.payloadCiphertext,aad(owner,retry.revision,'history')) as {command:unknown};if(JSON.stringify(record.command)===JSON.stringify(command))return repository.read(owner,month);}throw new AppError(409,'CONFLICT','Schedule changed; reload before saving');}
  return repository.read(owner,month);
 }};return repository;
}
