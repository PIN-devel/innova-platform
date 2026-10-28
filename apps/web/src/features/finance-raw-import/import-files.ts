import type {FinanceRawFile} from '@innova/contracts';
import type {QueryClient} from '@tanstack/react-query';
import {assertSessionVersion,subscribeSession,isSessionTransitioning} from '@/entities/auth/session-version';
import {readRawFile,saveRawFile} from '@/entities/finance-raw/api';
import {financeRawKeys} from '@/entities/finance-raw/queries';
import {handleSessionApiError} from '@/features/auth/clear-protected-queries';
import {ApiError} from '@/shared/api/client';
import {processBusinessFile} from '@/features/finance-business/process-file';
import {parseRawFile} from './parse-file';
export type ImportFileResult={index:number;status:'saved'|'duplicate'|'failed';message:string;businessState?:'accepted'|'needs-review'|'invalid'|'failed'};
export async function importRawFiles(client:QueryClient,owner:string,epoch:number,files:File[],password:string,signal:AbortSignal,options?:{pdfLease?:{revision:number;attemptId:string};onPdfUnlocked?:()=>void}){
  const controller=new AbortController();
  const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});
  const stop=subscribeSession(client,()=>{try{assertSessionVersion(client,epoch);if(isSessionTransitioning(client))abort();}catch{abort();}});
  const results:ImportFileResult[]=[];const batchId=crypto.randomUUID();
  try{
    assertSessionVersion(client,epoch);signal.throwIfAborted();
    if(files.length<1||files.length>10)throw Error('한 번에 파일 1~10개를 선택해 주세요.');
    for(const [index,file] of files.entries()){
      controller.signal.throwIfAborted();assertSessionVersion(client,epoch);
      try{
        let unlocked=false;const document=await parseRawFile(file,password,controller.signal,()=>{unlocked=true;});if(unlocked)options?.onPdfUnlocked?.();
        controller.signal.throwIfAborted();assertSessionVersion(client,epoch);
        const result=await saveRawFile(owner,{batchId,document,...(document.kind==='kb-bank-pdf'&&options?.pdfLease?{pdfPasswordRevision:options.pdfLease.revision,pdfPasswordAttemptId:options.pdfLease.attemptId}:{})},controller.signal);
        assertSessionVersion(client,epoch);
        const readback=await readRawFile(owner,result.file.id,controller.signal);
        assertSessionVersion(client,epoch);
        const {fileHash:_,...expected}=document;
        if(JSON.stringify(readback.document)!==JSON.stringify(expected))throw Error('저장 결과를 확인하지 못했습니다. 같은 파일로 재시도해 주세요.');
        client.setQueryData<{files:FinanceRawFile[]}>(financeRawKeys.files(owner,epoch),previous=>previous?.files.some(f=>f.id===result.file.id)?previous:{files:[result.file,...(previous?.files??[])].slice(0,100)});
        let businessState:ImportFileResult['businessState']='failed';
        try{businessState=(await processBusinessFile(client,owner,epoch,result.file.id,controller.signal)).document.state;}
        catch(error){assertSessionVersion(client,epoch);controller.signal.throwIfAborted();if(error instanceof ApiError&&[401,403].includes(error.status))throw error;}
        const outcome=businessState==='accepted'?'거래 반영·재조회를 완료했습니다.':businessState==='needs-review'?'겹치는 자료나 거래 확인이 필요해 새 거래 반영을 보류했습니다.':businessState==='invalid'?'가져온 값의 검산에 실패해 거래 반영을 보류했습니다.':'자료 저장은 완료했지만 거래 반영 결과는 확인하지 못했습니다. 저장한 자료에서 다시 반영할 수 있습니다.';
        results.push({index:index+1,status:result.duplicate?'duplicate':'saved',businessState,message:(result.duplicate?'이미 저장한 자료입니다. ':'자료 저장을 완료했습니다. ')+outcome});
      }catch(error){
        assertSessionVersion(client,epoch);controller.signal.throwIfAborted();
        if(error instanceof ApiError&&[401,403].includes(error.status)){handleSessionApiError(client,error);throw error;}
        results.push({index:index+1,status:'failed',message:error instanceof ApiError||error instanceof TypeError?'반영 결과를 확인하지 못했습니다. 같은 파일로 재시도하면 중복 저장되지 않습니다.':error instanceof Error?error.message:'파일을 처리하지 못했습니다.'});
      }
    }
    return results;
  }finally{password='';controller.abort();stop();signal.removeEventListener('abort',abort);}
}
