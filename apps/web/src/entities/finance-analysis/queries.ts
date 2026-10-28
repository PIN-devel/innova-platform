/* eslint-disable @tanstack/query/exhaustive-deps */
import {queryOptions,type QueryClient} from '@tanstack/react-query';
import {assertSessionVersion} from '@/entities/auth/session-version';
import {readAnalysis} from './api';
export const analysisKeys={all:['finance-analysis'] as const,month:(owner:string,epoch:number,month:string)=>['finance-analysis',owner,epoch,month] as const};
export const analysisQuery=(client:QueryClient,owner:string,epoch:number,month:string)=>queryOptions({queryKey:analysisKeys.month(owner,epoch,month),meta:{sessionVersion:epoch},staleTime:0,gcTime:60_000,retry:false,queryFn:async({signal})=>{const result=await readAnalysis(owner,month,signal);assertSessionVersion(client,epoch);return result;}});
