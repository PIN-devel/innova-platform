/* eslint-disable @tanstack/query/exhaustive-deps */
import {queryOptions,type QueryClient} from '@tanstack/react-query';
import {assertSessionVersion} from '@/entities/auth/session-version';
import {readReview} from './api';
export const reviewKeys={all:['finance-review'] as const,month:(owner:string,epoch:number,month:string)=>['finance-review',owner,epoch,month] as const};
export const reviewQuery=(client:QueryClient,owner:string,epoch:number,month:string)=>queryOptions({queryKey:reviewKeys.month(owner,epoch,month),meta:{sessionVersion:epoch},staleTime:0,gcTime:60_000,retry:false,queryFn:async({signal})=>{const result=await readReview(owner,month,signal);assertSessionVersion(client,epoch);return result;}});
