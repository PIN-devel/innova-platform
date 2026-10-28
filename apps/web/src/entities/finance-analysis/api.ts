import {financeAnalysisSchema} from '@innova/contracts';
import {apiClient} from '@/shared/api/client';
export async function readAnalysis(owner:string,month:string,signal?:AbortSignal){return financeAnalysisSchema.parse(await apiClient.get(`/finance/business/analysis?month=${encodeURIComponent(month)}`,{signal,cache:'no-store',headers:{'X-Expected-User':owner}}));}
