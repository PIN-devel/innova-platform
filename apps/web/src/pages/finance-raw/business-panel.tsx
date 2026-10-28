import {useState} from 'react';
import {Link,useFetcher,useSearchParams} from 'react-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import type {BusinessDetail,BusinessDocument,BusinessEvent,BusinessReason} from '@innova/contracts';
type BusinessState=BusinessDocument['state'];
import {businessListQuery,businessDetailQuery} from '@/entities/finance-business/queries';
import {useCurrentUser,useSessionScope} from '@/features/auth/hooks';
import {Button} from '@/shared/ui/button';
const reasons:Record<BusinessReason,string>={
 'invalid-source':'해석할 수 없는 값이 있어 자료 확인이 필요합니다.','bank-check-failed':'입출금·잔액 또는 이어지는 기간의 잔액이 맞지 않습니다.',
 'missing-source-identity':'계좌·카드 식별 근거가 부족합니다.','different-bank-account':'기존 월급·소비 통장과 다른 계좌여서 반영을 보류했습니다.',
 'overlapping-document':'다른 자료와 기간이 겹쳐 중복·정정 확인이 필요합니다.','possible-duplicate':'같은 구매·명세일 가능성이 있어 새 반영을 보류했습니다.',
 'unknown-purchase':'이후 할부 회차입니다. 원구매 소비를 다시 합산하지 않습니다.','unresolved-adjustment':'보조행 조정의 의미를 확인하기 전 소비·환불로 단정하지 않습니다.',
 'missing-period':'청구월·결제일 근거가 없습니다.','statement-only':'청구 명세의 관측 자료이며 전체 월 소비를 뜻하지 않습니다.',
 'missing-fee':'빈 수수료를 0으로 간주하지 않습니다.','unlinked-refund':'취소·음수 이용액의 원거래 연결을 확인해야 합니다.',
};
const stateLabel=(state:BusinessDocument['state'])=>state==='accepted'?'반영됨':state==='needs-review'?'확인 필요 · 반영 보류':'검산 실패 · 반영 보류';
const money=(value:string|null)=>value===null?'확인 불가':`${BigInt(value).toLocaleString('ko-KR')}원`;
const kindLabel:Record<BusinessEvent['kind'],string>={'bank-cash':'통장 입출금','card-purchase':'카드 이용 관측','card-charge':'청구 원금','card-fee':'수수료 관측','card-adjustment':'자료 조정 · 확인 필요'};
const cashLabel:Record<NonNullable<BusinessEvent['cashRole']>,string>={'salary-candidate':'급여 표시 · 분류 확인 필요','card-settlement-candidate':'카드대금 출금 후보 · 소비 재합산 제외','transfer-candidate':'계좌 이동 후보 · 상대 계좌 잔액 미확인','unclassified':'입출금 성격 확인 필요'};
export function ProcessRawButton({rawFileId}:{rawFileId:string}){
 const fetcher=useFetcher<{businessState?:BusinessState;error?:string}>();
 return <fetcher.Form method="post" className="mt-2 space-y-1"><input type="hidden" name="intent" value="process-business"/><input type="hidden" name="rawFileId" value={rawFileId}/><Button type="submit" variant="outline" className="min-h-11" disabled={fetcher.state!=='idle'}>{fetcher.state==='idle'?'거래 반영 확인':'확인 중…'}</Button>{fetcher.data?.businessState&&<p role="status" className="text-sm">{stateLabel(fetcher.data.businessState)}</p>}{fetcher.data?.error&&<p role="alert">{fetcher.data.error}</p>}</fetcher.Form>;
}
function Detail({detail}:{detail:BusinessDetail}){
 const [count,setCount]=useState(100),doc=detail.document;
 return <article className="space-y-3 rounded-md border p-4" aria-label="거래 반영 상세">
  <h3 className="font-semibold">{doc.kind==='kb-bank-pdf'?'은행 입출금':'카드 이용·청구'} · {stateLabel(doc.state)}</h3>
  <p className="text-sm">{doc.kind==='kb-bank-pdf'?'문서 조회기간':'관측된 이용일'}: {doc.period.start??'미확인'} ~ {doc.period.end??'미확인'}</p>
  <p className="text-sm text-muted-foreground">{doc.kind==='kb-bank-pdf'?'표시한 통장·조회기간 안의 현금 기록입니다. 전체 자산을 뜻하지 않습니다.':'이용월 전체 소비·완전한 비중으로 확정할 수 없습니다.'}</p>
  {doc.reasons.length>0&&<ul className="space-y-1 text-sm">{doc.reasons.map(r=><li key={r}>{reasons[r]}</li>)}</ul>}
  {doc.state!=='accepted'?<p role="status">새 거래 {doc.proposedEventCount}개는 확정 합계에 포함하지 않습니다. 기존 반영 내역은 유지합니다.</p>:doc.kind==='kb-bank-pdf'?<dl className="grid grid-cols-2 gap-2 text-sm"><dt>입금 합계</dt><dd>{money(doc.totals.inflow)}</dd><dt>출금 합계</dt><dd>{money(doc.totals.outflow)}</dd><dt>거래 기준 기초 잔액</dt><dd>{money(doc.totals.opening)}</dd><dt>마지막 거래 후 잔액</dt><dd>{money(doc.totals.closing)}</dd></dl>:<dl className="grid grid-cols-2 gap-2 text-sm"><dt>관측 구매 합계</dt><dd>{money(doc.totals.observedPurchases)}</dd><dt>명세 청구 원금 합계</dt><dd>{money(doc.totals.billedPrincipal)}</dd><dt>수수료 합계</dt><dd>{money(doc.totals.billedFees)}</dd><dt>청구월 / 결제일</dt><dd>{doc.billingMonth??'미확인'} / {doc.dueDate??'미확인'}</dd></dl>}
  {doc.candidateDocumentIds.map(id=><Link key={id} to={`?document=${id}`} className="block text-sm text-primary underline">겹치거나 확인이 필요한 기존 자료 보기</Link>)}
  <ul className="space-y-3">{detail.events.slice(0,count).map(event=><li key={event.id} data-business-event={event.kind} className="space-y-1 border-t pt-3 text-sm">
   <p className="font-medium">{kindLabel[event.kind]} · {event.occurredAt?.replace('T',' ')??event.occurredOn??'발생 시점 미확인'}</p>
   <p className="break-words">{event.description||'설명 없음'}</p>
   {event.kind==='bank-cash'?<p>입금 {money(event.inflow)} / 출금 {money(event.outflow)} / 잔액 {money(event.balance)}</p>:<p>금액 {money(event.amount)}{event.fee!==null?` / 수수료 ${money(event.fee)}`:''}{event.installment?` / 할부 ${event.installment.number}/${event.installment.total}`:''}</p>}
   {event.cashRole&&<p>{cashLabel[event.cashRole]}</p>}{event.reason&&<p>{reasons[event.reason]}</p>}
   <p className="text-xs text-muted-foreground">가져온 자료 {event.sourcePage}페이지 · {event.sourceRow}행 (추적 순서 {event.rawSequence}){event.relatedSequences.length?` · 연결된 자료 순서 ${event.relatedSequences.join(', ')}`:''}</p>
  </li>)}</ul>
  {detail.events.length>count&&<Button variant="outline" onClick={()=>setCount(n=>n+100)}>거래 100개 더 보기</Button>}
 </article>;
}
export function BusinessPanel(){
 const client=useQueryClient(),owner=useCurrentUser().data!.id,{epoch}=useSessionScope(),[params]=useSearchParams();
 const id=params.get('document')??'',valid=/^[a-f0-9-]{36}$/i.test(id);
 const list=useQuery({...businessListQuery(client,owner,epoch),enabled:false});
 const detail=useQuery({...businessDetailQuery(client,owner,epoch,id),enabled:false});
 const settlementLabel={matched:'청구·출금 연결 확인', 'missing-period':'청구월·결제일 근거가 없어 출금 연결 미확인','unknown-total':'청구 총액이 미확인이라 연결 보류',unmatched:'일치하는 출금을 찾지 못함','amount-mismatch':'같은 날의 출금과 금액이 다름',ambiguous:'연결 후보가 여럿이라 확정 보류'};
 return <section className="space-y-3" aria-labelledby="business-history"><h2 id="business-history" className="text-lg font-semibold">은행·카드 거래 확인</h2>
  {list.isError&&<p role="status">거래 내역 갱신에 실패했습니다. 확인한 내역을 유지합니다.</p>}
  {!list.data?.documents.length?<p className="text-sm text-muted-foreground">반영한 거래 자료가 없습니다. 저장한 자료에서 거래 반영을 확인할 수 있습니다.</p>:<ul className="space-y-2">{list.data.documents.map(doc=><li key={doc.id} data-business-state={doc.state} className="rounded-md border p-3"><Link to={`?document=${doc.id}`} className="text-primary underline">{doc.kind==='kb-bank-pdf'?'은행 입출금':'카드 이용·청구'} · {stateLabel(doc.state)} · {doc.eventCount}개 기록</Link></li>)}</ul>}
  {list.data?.settlements.map(s=><div key={s.cardDocumentId} className="rounded-md border p-3 text-sm"><p>{settlementLabel[s.state]}</p>{s.bankDocumentIds.map(bank=><Link key={bank} to={`?document=${bank}`} className="block text-primary underline">출금 후보 근거 보기</Link>)}</div>)}
  {valid&&list.data?.documents.filter(d=>d.state==='needs-review'&&d.candidateDocumentIds.includes(id)).map(d=><p key={d.id} role="status" className="text-sm">이 확정본과 충돌할 수 있는 새 자료가 있습니다. <Link className="text-primary underline" to={`?document=${d.id}`}>보류한 자료 확인</Link></p>)}
  {valid&&detail.isError&&<p role="alert">거래 상세를 확인하지 못했습니다.</p>}{valid&&detail.data&&<Detail key={id} detail={detail.data}/>}
 </section>;
}
