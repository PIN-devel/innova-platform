import {businessDetailSchema,businessListSchema} from '@innova/contracts';
import {apiClient} from '@/shared/api/client';
const init=(owner:string,signal?:AbortSignal)=>({cache:'no-store' as const,signal,headers:{'X-Expected-User':owner,'X-Finance-Request':'1'}});
export async function listBusiness(owner:string,signal?:AbortSignal){return businessListSchema.parse(await apiClient.get('/finance/business/documents',init(owner,signal)));}
export async function readBusiness(owner:string,id:string,signal?:AbortSignal){return businessDetailSchema.parse(await apiClient.get(`/finance/business/documents/${encodeURIComponent(id)}`,init(owner,signal)));}
export async function processBusiness(owner:string,rawFileId:string,signal?:AbortSignal){return businessDetailSchema.parse(await apiClient.post('/finance/business/process',{rawFileId},init(owner,signal)));}
