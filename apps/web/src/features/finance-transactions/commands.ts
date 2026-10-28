import type {QueryClient} from '@tanstack/react-query';
import type {ManualSave,TransactionDelete,TransactionWorkspace} from '@innova/contracts';
import {assertSessionVersion,subscribeSession,isSessionTransitioning} from '@/entities/auth/session-version';
import {readTransactions,saveManual,deletionImpact,deleteTransaction,readDeletion,exportTransactions} from '@/entities/finance-transactions/api';
import {transactionKeys} from '@/entities/finance-transactions/queries';
import {handleSessionApiError} from '@/features/auth/clear-protected-queries';
export type TransactionCommand={type:'manual';value:ManualSave}|{type:'impact';id:string}|{type:'delete';value:TransactionDelete}|{type:'export';value:{from:string;to:string;includeNotes:boolean};operationId:string};
export async function runTransactionCommand(client:QueryClient,owner:string,epoch:number,command:TransactionCommand,signal:AbortSignal){
 const controller=new AbortController(),abort=()=>controller.abort();signal.throwIfAborted();assertSessionVersion(client,epoch);signal.addEventListener('abort',abort,{once:true});
 const stop=subscribeSession(client,()=>{try{assertSessionVersion(client,epoch);if(isSessionTransitioning(client))abort();}catch{abort();}});
 const check=()=>{assertSessionVersion(client,epoch);controller.signal.throwIfAborted();};
 try{
  if(command.type==='impact'){const impact=await deletionImpact(owner,command.id,controller.signal);check();return {impact};}
  if(command.type==='export'){const blob=await exportTransactions(owner,command.value,controller.signal);check();return {blob,operationId:command.operationId,fileName:`motifin-${command.value.from}-${command.value.to}.xlsx`};}
  const key=transactionKeys.workspace(owner,epoch),previous=client.getQueryData<TransactionWorkspace>(key);
  // Cancel all finance reads before a destructive write so late source results
  // cannot repopulate a deleted record after its successful response.
  const finance=(q:{queryKey:readonly unknown[]})=>String(q.queryKey[0]).startsWith('finance-');
  await client.cancelQueries({predicate:finance});check();
  const saved=command.type==='manual'?await saveManual(owner,command.value,controller.signal):await deleteTransaction(owner,command.value,controller.signal);check();
  client.removeQueries({predicate:finance});
  if(previous){const id=saved.id;client.setQueryData(key,{...previous,revision:'deleted' in saved?saved.revision:previous.revision,manual:'deleted' in saved?previous.manual.filter(t=>t.id!==id):[saved,...previous.manual.filter(t=>t.id!==id)],fileTransactions:previous.fileTransactions.filter(t=>!('deleted' in saved)||t.id!==id),duplicateCandidates:[]});}
  try{if(command.type==='delete'){await readDeletion(owner,saved.id,controller.signal);check();}const workspace=await readTransactions(owner,controller.signal);check();client.setQueryData(key,workspace);return {saved:true,deleted:command.type==='delete',verified:true};}
  catch(error){check();if(handleSessionApiError(client,error))throw error;return {saved:true,deleted:command.type==='delete',verified:false};}
 }catch(error){check();handleSessionApiError(client,error);throw error;}
 finally{controller.abort();stop();signal.removeEventListener('abort',abort);}
}
