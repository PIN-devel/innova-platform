import {financeRawFilesSchema,financeRawReadbackSchema,financeRawResultSchema,type FinanceRawImport} from '@innova/contracts';
import {apiClient} from '@/shared/api/client';
const init=(owner:string,signal?:AbortSignal)=>({cache:'no-store' as const,signal,headers:{'X-Expected-User':owner,'X-Finance-Request':'1'}});
export async function listRawFiles(owner:string,signal?:AbortSignal){return financeRawFilesSchema.parse(await apiClient.get('/finance/raw/files',init(owner,signal)));}
export async function readRawFile(owner:string,id:string,signal?:AbortSignal){return financeRawReadbackSchema.parse(await apiClient.get(`/finance/raw/files/${encodeURIComponent(id)}`,init(owner,signal)));}
export async function saveRawFile(owner:string,input:FinanceRawImport,signal?:AbortSignal){return financeRawResultSchema.parse(await apiClient.post('/finance/raw/imports',input,init(owner,signal)));}
