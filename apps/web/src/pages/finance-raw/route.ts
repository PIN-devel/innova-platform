import type {QueryClient} from '@tanstack/react-query';
import {ApiError} from '@/shared/api/client';
import {data,type LoaderFunctionArgs,type ActionFunctionArgs} from 'react-router';
import {requireAccess} from '@/features/auth/route-session';
import {assertSessionVersion} from '@/entities/auth/session-version';
import {rawFilesQuery} from '@/entities/finance-raw/queries';
import {loadRouteQuery} from '@/shared/lib/router-query/route-query';
import {businessListQuery,businessDetailQuery} from '@/entities/finance-business/queries';
import {processBusinessFile} from '@/features/finance-business/process-file';
import {importWithPdfPassword} from '@/features/finance-raw-import/import-with-pdf-password';
import {pdfPasswordStatusQuery} from '@/entities/finance-pdf-password/queries';
export const rawLoader=(client:QueryClient)=>async({request,context}:LoaderFunctionArgs)=>{const {user,epoch}=requireAccess(context,client,request,'exam');await Promise.all([loadRouteQuery(client,pdfPasswordStatusQuery(client,user!.id,epoch),request,()=>assertSessionVersion(client,epoch)).catch(error=>{assertSessionVersion(client,epoch);if(error instanceof ApiError&&[401,403].includes(error.status))throw error;}),loadRouteQuery(client,rawFilesQuery(client,user!.id,epoch),request,()=>assertSessionVersion(client,epoch)),loadRouteQuery(client,businessListQuery(client,user!.id,epoch),request,()=>assertSessionVersion(client,epoch))]);const id=new URL(request.url).searchParams.get('document');if(id&&/^[a-f0-9-]{36}$/i.test(id))await loadRouteQuery(client,businessDetailQuery(client,user!.id,epoch,id),request,()=>assertSessionVersion(client,epoch));return null;};
export const rawAction=(client:QueryClient)=>async({request,context}:ActionFunctionArgs)=>{
  const {user,epoch}=requireAccess(context,client,request,'exam');
  try{const form=await request.formData();if(form.get('intent')==='process-business'){const processed=await processBusinessFile(client,user!.id,epoch,String(form.get('rawFileId')??''),request.signal);return {businessState:processed.document.state};}const files=form.getAll('files').filter((f):f is File=>f instanceof File&&f.size>0);
    const password=String(form.get('password')??''),accountPassword=String(form.get('accountPassword')??'');form.delete('password');form.delete('accountPassword');return await importWithPdfPassword(client,user!.id,epoch,files,password,accountPassword,form.get('useSaved')==='on',form.get('savePassword')==='on',request.signal);
  }catch(error){assertSessionVersion(client,epoch);request.signal.throwIfAborted();return data({error:error instanceof ApiError&&error.code==='RATE_LIMITED'?'재확인 요청이 많습니다. 5분 뒤 다시 시도해 주세요.':error instanceof ApiError&&error.code==='INVALID_CREDENTIALS'?'계정 비밀번호를 확인하거나 이번만 직접 입력을 선택해 주세요.':'자료를 반영하지 못했습니다. 로그인·저장 암호 상태와 파일을 확인하거나 이번만 직접 입력해 주세요.'},{status:400});}
};
