import {useEffect,useRef,useState} from 'react';
import {Link,useFetcher,useSearchParams,useRevalidator} from 'react-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import type {ManualTransaction,TransactionWorkspace} from '@innova/contracts';
import {useCurrentUser,useSessionScope} from '@/features/auth/hooks';
import {transactionQuery} from '@/entities/finance-transactions/queries';
import {Button} from '@/shared/ui/button';
import {Input} from '@/shared/ui/input';
import {Label} from '@/shared/ui/label';
import {MotifinHeader,MotifinMonth,MotifinSheet} from '@/shared/ui/motifin/presentation';
import {financeMoney} from '@/shared/ui/motifin/format';
import type {TransactionActionResult} from './route';
function ManualForm({record,categories}:{record?:ManualTransaction;categories:TransactionWorkspace['categories']}){
 const fetcher=useFetcher<TransactionActionResult>(),[identity]=useState(()=>({id:record?.id??crypto.randomUUID(),operationId:crypto.randomUUID()}));
 return <fetcher.Form method="post" className="space-y-3 rounded-md border p-4">
 <h2>{record?'수기 거래 수정':'파일 없이 수입·지출 추가'}</h2><input type="hidden" name="intent" value="manual"/><input type="hidden" name="id" value={identity.id}/><input type="hidden" name="operationId" value={identity.operationId}/><input type="hidden" name="revision" value={record?.revision??0}/>
 <Label>거래일<Input required type="date" name="date" defaultValue={record?.date}/></Label>
 <Label>유형<select className="min-h-11 w-full rounded border p-2" name="type" defaultValue={record?.type??'expense'}><option value="expense">지출</option><option value="income">수입</option></select></Label>
 <Label>금액 · 원<Input required name="amount" inputMode="numeric" pattern="[1-9][0-9]{0,14}" defaultValue={record?.amount}/></Label>
 <Label>거래명<Input required name="description" maxLength={200} defaultValue={record?.description}/></Label>
 <Label>카테고리<select name="categoryId" className="min-h-11 w-full rounded border p-2" defaultValue={record?.categoryId??'unclassified'}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Label>
 <Label>개인 메모 · 선택<Input name="note" maxLength={2000} defaultValue={record?.note}/></Label>
 <p className="text-sm text-muted-foreground">수기 수입·지출은 출처를 구분해 분석에 포함합니다. 은행 잔액·검산은 바꾸지 않습니다. 금액 수정 시 이전 분할·보정은 새 입력을 기준으로 초기화됩니다.</p>
 <Button disabled={fetcher.state!=='idle'} type="submit">{fetcher.state==='idle'?'저장':'저장 중…'}</Button>{fetcher.data?.error&&<p role="alert">{fetcher.data.error}</p>}{fetcher.data&&'saved' in fetcher.data&&<p role="status">저장되었습니다.{fetcher.data.verified?' 조회 확인 완료.':' 재조회에 실패했습니다. 저장을 취소하지 않고 목록에서 결과를 확인해 주세요.'}</p>}
 </fetcher.Form>;
}
function DeleteControl({id}:{id:string}){
 const preview=useFetcher<TransactionActionResult>(),remove=useFetcher<TransactionActionResult>(),[operationId]=useState(()=>crypto.randomUUID());
 const impact=preview.data&&'impact' in preview.data?preview.data.impact:undefined;
 return <section className="space-y-3 border-t pt-4"><preview.Form method="post"><input type="hidden" name="intent" value="impact"/><input type="hidden" name="id" value={id}/><Button variant="destructive" disabled={preview.state!=='idle'||remove.state!=='idle'}>영구 삭제 영향 확인</Button></preview.Form>
 {preview.data?.error&&<p role="alert">{preview.data.error}</p>}{impact&&<remove.Form method="post" className="space-y-3 rounded border p-3"><input type="hidden" name="intent" value="delete"/><input type="hidden" name="id" value={id}/><input type="hidden" name="revision" value={impact.revision}/><input type="hidden" name="operationId" value={operationId}/><h3>삭제 전 확인</h3><p>영향 월: {impact.affectedMonths.join(', ')||impact.month||'미확인'} · 연관 거래 {impact.relatedEventIds.length}건 · 연결 일정 {impact.scheduleCount}건</p><p>{impact.warning}</p><p>원천 행: {impact.rawRowRemoved?'삭제 및 연결 정리':'수기 또는 이미 원천 연결이 정리된 기록'}</p><label className="flex items-center gap-2"><input required type="checkbox" name="confirm" value="yes"/>영구 삭제하며 앱에서 복원할 수 없음을 확인했습니다.</label><Button variant="destructive" disabled={remove.state!=='idle'}>이 거래 영구 삭제</Button></remove.Form>}
 {remove.data?.error&&<p role="alert">{remove.data.error}</p>}{remove.data&&'saved' in remove.data&&<p role="status">삭제되었습니다.{remove.data.verified?' 독립 조회 확인 완료.':' 삭제 결과 재조회가 필요합니다.'}</p>}</section>;
}
function ExportForm({month}:{month:string}){
 const fetcher=useFetcher<TransactionActionResult>(),last=useRef<Blob|null>(null),[operationId]=useState(()=>crypto.randomUUID());
 useEffect(()=>{const result=fetcher.data;if(!result||!('blob' in result)||!result.blob||last.current===result.blob)return;last.current=result.blob;const url=URL.createObjectURL(result.blob),anchor=document.createElement('a');anchor.href=url;anchor.download=result.fileName;anchor.click();const timer=setTimeout(()=>URL.revokeObjectURL(url),1000);return()=>{clearTimeout(timer);URL.revokeObjectURL(url);};},[fetcher.data]);
 return <fetcher.Form method="post" className="space-y-3 rounded-md border p-4"><h2>AI 분석용 XLSX 내보내기</h2><input type="hidden" name="intent" value="export"/><input type="hidden" name="operationId" value={operationId}/><Label>시작 월<Input required type="month" name="from" defaultValue={month}/></Label><Label>종료 월<Input required type="month" name="to" defaultValue={month}/></Label><label className="flex items-center gap-2"><input type="checkbox" name="includeNotes" value="yes"/>개인 메모 포함 · 기본 제외</label><p className="text-sm text-muted-foreground">연속 최대 12개월. 안내·거래 상세·분할 내역·월별 요약 4개 시트입니다. 거래처와 선택한 메모는 민감할 수 있습니다. 외부 AI에 직접 첨부하며, 다운로드 사본은 거래 삭제로 회수할 수 없습니다.</p><Button disabled={fetcher.state!=='idle'}>XLSX 다운로드</Button>{fetcher.data?.error&&<p role="alert">{fetcher.data.error}</p>}</fetcher.Form>;
}
export default function FinanceTransactionsPage(){
 const [limit,setLimit]=useState(100),client=useQueryClient(),user=useCurrentUser().data!,{epoch}=useSessionScope(),[params,setParams]=useSearchParams(),refresh=useRevalidator();
 const query=useQuery({...transactionQuery(client,user.id,epoch),enabled:false}),view=query.data,month=params.get('month')??new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(new Date()),id=params.get('event'),record=view?.manual.find(t=>t.id===id),file=view?.fileTransactions.find(t=>t.id===id);
 if(!view)return <div><h1>거래 관리</h1><p>거래를 조회하지 못했습니다.</p><Button onClick={()=>void refresh.revalidate()}>다시 조회</Button></div>;
 const manualRows=view.manual.filter(t=>t.date.slice(0,7)===month),fileRows=view.fileTransactions.filter(t=>!t.date||t.date.slice(0,7)===month);
 const labels:Record<string,string>={'bank-cash':'통장 입출금','card-purchase':'이용 관측','card-charge':'청구 원금','card-fee':'수수료','card-adjustment':'조정 · 확인 필요'};
 const select=(event:string|null)=>setParams(p=>{const n=new URLSearchParams(p);if(event)n.set('event',event);else n.delete('event');return n;});
 return <div className="mf-live-view"><MotifinHeader title="거래 관리·내보내기" month={month} monthControl={<MotifinMonth label="거래 관리 월" value={month} onChange={value=>{setLimit(100);setParams({month:value});}}/>} backTo={`/motifin/review?month=${month}`}/>{query.isError&&<p role="status">최신 조회에 실패했습니다. 마지막 확인 값을 표시합니다.</p>}
 <ManualForm key={`${epoch}-new-${view.manual.length}`} categories={view.categories}/><ExportForm month={month}/>
 <section className="space-y-3"><h2>수기 거래</h2>{!manualRows.length&&<p>등록한 수기 거래가 없습니다.</p>}{manualRows.slice(0,limit).map(t=><button key={t.id} className="block w-full rounded border p-3 text-left" onClick={()=>select(t.id)}>{t.date} · 수기 {t.type==='income'?'수입':'지출'} · {t.description} · {financeMoney(t.amount)}</button>)}{manualRows.length>limit&&<Button variant="outline" onClick={()=>setLimit(n=>n+100)}>수기 거래 더 보기</Button>}{view.duplicateCandidates.map(c=><p key={c.manualId} role="status">수기 거래와 파일 거래의 날짜·금액이 비슷한 후보 {c.eventIds.length}건이 있습니다. 동일 거래로 자동 병합하지 않습니다. <button className="underline" onClick={()=>select(c.manualId)}>수기 기록 확인</button></p>)}</section>
 <section className="space-y-3"><h2>파일에서 관측한 거래</h2><p>각 기록의 상세에서 삭제 영향을 확인할 수 있습니다. 날짜 미확인 기록은 선택 월에 속한다고 확정하지 않습니다.</p>{fileRows.slice(0,limit).map(t=><button key={t.id} className="block w-full rounded border p-3 text-left" onClick={()=>select(t.id)}>{t.date??'시점 미확인'} · {t.source==='bank'?'은행':'카드'} · {labels[t.kind]??t.kind} · {t.description} · {financeMoney(t.amount)}</button>)}{fileRows.length>limit&&<Button variant="outline" onClick={()=>setLimit(n=>n+100)}>파일 거래 더 보기</Button>}</section>
 {(record||file)&&id&&<MotifinSheet title="거래 상세" onClose={()=>select(null)}>{record?<ManualForm key={`${record.id}-${record.revision}`} record={record} categories={view.categories}/>:<div><p>{file!.description} · {financeMoney(file!.amount)}</p><Link className="underline" to={`/motifin/import?document=${file!.documentId}`}>원천 자료 확인</Link></div>}<DeleteControl key={id} id={id}/>{record?.type==='expense'&&<Link className="underline" to={`/motifin/spending?event=${record.id}&month=${record.date.slice(0,7)}`}>소비 분류·금액 분할</Link>}</MotifinSheet>}
 </div>;
}
