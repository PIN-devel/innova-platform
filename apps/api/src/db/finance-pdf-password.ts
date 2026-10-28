import {randomUUID} from 'node:crypto';
import {and,desc,eq,gte,lt,sql} from 'drizzle-orm';
import type {PdfPasswordStatus,PdfAttemptStart,PdfAttempt,PdfAttemptUse} from '@innova/contracts';
import type {createDatabase} from './client.js';
import type {PdfPasswordCipher} from '../finance-pdf-crypto.js';
import {financePdfSecrets as secrets,financePdfSecretAttempts as attempts} from './schema.js';
import {AppError} from '../errors.js';
export type PdfSecretContext={owner:string;sessionHash:string;authTime?:number};
export interface PdfPasswordRepository {
 status(context:PdfSecretContext):Promise<PdfPasswordStatus>;
 begin(context:PdfSecretContext,input:PdfAttemptStart,verify:(password:string)=>Promise<boolean>):Promise<PdfAttempt>;
 save(context:PdfSecretContext,input:PdfAttemptUse,secret:string):Promise<PdfPasswordStatus>;
 reveal(context:PdfSecretContext,input:PdfAttemptUse):Promise<{secret:string;revision:number}>;
 remove(context:PdfSecretContext,input:PdfAttemptUse):Promise<PdfPasswordStatus>;
 rotate(context:PdfSecretContext,input:PdfAttemptUse):Promise<PdfPasswordStatus>;
}
export function createPdfPasswordRepository(db:ReturnType<typeof createDatabase>,cipher:PdfPasswordCipher|undefined,clock=()=>new Date()):PdfPasswordRepository {
 const conflict=()=>new AppError(409,'CONFLICT','Stored PDF password changed or attempt is unavailable');
 const unavailable=()=>new AppError(503,'INTERNAL_ERROR','Stored PDF password is unavailable; use manual input');
 const head=async(owner:string)=>(await db.select().from(secrets).where(eq(secrets.ownerId,owner)))[0];
 const attempt=async(c:PdfSecretContext,id:string)=>(await db.select().from(attempts).where(and(eq(attempts.ownerId,c.owner),eq(attempts.id,id))))[0];
 const fresh=async(c:PdfSecretContext)=>{const now=clock().getTime();if(typeof c.authTime==='number'&&Number.isFinite(c.authTime)&&now/1000-c.authTime>=0&&now/1000-c.authTime<=300)return new Date(c.authTime*1000);const [a]=await db.select().from(attempts).where(and(eq(attempts.ownerId,c.owner),eq(attempts.sessionHash,c.sessionHash),gte(attempts.reauthenticatedAt,new Date(now-300000)),gte(attempts.expiresAt,new Date(now)))).orderBy(desc(attempts.reauthenticatedAt)).limit(1);return a?.reauthenticatedAt??undefined;};
 const validAttempt=(c:PdfSecretContext,a:Awaited<ReturnType<typeof attempt>>,input:PdfAttemptUse,purpose:string,consumed=false)=>!!a&&a.sessionHash===c.sessionHash&&a.expectedRevision===input.expectedRevision&&a.purpose===purpose&&a.expiresAt.getTime()>clock().getTime()&&!!a.reauthenticatedAt&&a.reauthenticatedAt.getTime()>=clock().getTime()-300000&&(consumed||!a.consumedAt);
 const guard=(c:PdfSecretContext,input:PdfAttemptUse,purpose:string,now:string)=>sql`select c.owner_id,c.id,c.revision,c.payload_ciphertext,c.key_version,c.nonce,a.id as attempt_id
   from finance_pdf_secrets c join finance_pdf_secret_attempts a on a.owner_id=c.owner_id join users u on u.id=c.owner_id
   where c.owner_id=${c.owner} and c.revision=${input.expectedRevision} and u.approval_status='approved'
    and a.id=${input.attemptId} and a.expected_revision=c.revision and a.session_hash=${c.sessionHash} and a.purpose=${purpose}
    and a.expires_at>${now}::timestamptz and a.reauthenticated_at>${now}::timestamptz-interval '5 minutes' and a.consumed_at is null
   for update of c,a for share of u`;
 const open=(c:PdfSecretContext,row:NonNullable<Awaited<ReturnType<typeof head>>>)=>{if(!cipher||!row.payloadCiphertext||!row.keyVersion||!row.nonce)throw unavailable();try{return cipher.open(c.owner,row.id,row.revision,row.payloadCiphertext,row.keyVersion,row.nonce);}catch{throw unavailable();}};
 async function write(c:PdfSecretContext,input:PdfAttemptUse,secret:string,purpose:'save'|'rotate'){
  if(!cipher)throw unavailable();const old=await attempt(c,input.attemptId),row=await head(c.owner);
  if(old?.resultRevision!==null&&old?.resultRevision!==undefined&&validAttempt(c,old,input,purpose,true)&&row?.revision===old.resultRevision&&row.payloadCiphertext){if(open(c,row)!==secret)throw conflict();return repository.status(c);}
  if(!row||row.revision!==input.expectedRevision||!validAttempt(c,old,input,purpose))throw conflict();
  for(let retry=0;retry<3;retry++){
   const sealed=cipher.seal(c.owner,row.id,input.expectedRevision+1,secret),now=clock().toISOString();
   const result=await db.execute(sql`with guarded as (${guard(c,input,purpose,now)}), reserved as (
    insert into finance_pdf_secret_nonces(key_version,nonce,created_at) select ${sealed.keyVersion},${sealed.nonce},${now}::timestamptz from guarded on conflict do nothing returning nonce
   ), changed as (
    update finance_pdf_secrets c set revision=c.revision+1,payload_ciphertext=${sealed.payload},key_version=${sealed.keyVersion},nonce=${sealed.nonce},updated_at=${now}::timestamptz
    where c.owner_id in(select owner_id from guarded) and exists(select 1 from reserved) returning c.owner_id,c.revision
   ), consumed as (
    update finance_pdf_secret_attempts a set consumed_at=${now}::timestamptz,result_revision=changed.revision from changed
    where a.owner_id=changed.owner_id and a.id=${input.attemptId} returning a.id
   ) select revision from changed`);
   if(result.rows.length)return repository.status(c);
   const current=await head(c.owner);if(current?.revision!==input.expectedRevision){const completed=await attempt(c,input.attemptId);if(completed?.resultRevision===current?.revision&&current?.payloadCiphertext&&validAttempt(c,completed,input,purpose,true)&&open(c,current)===secret)return repository.status(c);throw conflict();}
  }throw unavailable();
 }
 const repository:PdfPasswordRepository={
  async status(c){const row=await head(c.owner);return {stored:!!row?.payloadCiphertext,revision:row?.revision??0,updatedAt:row?.updatedAt?.toISOString()??null,available:!!cipher,canUse:!!(row?.payloadCiphertext&&row.keyVersion&&cipher?.has(row.keyVersion)),reauthRequired:!await fresh(c)};},
  async begin(c,input,verify){
   if(input.purpose!=='delete'&&!cipher)throw unavailable();const prior=await attempt(c,input.attemptId);
   if(prior){if(prior.purpose===input.purpose&&validAttempt(c,prior,{attemptId:input.attemptId,expectedRevision:input.expectedRevision},input.purpose))return {attemptId:prior.id,revision:prior.expectedRevision,expiresAt:prior.expiresAt.toISOString(),expiresInMs:Math.min(600000,Math.max(0,prior.expiresAt.getTime()-clock().getTime()))};throw conflict();}
   const now=clock().toISOString(),expires=new Date(clock().getTime()+600000).toISOString();
   await db.delete(attempts).where(and(eq(attempts.ownerId,c.owner),lt(attempts.expiresAt,clock())));
   const result=await db.execute(sql`with actor as (select id from users where id=${c.owner} and approval_status='approved' for share), admitted as (
    insert into finance_pdf_secrets(owner_id,id,revision,created_at,rate_started_at,rate_count)
    select id,${randomUUID()},0,${now}::timestamptz,${now}::timestamptz,1 from actor
    on conflict(owner_id) do update set
     rate_started_at=case when finance_pdf_secrets.rate_started_at<=${now}::timestamptz-interval '5 minutes' then ${now}::timestamptz else finance_pdf_secrets.rate_started_at end,
     rate_count=case when finance_pdf_secrets.rate_started_at<=${now}::timestamptz-interval '5 minutes' then 1 else finance_pdf_secrets.rate_count+1 end
    where finance_pdf_secrets.revision=${input.expectedRevision} and (finance_pdf_secrets.rate_count<5 or finance_pdf_secrets.rate_started_at<=${now}::timestamptz-interval '5 minutes') and exists(select 1 from actor)
    returning owner_id,revision,payload_ciphertext
   ), inserted as (
    insert into finance_pdf_secret_attempts(owner_id,id,purpose,expected_revision,session_hash,created_at,expires_at)
    select owner_id,${input.attemptId},${input.purpose},revision,${c.sessionHash},${now}::timestamptz,${expires}::timestamptz from admitted
    where revision=${input.expectedRevision} and (${input.purpose} not in ('use','rotate') or payload_ciphertext is not null) on conflict do nothing returning id
   ) select id from inserted`);
   if(!result.rows.length){const current=await head(c.owner);if(current?.revision===input.expectedRevision&&current.rateCount>=5)throw new AppError(429,'RATE_LIMITED','Try again after five minutes');throw conflict();}
   let authenticatedAt=await fresh(c);if(!authenticatedAt){if(!input.accountPassword||!await verify(input.accountPassword))throw new AppError(401,'INVALID_CREDENTIALS','Account password confirmation required');authenticatedAt=clock();}
   const authorized=await db.execute(sql`with actor as (select id from users where id=${c.owner} and approval_status='approved' for share)
    update finance_pdf_secret_attempts a set reauthenticated_at=${authenticatedAt.toISOString()}::timestamptz where a.owner_id=${c.owner} and a.id=${input.attemptId} and a.session_hash=${c.sessionHash}
    and exists(select 1 from actor) and exists(select 1 from finance_pdf_secrets c where c.owner_id=a.owner_id and c.revision=a.expected_revision) returning a.id`);
   if(!authorized.rows.length)throw conflict();return {attemptId:input.attemptId,revision:input.expectedRevision,expiresAt:expires,expiresInMs:Math.min(600000,Math.max(0,Date.parse(expires)-clock().getTime()))};
  },
  save(c,input,secret){return write(c,input,secret,'save');},
  async reveal(c,input){if(!cipher)throw unavailable();const now=clock().toISOString();const result=await db.execute(sql`with guarded as (${guard(c,input,'use',now)}), consumed as (
   update finance_pdf_secret_attempts a set consumed_at=${now}::timestamptz from guarded g where a.owner_id=g.owner_id and a.id=g.attempt_id and g.payload_ciphertext is not null returning a.id
  ) select g.id,g.revision,g.payload_ciphertext,g.key_version,g.nonce from guarded g where exists(select 1 from consumed)`);
   const r=result.rows[0];if(!r)throw conflict();let secret:string;try{secret=cipher.open(c.owner,String(r.id),Number(r.revision),String(r.payload_ciphertext),String(r.key_version),String(r.nonce));}catch{throw unavailable();}
   const latest=await head(c.owner);if(latest?.revision!==input.expectedRevision)throw conflict();return {secret,revision:input.expectedRevision};
  },
  async remove(c,input){const old=await attempt(c,input.attemptId),row=await head(c.owner);if(old?.resultRevision!==null&&old?.resultRevision!==undefined&&validAttempt(c,old,input,'delete',true)&&row&&!row.payloadCiphertext)return repository.status(c);
   const now=clock().toISOString(),result=await db.execute(sql`with guarded as (${guard(c,input,'delete',now)}), changed as (
    update finance_pdf_secrets c set revision=case when c.payload_ciphertext is null then c.revision else c.revision+1 end,
     updated_at=case when c.payload_ciphertext is null then c.updated_at else ${now}::timestamptz end,payload_ciphertext=null,key_version=null,nonce=null
    where c.owner_id in(select owner_id from guarded) returning c.owner_id,c.revision
   ), consumed as (
    update finance_pdf_secret_attempts a set consumed_at=${now}::timestamptz,result_revision=changed.revision from changed where a.owner_id=changed.owner_id and a.id=${input.attemptId} returning a.id
   ) select revision from changed`);if(!result.rows.length)throw conflict();return repository.status(c);
  },
  async rotate(c,input){const a=await attempt(c,input.attemptId),row=await head(c.owner);if(!row||!validAttempt(c,a,input,'rotate',true))throw conflict();if(a?.resultRevision===row.revision&&a.consumedAt)return repository.status(c);if(a?.consumedAt||row.revision!==input.expectedRevision)throw conflict();let secret=open(c,row);try{return await write(c,input,secret,'rotate');}finally{secret='';}},
 };return repository;
}
