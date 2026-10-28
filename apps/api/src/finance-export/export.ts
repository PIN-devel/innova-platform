import {financeExportSchema,buildFinanceReview,type BusinessDetail} from '@innova/contracts';
import type {createDatabase} from '../db/client.js';
import type {FinanceBusinessRepository} from '../db/finance-business.js';
import type {FinanceManualRepository} from '../db/finance-manual.js';
import type {FinanceClassificationRepository} from '../db/finance-classification.js';
import type {FinanceRawRepository} from '../db/finance-raw.js';
import {financeRevision} from '../db/finance-write-scope.js';
import {AppError} from '../errors.js';
import {financeWorkbook,type ExportSheet} from './workbook.js';
const safe=(text:string)=>text.replace(/(?:\d[ -]?){8,20}/g,'[식별정보 가림]');
export function createFinanceExport(db:ReturnType<typeof createDatabase>,business:FinanceBusinessRepository,manual:FinanceManualRepository,classification:FinanceClassificationRepository,raw:FinanceRawRepository){return async(owner:string,value:unknown)=>{
 const input=financeExportSchema.parse(value),revision=await financeRevision(db,owner),list=await business.list(owner),details:BusinessDetail[]=[];
 if(list.documents.reduce((sum,d)=>sum+d.eventCount,0)>50000)throw new AppError(413,'INVALID_INPUT','Export exceeds safe size; reduce retained history');
 for(let offset=0;offset<list.documents.length;offset+=8){const batch=await Promise.all(list.documents.slice(offset,offset+8).map(d=>business.find(owner,d.id)));for(const d of batch)if(d)details.push(d);}
 const records=await manual.list(owner),classified=await classification.read(owner),now=new Date().toISOString();
 const inRange=(date:string|null)=>date!==null&&date.slice(0,7)>=input.from&&date.slice(0,7)<=input.to;
 const transactions:ExportSheet={name:'거래 상세',rows:[['거래 ID','원천','거래 종류','기준일','거래처·거래명','원천 금액(KRW 정수 텍스트)','유효 금액(KRW 정수 텍스트)','소비 반영 여부','자료 문서 ID','관련 거래 ID','개인 메모','자료 상태']]};
 const splits:ExportSheet={name:'분할 내역',rows:[['거래 ID','카테고리 ID','카테고리명','배분 금액(KRW 정수 텍스트)']]};
 for(const detail of details){
  const source=detail.document.kind==='kb-bank-pdf'?'은행':'카드',bankRaw=source==='은행'&&detail.events.some(e=>inRange(e.occurredOn))?await raw.find(owner,detail.document.rawFileId):null;
  for(const event of detail.events){const t=classified.transactions.find(t=>t.event.id===event.id),effective=t?.effective,date=effective?.occurredOn??event.occurredOn??detail.document.dueDate;
   const period=detail.document.period;
   if(!inRange(date)&&!(date===null&&(!period.start||!period.end||period.start.slice(0,7)<=input.to&&period.end.slice(0,7)>=input.from)))continue;
   const row=bankRaw?.document.rows.find(r=>r.sequence===event.rawSequence);
   const description=source==='은행'?(row?.cells.find(c=>c.column==='적요')?.value??'은행 입출금'):effective?.description??event.description;
   const note=input.includeNotes?(effective?.note??(source==='은행'?row?.cells.find(c=>c.column==='송금메모')?.value??'':'')):'';
   const related=effective?.refundOf??'';
   transactions.rows.push([event.id,source,event.kind,date,safe(description),event.amount,effective?.amount??(event.kind==='bank-cash'||event.kind==='card-charge'?event.amount:null),effective?'소비 포함':event.kind==='bank-cash'?'현금 이동; 소비 합산 금지':event.kind==='card-charge'?'청구; 소비 합산 금지':'확인 전 보류',detail.document.id,related,safe(note),detail.document.reasons.includes('user-deleted')?'일부 거래 삭제; 완전성 미확인':t?.sourceReview?'정정·중복 검토':'월 전체 완전성 미확인']);
   if(effective)for(const a of effective.allocations)splits.rows.push([event.id,a.categoryId,classified.categories.find(c=>c.id===a.categoryId)?.name??'미분류',a.amount]);
  }
 }
 for(const m of records){const t=classified.transactions.find(t=>t.event.id===m.id),effective=t?.effective,date=effective?.occurredOn??m.date;if(!inRange(date))continue;
  transactions.rows.push([m.id,'수기',m.type==='income'?'수기 수입':'수기 지출',date,safe(effective?.description??m.description),m.amount,effective?.amount??m.amount,m.type==='income'?'수입 포함; 은행 잔액 불변':'소비 포함','',effective?.refundOf??'',input.includeNotes?safe(effective?.note??m.note):'','사용자 입력; 금융기관 관측 아님']);
  if(effective)for(const a of effective.allocations)splits.rows.push([m.id,a.categoryId,classified.categories.find(c=>c.id===a.categoryId)?.name??'미분류',a.amount]);
 }
 if(transactions.rows.length>15001||splits.rows.length>30001)throw new AppError(413,'INVALID_INPUT','Export exceeds safe size');
 const summaries:ExportSheet={name:'월별 요약',rows:[['월','은행 입금','은행 출금','원천 기초 잔액','원천 기말 잔액','은행 자료 상태','카드 관측 소비','수기 수입','수기 소비','확보한 소비 합계','카드 자료 상태','확인 전 소비 제외 건수']]};
 let month=input.from;while(month<=input.to){const review=buildFinanceReview(month,list,details.filter(d=>d.document.kind==='kb-bank-pdf'),classified,now,records),{bank,card,manual:man}=review.current;
  summaries.rows.push([month,bank.inflow,bank.outflow,bank.opening,bank.closing,bank.state,card.observedTotal,man.income,man.expense,card.observedTotal!==null||man.transactionCount?(BigInt(card.observedTotal??'0')+BigInt(man.expense)).toString():null,card.coverage,String(card.excludedCount)]);
  month=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)).toISOString().slice(0,7);
 }
 const guide:ExportSheet={name:'안내',rows:[['항목','내용'],['기간',`${input.from} ~ ${input.to}`],['통화·정밀도','KRW 원 단위; 모든 금액은 정확한 정수 텍스트. 빈 셀은 결측이며 0이 아님'],['생성 시각',now],['자료 버전',String(revision)],['계산 버전','monthly-review-v1 / spending-analysis-v1 / export-v1'],['분류 버전',String(classified.revision)],['원천 범위','등록된 은행·카드 관측 및 수기 거래만 포함. 전체 자산·월 전체 소비 보장 없음'],['소비 집계','카드 구매/명시 확인된 환불·수수료의 유효 금액 + 수기 지출. 원거래 금액과 분할행은 중복 합산 금지'],['현금·수입','은행 입출금은 현금 이동. 카드 청구·카드대금 출금은 소비에 더하지 않음. 수기 수입은 별도이며 은행 잔액에 합산하지 않음'],['날짜','이용일·거래일·청구월/결제일은 별개. 시점 불명 청구·조정은 선택 기간과 겹치는 문서의 기록으로 포함하되 날짜는 빈값으로 유지하며 월 귀속·소비를 추정하지 않음'],['개인 메모',input.includeNotes?'사용자가 포함 선택':'제외'],['개인정보','계좌·카드 식별자·PDF 암호·키·세션 미포함. 거래처 및 선택 메모는 민감할 수 있음'],['삭제','다운로드한 사본은 이후 앱 삭제로 회수 불가. 외부 AI에 사용자가 직접 첨부하며 자동 전송 없음'],['AI 해석','전체 자료 판독·정확한 계산을 보증하지 않음. 월별 요약과 거래 ID로 검산 필요']]};
 const bytes=financeWorkbook([guide,transactions,splits,summaries]);
 if(bytes.byteLength>8*1024*1024)throw new AppError(413,'INVALID_INPUT','Export exceeds safe size');
 if(await financeRevision(db,owner)!==revision)throw new AppError(409,'CONFLICT','Finance data changed; export again');
 return bytes;
};}
