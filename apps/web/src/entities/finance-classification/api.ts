import {classificationViewSchema,type ClassificationCommand} from '@innova/contracts';
import {apiClient} from '@/shared/api/client';
const init=(owner:string,signal?:AbortSignal)=>({signal,cache:'no-store' as const,headers:{'X-Expected-User':owner,'X-Finance-Request':'1'}});
export async function readClassification(owner:string,signal?:AbortSignal){return classificationViewSchema.parse(await apiClient.get('/finance/business/classification',init(owner,signal)));}
export async function changeClassification(owner:string,command:ClassificationCommand,signal?:AbortSignal){return classificationViewSchema.parse(await apiClient.post('/finance/business/classification',command,init(owner,signal)));}
