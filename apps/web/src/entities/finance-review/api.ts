import {financeReviewSchema} from '@innova/contracts';
import {apiClient} from '@/shared/api/client';
export async function readReview(owner:string,month:string,signal?:AbortSignal){return financeReviewSchema.parse(await apiClient.get(`/finance/business/review?month=${encodeURIComponent(month)}`,{signal,cache:'no-store',headers:{'X-Expected-User':owner}}));}
