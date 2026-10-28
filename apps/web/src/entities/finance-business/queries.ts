// QueryClient coordinates session lifetime; it is not part of resource identity.
/* eslint-disable @tanstack/query/exhaustive-deps */
import {queryOptions,type QueryClient} from '@tanstack/react-query';
import {assertSessionVersion} from '@/entities/auth/session-version';
import {listBusiness,readBusiness} from './api';
export const businessKeys={all:['finance-business'] as const,list:(owner:string,epoch:number)=>['finance-business',owner,epoch,'documents'] as const,detail:(owner:string,epoch:number,id:string)=>['finance-business',owner,epoch,'document',id] as const};
const policy=(epoch:number)=>({meta:{sessionVersion:epoch},staleTime:0,gcTime:60_000,retry:false});
export const businessListQuery=(client:QueryClient,owner:string,epoch:number)=>queryOptions({...policy(epoch),queryKey:businessKeys.list(owner,epoch),queryFn:async({signal})=>{const result=await listBusiness(owner,signal);assertSessionVersion(client,epoch);return result;}});
export const businessDetailQuery=(client:QueryClient,owner:string,epoch:number,id:string)=>queryOptions({...policy(epoch),queryKey:businessKeys.detail(owner,epoch,id),queryFn:async({signal})=>{const result=await readBusiness(owner,id,signal);assertSessionVersion(client,epoch);return result;}});
