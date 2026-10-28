/* eslint-disable @tanstack/query/exhaustive-deps */
import {queryOptions,type QueryClient} from '@tanstack/react-query';
import {assertSessionVersion} from '@/entities/auth/session-version';
import {readPdfPasswordStatus} from './api';
export const pdfPasswordKeys={all:['finance-pdf-password'] as const,status:(owner:string,epoch:number)=>['finance-pdf-password',owner,epoch,'status'] as const};
export const pdfPasswordStatusQuery=(client:QueryClient,owner:string,epoch:number)=>queryOptions({queryKey:pdfPasswordKeys.status(owner,epoch),meta:{sessionVersion:epoch},staleTime:0,gcTime:60_000,retry:false,queryFn:async({signal})=>{const result=await readPdfPasswordStatus(owner,signal);assertSessionVersion(client,epoch);return result;}});
