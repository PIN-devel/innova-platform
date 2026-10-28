import type {QueryClient} from '@tanstack/react-query';
import type {PdfPasswordStatus} from '@innova/contracts';
import {assertSessionVersion,subscribeSession,isSessionTransitioning} from '@/entities/auth/session-version';
import {beginPdfPasswordAttempt,readPdfPasswordStatus,revealPdfPassword,storePdfPassword} from '@/entities/finance-pdf-password/api';
import {pdfPasswordKeys} from '@/entities/finance-pdf-password/queries';
import {subscribePdfPasswordChange,notifyPdfPasswordChange} from '@/features/finance-pdf-password/secret-lifetime';
import {handleSessionApiError} from '@/features/auth/clear-protected-queries';
import {importRawFiles} from './import-files';
export async function importWithPdfPassword(client:QueryClient,owner:string,epoch:number,files:File[],password:string,accountPassword:string,useSaved:boolean,save:boolean,signal:AbortSignal){
 const controller=new AbortController(),abort=()=>controller.abort();signal.throwIfAborted();assertSessionVersion(client,epoch);signal.addEventListener('abort',abort,{once:true});const stopSession=subscribeSession(client,()=>{try{assertSessionVersion(client,epoch);if(isSessionTransitioning(client))abort();}catch{abort();}}),stopSecret=useSaved?subscribePdfPasswordChange(abort):()=>{};
 let lease:{revision:number;attemptId:string}|undefined,unlocked=false,expiry:ReturnType<typeof setTimeout>|undefined;const check=()=>{assertSessionVersion(client,epoch);controller.signal.throwIfAborted();};
 const seed=(value:PdfPasswordStatus)=>{check();client.setQueryData<PdfPasswordStatus>(pdfPasswordKeys.status(owner,epoch),old=>old&&old.revision>value.revision?old:value);};
 try{
  if(files.length<1||files.length>10)throw Error('Select 1-10 files');let hasPdf=false;for(const file of files){check();if(file.size>20_000_000)throw Error('File too large');const bytes=await file.slice(0,5).arrayBuffer();check();if(String.fromCharCode(...new Uint8Array(bytes))==='%PDF-')hasPdf=true;}
  if(hasPdf&&useSaved){const status=await readPdfPasswordStatus(owner,controller.signal);check();seed(status);if(!status.stored||!status.canUse)throw Error('Saved PDF password unavailable');const attempt=await beginPdfPasswordAttempt(owner,{attemptId:crypto.randomUUID(),expectedRevision:status.revision,purpose:'use',...(accountPassword?{accountPassword}:{})},controller.signal);check();expiry=setTimeout(abort,Math.max(0,Math.min(attempt.expiresInMs,Date.parse(attempt.expiresAt)-Date.now())));const revealed=await revealPdfPassword(owner,{attemptId:attempt.attemptId,expectedRevision:attempt.revision},controller.signal);check();password=revealed.secret;revealed.secret='';lease={revision:attempt.revision,attemptId:attempt.attemptId};}
  const results=await importRawFiles(client,owner,epoch,files,password,controller.signal,{pdfLease:lease,onPdfUnlocked:()=>{unlocked=true;}});check();let passwordStorage:'saved'|'failed'|'unchanged'='unchanged';
  if(save&&!useSaved&&hasPdf&&unlocked&&password){try{const status=await readPdfPasswordStatus(owner,controller.signal);check();const attempt=await beginPdfPasswordAttempt(owner,{attemptId:crypto.randomUUID(),expectedRevision:status.revision,purpose:'save',...(accountPassword?{accountPassword}:{})},controller.signal);check();const stored=await storePdfPassword(owner,{attemptId:attempt.attemptId,expectedRevision:attempt.revision},password,controller.signal);check();await client.cancelQueries({queryKey:pdfPasswordKeys.all});check();seed(stored);passwordStorage='saved';notifyPdfPasswordChange();}catch(error){check();if(handleSessionApiError(client,error))throw error;passwordStorage='failed';}}
  return {results,passwordStorage};
 }catch(error){assertSessionVersion(client,epoch);handleSessionApiError(client,error);throw error;}finally{if(expiry!==undefined)clearTimeout(expiry);password='';accountPassword='';lease=undefined;controller.abort();stopSession();stopSecret();signal.removeEventListener('abort',abort);}
}
