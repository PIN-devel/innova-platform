/* eslint-disable @tanstack/query/exhaustive-deps */
import {queryOptions,type QueryClient} from '@tanstack/react-query';
import {assertSessionVersion} from '@/entities/auth/session-version';
import {readSchedule} from './api';
export const scheduleKeys={all:['finance-schedule'] as const,owner:(owner:string,epoch:number)=>['finance-schedule',owner,epoch] as const,month:(owner:string,epoch:number,month:string)=>['finance-schedule',owner,epoch,month] as const};
export const scheduleQuery=(client:QueryClient,owner:string,epoch:number,month:string)=>queryOptions({queryKey:scheduleKeys.month(owner,epoch,month),meta:{sessionVersion:epoch},staleTime:0,gcTime:60_000,retry:false,queryFn:async({signal})=>{const result=await readSchedule(owner,month,signal);assertSessionVersion(client,epoch);return result;}});
