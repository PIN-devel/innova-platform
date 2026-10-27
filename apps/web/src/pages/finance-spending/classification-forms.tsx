import {useState} from 'react';
import {useFetcher,useRevalidator} from 'react-router';
import type {ClassificationCommand,ClassificationView,ClassificationEdit} from '@innova/contracts';
import {Button} from '@/shared/ui/button';
import {Input} from '@/shared/ui/input';
export type SaveResult={verified?:boolean;revision?:number;error?:string;conflict?:boolean};
import {money} from './format-money';
export function SaveStatus({result}:{result?:SaveResult}){const r=useRevalidator();return <>{result?.error&&<p role="alert" className="text-destructive">{result.error}</p>}{result?.revision&&<p role="status">{result.verified?'저장·재조회를 확인했습니다.':'저장은 완료했지만 재조회하지 못했습니다. 최신 내역을 다시 확인해 주세요.'}</p>}{result?.conflict&&<Button type="button" variant="outline" onClick={()=>void r.revalidate()}>최신 내역 다시 조회</Button>}</>;}
export function CommandButton({view,change,children}:{view:ClassificationView;change:ClassificationCommand['change'];children:React.ReactNode}){const fetcher=useFetcher<SaveResult>(),[operationId]=useState(()=>crypto.randomUUID());return <fetcher.Form method="post"><input type="hidden" name="command" value={JSON.stringify({expectedRevision:view.revision,operationId,change})}/><Button type="submit" variant="outline" disabled={fetcher.state!=='idle'} className="min-h-11">{fetcher.state==='idle'?children:'저장 중…'}</Button><SaveStatus result={fetcher.data}/></fetcher.Form>;}
export function TransactionEditor({view,transaction,fetcherKey}:{view:ClassificationView;transaction:ClassificationView['transactions'][number];fetcherKey:string}){
 const t=transaction,e=t.event,original=t.effective;
 const [edit,setEdit]=useState<ClassificationEdit>(()=>original?structuredClone(original):{eventId:e.id,description:(e.description||'카드 거래').slice(0,200),amount:e.amount??'0',occurredOn:t.basisDate??'',note:'',allocations:[{categoryId:'unclassified',amount:e.amount??'0'}],confirmed:false,refundOf:null});
 const fetcher=useFetcher<SaveResult>({key:fetcherKey}),[operationId]=useState(()=>crypto.randomUUID()),busy=fetcher.state!=='idle';
 const set=(patch:Partial<ClassificationEdit>)=>setEdit(v=>({...v,...patch}));
 let sum:bigint|null;try{sum=edit.allocations.reduce((s,a)=>s+BigInt(a.amount),0n);}catch{sum=null;}
 const exact=sum!==null&&sum.toString()===edit.amount;
 return <div className="space-y-4 rounded-md border p-4" aria-label="거래 분류 편집"><h2 className="text-lg font-semibold">거래 분류·보정</h2>
  <p className="text-sm">자료: {e.description||'설명 없음'} · {e.amount===null?'금액 미확인':money(e.amount)} · {e.occurredOn??'발생일 미기재'}</p>
  <p className="text-xs text-muted-foreground">{e.sourcePage}페이지 · {e.sourceRow}행 · 추적 순서 {e.rawSequence}{e.relatedSequences.length?` · 연결 행 ${e.relatedSequences.join(', ')}`:''}</p>
  {t.sourceReview&&<p role="status">새 자료와 충돌 가능성이 있어 자료 재확인이 필요합니다. 기존 사용자 보정은 보존되며 새 금액에 자동 적용하지 않습니다.</p>}
  {!t.eligible?<p>원구매·발생월 근거가 부족한 거래입니다. 새 소비로 확정하거나 보정할 수 없습니다.</p>:<fetcher.Form method="post" className="space-y-3">
   <input name="command" type="hidden" value={JSON.stringify({expectedRevision:view.revision,operationId,change:{type:'edit',edit}})}/>
   <label className="block space-y-1">거래명<Input aria-label="거래명" value={edit.description} maxLength={200} required disabled={busy} onChange={ev=>set({description:ev.target.value})}/></label>
   <label className="block space-y-1">소비일 (자료과 같은 달)<Input aria-label="소비일" type="date" value={edit.occurredOn} required disabled={busy} onChange={ev=>set({occurredOn:ev.target.value})}/></label>
   <label className="block space-y-1">소비 금액 (환불은 음수, 원 단위)<Input aria-label="소비 금액" value={edit.amount} inputMode="text" pattern="-?(0|[1-9][0-9]{0,24})" required disabled={busy} onChange={ev=>set({amount:ev.target.value})}/></label>
   {edit.amount.startsWith('-')&&<label className="block">환불 원구매<select aria-label="환불 원구매" className="mt-1 min-h-11 w-full rounded-md border bg-background p-2" required value={edit.refundOf??''} disabled={busy} onChange={ev=>set({refundOf:ev.target.value||null})}><option value="">연결할 구매 선택</option>{view.transactions.filter(p=>p.event.id!==e.id&&p.event.kind==='card-purchase'&&p.effective&&BigInt(p.effective.amount)>0n).map(p=><option value={p.event.id} key={p.event.id}>{p.effective!.description} · {money(p.effective!.amount)}</option>)}</select></label>}
   {!original&&<label className="flex gap-2"><input type="checkbox" checked={edit.confirmed} required disabled={busy} onChange={ev=>set({confirmed:ev.target.checked})}/>자료과 연결 거래를 확인했으며 이 금액을 소비·환불에 반영합니다.</label>}
   <fieldset disabled={busy} className="space-y-2"><legend className="font-medium">카테고리별 금액 배분</legend>{edit.allocations.map((part,index)=><div className="grid grid-cols-[1fr_1fr_auto] gap-2" key={index}><select aria-label={`배분 ${index+1} 카테고리`} className="min-w-0 rounded-md border bg-background p-2" value={part.categoryId} onChange={ev=>set({allocations:edit.allocations.map((a,i)=>i===index?{...a,categoryId:ev.target.value}:a)})}>{view.categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select><Input aria-label={`배분 ${index+1} 금액`} value={part.amount} pattern="-?(0|[1-9][0-9]{0,24})" required onChange={ev=>set({allocations:edit.allocations.map((a,i)=>i===index?{...a,amount:ev.target.value}:a)})}/><Button type="button" variant="outline" aria-label={`배분 ${index+1} 삭제`} disabled={edit.allocations.length===1} onClick={()=>set({allocations:edit.allocations.filter((_,i)=>i!==index)})}>삭제</Button></div>)}
   <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={edit.allocations.length>=100} onClick={()=>set({allocations:[...edit.allocations,{categoryId:'unclassified',amount:'0'}]})}>배분 추가</Button><Button type="button" variant="outline" onClick={()=>set({allocations:[{categoryId:'unclassified',amount:edit.amount}]})}>전액 미분류로 합치기</Button></div><p role="status">배분 합계 {sum===null?'입력 확인':money(sum.toString())} · {exact?'거래 금액과 일치':'거래 금액과 일치해야 합니다'}</p></fieldset>
   <label className="block">메모<Input aria-label="메모" value={edit.note} maxLength={2000} disabled={busy} onChange={ev=>set({note:ev.target.value})}/></label>
   <Button type="submit" disabled={busy||!exact} className="min-h-11">{busy?'저장 중…':'분류·보정 저장'}</Button><SaveStatus result={fetcher.data}/>
  </fetcher.Form>}
  {view.transactions.some(p=>p.effective?.refundOf===e.id)&&<p className="text-sm text-muted-foreground">연결 환불이 있습니다. 구매 금액 감액·원본 복원으로 환불 한도를 초과하면 먼저 환불 분류를 확인해 주세요.</p>}
  {t.userEdited&&<CommandButton key={`reset-${view.revision}`} view={view} change={{type:'reset',eventId:e.id}}>가져온 원본값·미분류로 복원</CommandButton>}
  <details><summary className="cursor-pointer py-3">이 거래의 수정 이력</summary><ul className="space-y-2">{view.history.filter(h=>h.eventId===e.id).map(h=><li key={h.revision} className="space-y-1"><p className="text-sm">수정 {h.revision} · {new Date(h.createdAt).toLocaleString('ko-KR')} · {h.type==='reset'?'원본 복원':h.type==='restore'?'이력 복원':'사용자 보정'}</p><CommandButton key={`${view.revision}-${h.revision}`} view={view} change={{type:'restore',eventId:e.id,revision:h.revision}}>수정 {h.revision}의 값 복원</CommandButton></li>)}</ul></details>
 </div>;
}
export function CategoryManager({view,initiallyOpen=false}:{view:ClassificationView;initiallyOpen?:boolean}){
 return <details className="mf-live-details" open={initiallyOpen||undefined}><summary className="cursor-pointer font-medium">카테고리 관리</summary><div className="mt-3 space-y-4"><CategoryAdder key={view.revision} view={view}/>{view.categories.map(c=>c.id==='unclassified'?<p key={c.id}>미분류 · 기본 분류</p>:<CategoryRow key={`${c.id}-${view.revision}`} view={view} category={c}/>)}</div></details>;
}
function CategoryAdder({view}:{view:ClassificationView}){
 const [name,setName]=useState(''),[id]=useState(()=>crypto.randomUUID());
 return <div className="space-y-2"><label className="block">새 카테고리<Input aria-label="새 카테고리" value={name} maxLength={40} onChange={e=>setName(e.target.value)}/></label>{name.trim()&&<CommandButton view={view} change={{type:'category-add',id,name:name.trim()}}>카테고리 추가</CommandButton>}</div>;
}
function CategoryRow({view,category}:{view:ClassificationView;category:ClassificationView['categories'][number]}){
 const [name,setName]=useState(category.name),[target,setTarget]=useState('unclassified'),count=view.transactions.filter(t=>t.effective?.allocations.some(a=>a.categoryId===category.id)).length;
 return <section className="space-y-2 border-t pt-3"><p className="font-medium">{category.name} · 연결 원거래 {count}건</p><label className="block">새 이름<Input aria-label={`${category.name} 새 이름`} maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label>{name.trim()!==category.name&&name.trim()&&<CommandButton view={view} change={{type:'category-rename',id:category.id,name:name.trim()}}>전체 기간 이름 변경</CommandButton>}<label className="block">연결 거래 이동 대상<select aria-label={`${category.name} 이동 대상`} className="mt-1 min-h-11 w-full rounded-md border bg-background p-2" value={target} onChange={e=>setTarget(e.target.value)}>{view.categories.filter(c=>c.id!==category.id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><p className="text-sm">전체 기간의 {count}건에서 이 분류의 배분만 이동합니다. 총액·원거래는 유지합니다.</p><CommandButton view={view} change={{type:'category-move',id:category.id,targetId:target}}>{target==='unclassified'?'분류 삭제·미분류로 이동':'선택 분류로 병합·기존 분류 삭제'}</CommandButton></section>;
}
