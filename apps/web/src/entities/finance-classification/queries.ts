/* eslint-disable @tanstack/query/exhaustive-deps */
import {queryOptions,type QueryClient} from '@tanstack/react-query';
import {assertSessionVersion} from '@/entities/auth/session-version';
import {readClassification} from './api';
export const classificationKeys={all:['finance-classification'] as const,workspace:(owner:string,epoch:number)=>['finance-classification',owner,epoch] as const};
export const classificationQuery=(client:QueryClient,owner:string,epoch:number)=>queryOptions({queryKey:classificationKeys.workspace(owner,epoch),meta:{sessionVersion:epoch},staleTime:0,gcTime:60_000,retry:false,queryFn:async({signal})=>{const result=await readClassification(owner,signal);assertSessionVersion(client,epoch);return result;}});
