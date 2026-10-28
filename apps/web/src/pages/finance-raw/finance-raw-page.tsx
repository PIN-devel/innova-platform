import {BusinessPanel,ProcessRawButton} from './business-panel';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Link,useFetcher,useRevalidator,useSearchParams} from 'react-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useCurrentUser,useSessionScope} from '@/features/auth/hooks';
import {rawFilesQuery} from '@/entities/finance-raw/queries';
import type {ImportFileResult} from '@/features/finance-raw-import/import-files';
import {pdfPasswordStatusQuery} from '@/entities/finance-pdf-password/queries';
import {Button} from '@/shared/ui/button';
import {Input} from '@/shared/ui/input';
import {Label} from '@/shared/ui/label';
import {selectedReviewMonth} from '@/shared/lib/finance-month';
import {MotifinHeader} from '@/shared/ui/motifin/presentation';
import {Landmark,CreditCard} from 'lucide-react';
import {Card,CardHeader,CardTitle,CardContent} from '@/shared/ui/card';

export default function FinanceRawPage(){
 const client=useQueryClient(),user=useCurrentUser().data!,{epoch}=useSessionScope();
 const [params]=useSearchParams(),month=selectedReviewMonth('https://local?'+params.toString()),[useSaved,setUseSaved]=useState(false),[savePassword,setSavePassword]=useState(()=>params.get('pdf-secret')==='change');
 const secretQuery=useQuery({...pdfPasswordStatusQuery(client,user.id,epoch),enabled:false}),secretStatus=secretQuery.data;
 const query=useQuery({...rawFilesQuery(client,user.id,epoch),enabled:false});
 const fetcher=useFetcher<{results?:ImportFileResult[];error?:string;passwordStorage?:'saved'|'failed'|'unchanged'}>({key:`finance-import-${user.id}-${epoch}`}), revalidator=useRevalidator();
 const form=useRef<HTMLFormElement>(null),password=useRef<HTMLInputElement>(null),accountPassword=useRef<HTMLInputElement>(null);
 const epochSeen=useRef(epoch);
 const busy=fetcher.state!=='idle';
 useEffect(()=>{if(fetcher.state==='submitting'){if(password.current)password.current.value='';if(accountPassword.current)accountPassword.current.value='';}if(fetcher.state==='idle'&&fetcher.data)form.current?.reset();},[fetcher.state,fetcher.data]);
 useLayoutEffect(()=>{if(epochSeen.current===epoch)return;epochSeen.current=epoch;form.current?.reset();if(password.current)password.current.value='';if(accountPassword.current)accountPassword.current.value='';setUseSaved(false);setSavePassword(false);},[epoch]);
 useEffect(()=>{const clear=()=>{if(password.current)password.current.value='';if(accountPassword.current)accountPassword.current.value='';};window.addEventListener('pagehide',clear);return ()=>{window.removeEventListener('pagehide',clear);clear();};},[]);
 const effectiveSaved=useSaved&&!!secretStatus?.canUse,effectiveSave=savePassword&&!!secretStatus?.available&&!effectiveSaved;
 return <div className="mf-live-view mf-import-card">
  <MotifinHeader month={month} title="자료 가져오기" backTo={`/motifin/review?month=${month}`}/><p className="mf-period">여러 달의 은행·카드 자료를 함께 가져올 수 있어요.</p>
  <Card><CardHeader><CardTitle>은행·카드 자료 선택</CardTitle></CardHeader><CardContent>
   <fetcher.Form method="post" encType="multipart/form-data" ref={form} onSubmit={()=>{setUseSaved(false);setSavePassword(false);}} className="space-y-4">
    <div className="space-y-2"><div className="mf-import-guide"><div><Landmark size={19}/><strong>KB스타뱅킹 · 은행 PDF</strong><small>월급·소비 통장 1개<br/>카드대금 결제계좌 · 입출금·잔액</small></div><div><CreditCard size={19}/><strong>KB Pay · 카드 XLSX</strong><small>이용대금명세서<br/>카드 이용·청구·할부</small></div></div><Label htmlFor="raw-files">자료 파일 (최대 10개, 각 20MB)</Label><Input id="raw-files" name="files" type="file" accept=".pdf,.xlsx" multiple required disabled={busy}/></div>
    <div className="space-y-2"><Label htmlFor="raw-password">은행 PDF 암호</Label><Input id="raw-password" name="password" type="password" ref={password} autoComplete="off" disabled={busy||effectiveSaved}/><p className="text-xs text-muted-foreground">수동 암호는 이번 실행에 사용합니다. 원파일은 서버에 보내지 않으며 암호는 선택 저장을 실행한 경우에만 별도 보호 경로로 전송합니다.</p></div>
    <div className="space-y-2 text-sm"><label className="flex gap-2"><input type="checkbox" name="useSaved" checked={effectiveSaved} disabled={busy||!secretStatus?.canUse} onChange={e=>{setUseSaved(e.target.checked);if(e.target.checked)setSavePassword(false);}}/>계정에 저장한 PDF 암호 재사용</label><label className="flex gap-2"><input type="checkbox" name="savePassword" checked={effectiveSave} disabled={busy||effectiveSaved||!secretStatus?.available} onChange={e=>{setSavePassword(e.target.checked);if(e.target.checked)setUseSaved(false);}}/>PDF 잠금 해제 성공 후 이번 암호를 계정에 저장·변경</label><p>{secretStatus?.stored?'저장된 암호가 있습니다. 이번만 직접 입력해도 기존 저장값은 삭제되지 않습니다.':'저장된 암호가 없거나 저장 상태를 확인하지 못했습니다.'}</p>{(!secretStatus?.available||secretStatus?.stored&&!secretStatus.canUse)&&<p>선택 저장·재사용은 현재 사용할 수 없습니다. 수동 입력으로 가져올 수 있습니다.</p>}<Link className="text-primary underline" to={`/motifin/security?month=${month}`}>저장 상태·변경·선택 저장 해제</Link></div>
    {(effectiveSaved||effectiveSave)&&<label className="block space-y-1">계정 비밀번호 · 최근 재확인이 필요한 경우<Input id="raw-account-password" name="accountPassword" aria-label="가져오기 계정 비밀번호" type="password" ref={accountPassword} autoComplete="current-password" maxLength={128} required={secretStatus?.reauthRequired} disabled={busy}/></label>}
    <Button type="submit" disabled={busy}>{busy?'자료를 읽고 저장 결과를 확인하고 있어요…':'가져오기'}</Button>
   </fetcher.Form>
   <div role="status" className="mt-4 space-y-2">{fetcher.data?.passwordStorage==='saved'&&<p>PDF 암호를 계정에 선택 저장했습니다.</p>}{fetcher.data?.passwordStorage==='failed'&&<p>자료 처리 결과는 유지되지만 PDF 암호는 저장하지 못했습니다. 저장 상태와 계정 재확인을 확인해 주세요.</p>}{fetcher.data?.error&&<p>{fetcher.data.error}</p>}{fetcher.data?.results?.map(r=><p key={r.index} data-import-status={r.status}>파일 {r.index} · {r.status==='failed'?'확인 필요':r.status==='duplicate'?'중복 제외':'완료'} — {r.message}</p>)}</div>
  </CardContent></Card>
  <section aria-labelledby="raw-history"><h2 id="raw-history" className="text-lg font-semibold">저장한 자료</h2>
   {query.isError&&query.data&&<p role="status">이력 갱신에 실패했습니다. 확인한 자료를 유지합니다.</p>}
   {query.isError&&!query.data?<div><p>자료 이력을 확인하지 못했습니다.</p><Button onClick={()=>void revalidator.revalidate()}>다시 조회</Button></div>:!query.data?.files.length?<p className="mt-2 text-sm text-muted-foreground">아직 저장한 자료가 없습니다.</p>:<ul className="mt-3 space-y-3">{query.data.files.map(f=><li key={f.id} className="rounded-md border p-3"><p>{f.kind==='kb-bank-pdf'?'은행 PDF':'카드 XLSX'} · {f.rowCount}개 자료 행</p><p className="text-xs text-muted-foreground">반영 시각 {new Date(f.createdAt).toLocaleString('ko-KR')}</p><ProcessRawButton rawFileId={f.id}/></li>)}</ul>}
  </section>
  <Link className="block text-primary underline" to={`/motifin/spending?month=${month}`}>소비 분류·금액 나누기</Link>
  <Link className="block text-primary underline" to={`/motifin/review?month=${month}`}>월간 리뷰</Link>
  <BusinessPanel/>
 </div>;
}
