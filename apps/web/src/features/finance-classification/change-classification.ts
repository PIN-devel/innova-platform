import type {QueryClient} from '@tanstack/react-query';
import type {ClassificationCommand,ClassificationView} from '@innova/contracts';
import {assertSessionVersion,subscribeSession,isSessionTransitioning} from '@/entities/auth/session-version';
import {changeClassification,readClassification} from '@/entities/finance-classification/api';
import {classificationKeys} from '@/entities/finance-classification/queries';
import {handleSessionApiError} from '@/features/auth/clear-protected-queries';
import {reviewKeys} from '@/entities/finance-review/queries';
import {analysisKeys} from '@/entities/finance-analysis/queries';
export async function saveClassification(client:QueryClient,owner:string,epoch:number,command:ClassificationCommand,signal:AbortSignal){
 const controller=new AbortController(),abort=()=>controller.abort();signal.throwIfAborted();assertSessionVersion(client,epoch);
 signal.addEventListener('abort',abort,{once:true});const stop=subscribeSession(client,()=>{try{assertSessionVersion(client,epoch);if(isSessionTransitioning(client))abort();}catch{abort();}});
 const key=classificationKeys.workspace(owner,epoch);
 const seed=(value:ClassificationView)=>{assertSessionVersion(client,epoch);client.setQueryData<ClassificationView>(key,old=>old&&old.revision>value.revision?old:value);};
 try{
  await client.cancelQueries({queryKey:key});assertSessionVersion(client,epoch);controller.signal.throwIfAborted();
  const result=await changeClassification(owner,command,controller.signal);assertSessionVersion(client,epoch);controller.signal.throwIfAborted();seed(result);await client.cancelQueries({queryKey:analysisKeys.all});assertSessionVersion(client,epoch);await client.invalidateQueries({queryKey:analysisKeys.all,refetchType:'none'});await client.cancelQueries({queryKey:reviewKeys.all});assertSessionVersion(client,epoch);await client.invalidateQueries({queryKey:reviewKeys.all,refetchType:'none'});
  try{const readback=await readClassification(owner,controller.signal);assertSessionVersion(client,epoch);controller.signal.throwIfAborted();if(readback.revision<result.revision)throw Error('Readback stale');seed(readback);return {verified:true,revision:result.revision};}
  catch(error){assertSessionVersion(client,epoch);controller.signal.throwIfAborted();if(handleSessionApiError(client,error))throw error;return {verified:false,revision:result.revision};}
 }catch(error){assertSessionVersion(client,epoch);handleSessionApiError(client,error);throw error;}
 finally{controller.abort();stop();signal.removeEventListener('abort',abort);}
}
