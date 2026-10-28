// QueryClient is a lifecycle coordinator, not HTTP resource identity.
/* eslint-disable @tanstack/query/exhaustive-deps */
import {queryOptions,type QueryClient} from '@tanstack/react-query';
import {assertSessionVersion} from '@/entities/auth/session-version';
import {listRawFiles} from './api';
export const financeRawKeys={all:['finance-raw'] as const,files:(owner:string,epoch:number)=>['finance-raw',owner,epoch,'files'] as const};
export const rawFilesQuery=(client:QueryClient,owner:string,epoch:number)=>queryOptions({queryKey:financeRawKeys.files(owner,epoch),meta:{sessionVersion:epoch},staleTime:0,gcTime:60_000,retry:false,queryFn:async({signal})=>{const data=await listRawFiles(owner,signal);assertSessionVersion(client,epoch);return data;}});
