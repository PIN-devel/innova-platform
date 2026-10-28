import {pdfAttemptSchema,pdfPasswordStatusSchema,pdfPasswordRevealSchema,type PdfAttemptStart,type PdfAttemptUse} from '@innova/contracts';
import {apiClient} from '@/shared/api/client';
const init=(owner:string,signal?:AbortSignal)=>({signal,cache:'no-store' as const,headers:{'X-Expected-User':owner,'X-Finance-Request':'1'}});
export async function readPdfPasswordStatus(owner:string,signal?:AbortSignal){return pdfPasswordStatusSchema.parse(await apiClient.get('/finance/pdf-password/status',init(owner,signal)));}
export async function beginPdfPasswordAttempt(owner:string,input:PdfAttemptStart,signal?:AbortSignal){return pdfAttemptSchema.parse(await apiClient.post('/finance/pdf-password/attempts',input,init(owner,signal)));}
export async function revealPdfPassword(owner:string,input:PdfAttemptUse,signal?:AbortSignal){return pdfPasswordRevealSchema.parse(await apiClient.post('/finance/pdf-password/reveal',input,init(owner,signal)));}
export async function storePdfPassword(owner:string,input:PdfAttemptUse,secret:string,signal?:AbortSignal){return pdfPasswordStatusSchema.parse(await apiClient.post('/finance/pdf-password/save',{...input,secret,unlocked:true},init(owner,signal)));}
export async function deletePdfPassword(owner:string,input:PdfAttemptUse,signal?:AbortSignal){return pdfPasswordStatusSchema.parse(await apiClient.post('/finance/pdf-password/delete',input,init(owner,signal)));}
