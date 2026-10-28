import {Link,useSearchParams,useRevalidator} from 'react-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useCurrentUser,useSessionScope} from '@/features/auth/hooks';
import {classificationQuery} from '@/entities/finance-classification/queries';
import {Button} from '@/shared/ui/button';
import {CategoryManager,TransactionEditor} from './classification-forms';
import {money} from './format-money';
import {MotifinHeader,MotifinSheet} from '@/shared/ui/motifin/presentation';
export default function FinanceSpendingPage(){
 const client=useQueryClient(),user=useCurrentUser().data!,{epoch}=useSessionScope(),[params,setParams]=useSearchParams(),refresh=useRevalidator();
 const query=useQuery({...classificationQuery(client,user.id,epoch),enabled:false}),view=query.data;
 if(!view)return <div><h1 className="text-2xl font-semibold">소비 분류</h1><p>소비 내역을 조회하지 못했습니다.</p><Button onClick={()=>void refresh.revalidate()}>다시 조회</Button></div>;
 const returnTo=params.get('returnTo');const safeReturn=returnTo?.startsWith('/motifin/analysis?')&&!returnTo.includes('\\')?returnTo:null;
 const category=params.get('category'),selected=view.transactions.find(t=>t.event.id===params.get('event'));
 const filtered=view.transactions.filter(t=>!category||t.effective?.allocations.some(a=>a.categoryId===category)||(category==='unclassified'&&!t.effective));
 const merchants=new Map<string,typeof filtered>();for(const t of filtered){const name=t.event.description||'설명 없는 거래';merchants.set(name,[...(merchants.get(name)??[]),t]);}
 const select=(key:string,value:string|null)=>setParams(p=>{const n=new URLSearchParams(p);if(value)n.set(key,value);else n.delete(key);if(key==='category')n.delete('event');return n;});
 return <div className="mf-live-view"><MotifinHeader month={params.get('month')??undefined} title="소비 분류" backTo={safeReturn??`/motifin/analysis?month=${params.get('month')??''}`}/>{safeReturn&&<Link className="mf-text-action" to={safeReturn}>소비 분석으로 돌아가기</Link>}<p className="mf-muted">반영된 카드 자료의 관측 소비입니다. 전체 월 소비나 통장 현금 흐름을 뜻하지 않습니다.</p>
 {query.isError&&<p role="status">최신 내역을 가져오지 못했습니다. 마지막 확인한 값을 표시합니다.</p>}
 <section className="space-y-2 rounded-md border p-4" aria-label="저장된 카테고리 요약"><h2 className="text-lg font-semibold">전체 보관 기간 관측 소비 {money(view.summary.total)}</h2><p>반영 원거래 {view.summary.transactionCount}건 · 금액·성격 확인 전 제외 {view.summary.excludedCount}건</p><p className="text-xs text-muted-foreground">분할 배분행은 원거래 수에 더하지 않습니다. 카테고리별 건수는 중복될 수 있습니다.</p>{view.transactions.some(t=>t.sourceReview)&&<p role="status">자료 정정·중복 의심 자료가 있습니다. 기존 확정본 기준 합계이며 사용자 보정은 보존됩니다.</p>}<div className="flex flex-wrap gap-2"><Button variant={category? 'outline':'default'} onClick={()=>select('category',null)}>전체</Button>{view.categories.map(c=>{const summary=view.summary.allocations.find(a=>a.categoryId===c.id);return <Button key={c.id} className="h-auto min-h-11 whitespace-normal text-left" variant={category===c.id?'default':'outline'} onClick={()=>select('category',c.id)}>{c.name} · {money(summary?.amount??'0')} · {summary?.transactionCount??0}건</Button>;})}</div></section>
 <CategoryManager view={view} initiallyOpen={params.get('manage')==='categories'}/>
 <section aria-label="가맹점과 거래" className="space-y-3"><h2 className="text-lg font-semibold">{category?view.categories.find(c=>c.id===category)?.name??'카테고리':'전체'} · 가맹점과 원거래</h2>{!filtered.length&&<p>해당 거래가 없습니다.</p>}{[...merchants].map(([name,items])=><details key={name} className="rounded-md border p-3" open={items.some(t=>t.event.id===selected?.event.id)}><summary className="cursor-pointer break-words py-2">{name} · 원거래 {items.length}건</summary><ul className="mt-2 space-y-2">{items.map(t=><li key={t.event.id}><button type="button" onClick={()=>select('event',t.event.id)} className="min-h-11 w-full space-y-1 rounded-md border p-3 text-left"><span className="block">{t.effective?.occurredOn??t.basisDate??'시점 미확인'} · {t.effective?.description??t.event.description}</span><span className="block">{t.effective?money(t.effective.amount):'성격·금액 확인 전 소비 합계 제외'}{t.userEdited?' · 사용자 보정':''}{t.sourceReview?' · 자료 재확인 필요':''}</span><span className="block text-xs text-muted-foreground">{t.effective?.allocations.map(a=>`${view.categories.find(c=>c.id===a.categoryId)?.name??'미분류'} ${money(a.amount)}`).join(' / ')??'미확인 자료'}</span></button></li>)}</ul></details>)}</section>
 {selected&&<MotifinSheet title="거래 상세·분류" onClose={()=>select('event',null)}><Link className="text-primary underline" to={`/motifin/import?document=${selected.documentId}`}>선택 거래의 자료 문서 확인</Link><TransactionEditor fetcherKey={`finance-edit-${user.id}-${epoch}-${selected.event.id}`} key={`${selected.event.id}-${view.revision}`} view={view} transaction={selected}/></MotifinSheet>}
 </div>;
}
