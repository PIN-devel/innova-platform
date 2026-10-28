import type {FinanceManualRepository} from './finance-manual.js';
import {buildFinanceReview,type BusinessDetail,type FinanceReview} from '@innova/contracts';
import type {FinanceBusinessRepository} from './finance-business.js';
import type {FinanceClassificationRepository} from './finance-classification.js';
import {AppError} from '../errors.js';
export interface FinanceReviewRepository {read(owner:string,month:string):Promise<FinanceReview>}
export function createFinanceReviewRepository(business:FinanceBusinessRepository,classification:FinanceClassificationRepository,manual?:FinanceManualRepository):FinanceReviewRepository {
 return {async read(owner,month){for(let attempt=0;attempt<3;attempt++){
  const sourceRevision=await business.revision?.(owner);
  const list=await business.list(owner),bankDocs=list.documents.filter(d=>d.kind==='kb-bank-pdf'&&d.state==='accepted');
  if(bankDocs.reduce((sum,d)=>sum+d.eventCount,0)>50000)throw new AppError(503,'INTERNAL_ERROR','Review history requires pagination');
  const classified=await classification.read(owner),details:BusinessDetail[]=[];
  // Bounded batches avoid a per-document network waterfall without flooding DB.
  for(let index=0;index<bankDocs.length;index+=8){const batch=await Promise.all(bankDocs.slice(index,index+8).map(d=>business.find(owner,d.id)));for(const d of batch){if(!d)throw new AppError(409,'CONFLICT','Source changed; retry review');details.push(d);}}
  const latest=await business.list(owner),token=(documents:typeof list.documents)=>documents.map(d=>d.id).sort().join(',');
  if(token(list.documents)!==token(latest.documents)||sourceRevision!==await business.revision?.(owner))continue;
  const result=buildFinanceReview(month,list,details,classified,new Date().toISOString(),await manual?.list(owner)??[]);
  if(sourceRevision!==await business.revision?.(owner))continue;return result;
 }throw new AppError(409,'CONFLICT','Sources changed; retry review');}};
}
