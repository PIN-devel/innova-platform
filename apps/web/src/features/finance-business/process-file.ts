import type {QueryClient} from '@tanstack/react-query';
import type {BusinessList} from '@innova/contracts';
import {assertSessionVersion,subscribeSession,isSessionTransitioning} from '@/entities/auth/session-version';
import {processBusiness,readBusiness} from '@/entities/finance-business/api';
import {businessKeys} from '@/entities/finance-business/queries';
import {handleSessionApiError} from '@/features/auth/clear-protected-queries';
export async function processBusinessFile(client:QueryClient,owner:string,epoch:number,rawFileId:string,signal:AbortSignal){
 const controller=new AbortController(),abort=()=>controller.abort();signal.throwIfAborted();assertSessionVersion(client,epoch);
 signal.addEventListener('abort',abort,{once:true});const stop=subscribeSession(client,()=>{try{assertSessionVersion(client,epoch);if(isSessionTransitioning(client))abort();}catch{abort();}});
 try{
  const result=await processBusiness(owner,rawFileId,controller.signal);assertSessionVersion(client,epoch);controller.signal.throwIfAborted();
  const readback=await readBusiness(owner,result.document.id,controller.signal);assertSessionVersion(client,epoch);controller.signal.throwIfAborted();
  if(JSON.stringify(readback)!==JSON.stringify(result))throw Error('Business readback differs');
  client.setQueryData(businessKeys.detail(owner,epoch,result.document.id),readback);
  client.setQueryData<BusinessList>(businessKeys.list(owner,epoch),old=>({documents:[readback.document,...(old?.documents??[]).filter(d=>d.id!==readback.document.id)],settlements:[]}));
  return readback;
 }catch(error){assertSessionVersion(client,epoch);handleSessionApiError(client,error);throw error;}
 finally{controller.abort();stop();signal.removeEventListener('abort',abort);}
}
