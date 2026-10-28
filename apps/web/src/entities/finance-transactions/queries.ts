/* eslint-disable @tanstack/query/exhaustive-deps */
import {queryOptions,type QueryClient} from '@tanstack/react-query';
import {assertSessionVersion} from '@/entities/auth/session-version';
import {readTransactions} from './api';
export const transactionKeys={all:['finance-transactions'] as const,workspace:(owner:string,epoch:number)=>['finance-transactions',owner,epoch] as const};
export const transactionQuery=(client:QueryClient,owner:string,epoch:number)=>queryOptions({queryKey:transactionKeys.workspace(owner,epoch),queryFn:async({signal})=>{const result=await readTransactions(owner,signal);assertSessionVersion(client,epoch);return result;},staleTime:0,gcTime:60000,retry:false,meta:{sessionVersion:epoch}});
