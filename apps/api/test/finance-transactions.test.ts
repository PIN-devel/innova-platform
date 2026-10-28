import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/neon-http';
import type {NeonQueryFunction} from '@neondatabase/serverless';
import {unzipSync,strFromU8} from 'fflate';
import {buildFinanceAnalysis,manualSaveSchema,manualInputSchema,financeExportSchema} from '@innova/contracts';
import {createFinanceRawRepository} from '../src/db/finance-raw.js';
import {createFinanceBusinessRepository,createBusinessFingerprint} from '../src/db/finance-business.js';
import {createFinanceManualRepository} from '../src/db/finance-manual.js';
import {createFinanceClassificationRepository} from '../src/db/finance-classification.js';
import {createFinanceReviewRepository} from '../src/db/finance-review.js';
import {createFinanceScheduleRepository} from '../src/db/finance-schedule.js';
import {createFinanceTransactionRepository} from '../src/db/finance-transactions.js';
import {createFinanceExport} from '../src/finance-export/export.js';
import {createRawCipher} from '../src/finance-raw-crypto.js';
import {buildApp} from '../src/app.js';
import type {UserRepository} from '../src/db/users.js';
import type {ExamRepository} from '../src/db/exam.js';
import {cardSource,bankSource} from './fixtures/finance-raw.js';
async function fixture(){
 const pg=new PGlite(),journal=JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
 for(const e of journal.entries)await pg.exec(await readFile(new URL(`../drizzle/${e.tag}.sql`,import.meta.url),'utf8'));
 const owner=randomUUID(),other=randomUUID();for(const id of [owner,other])await pg.query("insert into users(id,email,password_hash,approval_status,role) values($1,$2,'synthetic','approved','member')",[id,`${id}@example.invalid`]);
 const query=async(text:string,params:unknown[],options?:{arrayMode?:boolean})=>{const r=await pg.query(text,params);return {...r,rowCount:r.affectedRows??r.rows.length,rows:options?.arrayMode?r.rows.map(row=>Object.values(row as object)):r.rows};};
 const db=drizzle({client:Object.assign(query,{query}) as unknown as NeonQueryFunction<false,false>}),cipher=createRawCipher('ce'.repeat(32)),fingerprint=createBusinessFingerprint('ce'.repeat(32)),raw=createFinanceRawRepository(db,cipher),business=createFinanceBusinessRepository(db,raw,cipher,fingerprint),manual=createFinanceManualRepository(db,cipher,fingerprint),classification=createFinanceClassificationRepository(db,business,cipher,manual),review=createFinanceReviewRepository(business,classification,manual),schedule=createFinanceScheduleRepository(db,business,classification,cipher,manual),transactions=createFinanceTransactionRepository(db,business,manual,classification,cipher,fingerprint),exporter=createFinanceExport(db,business,manual,classification,raw);
 const input=(type='expense',amount='1200')=>manualSaveSchema.parse({id:randomUUID(),expectedRevision:0,operationId:randomUUID(),input:{date:'2026-01-10',type,amount,description:'synthetic manual',note:'PRIVATE NOTE'}});
 return {pg,db,cipher,fingerprint,owner,other,raw,business,manual,classification,review,schedule,transactions,exporter,input};
}
test('manual income/expense, splits and source-specific review retain bank meaning and idempotency',async t=>{
 const f=await fixture();t.after(()=>f.pg.close());for(const value of ['2026-02-30','2026-01-00'])assert.equal(manualInputSchema.safeParse({...f.input().input,date:value}).success,false);
 assert.equal(manualInputSchema.safeParse({...f.input().input,amount:'0'}).success,false);
 const expense=f.input(),saved=await f.manual.save(f.owner,expense);assert.deepEqual(await f.manual.save(f.owner,expense),saved);await f.manual.save(f.owner,f.input('income','5000'));
 let view=await f.classification.read(f.owner);assert.equal(view.transactions[0]!.event.source,'manual');assert.equal(view.transactions[0]!.documentId,null);assert.equal(view.summary.total,'1200');
 const edit={...view.transactions[0]!.effective!,amount:'1000',allocations:[{categoryId:'unclassified' as const,amount:'1000'}]};view=await f.classification.change(f.owner,{expectedRevision:view.revision,operationId:randomUUID(),change:{type:'edit',edit}});
 const analysis=buildFinanceAnalysis('2026-01',view,new Date().toISOString());assert.equal(analysis.total,'1000');assert.equal(analysis.sources.manual,'1000');assert.equal(analysis.sources.card,null);const review=await f.review.read(f.owner,'2026-01');assert.equal(review.current.manual.income,'5000');assert.equal(review.current.manual.expense,'1000');assert.equal(review.current.bank.state,'missing');assert.equal(review.current.card.observedTotal,null);
 const updated=await f.manual.save(f.owner,{...expense,operationId:randomUUID(),expectedRevision:1,input:{...expense.input,amount:'1300'}});assert.equal(updated.revision,2);assert.equal((await f.classification.read(f.owner)).summary.total,'1300');assert.equal((await f.pg.query('select * from finance_raw_files')).rows.length,0);
 await assert.rejects(f.manual.save(f.other,{...expense,operationId:randomUUID(),expectedRevision:0}));
});
test('file deletion removes raw/snapshots, retains independent charge, and same file cannot resurrect',async t=>{
 const f=await fixture();t.after(()=>f.pg.close());const source=cardSource(),file=(await f.raw.import(f.owner,{batchId:randomUUID(),document:source})).file,detail=await f.business.process(f.owner,file.id),purchase=detail.events.find(e=>e.kind==='card-purchase')!,charge=detail.events.find(e=>e.kind==='card-charge')!;
 const v=await f.classification.read(f.owner);await f.classification.change(f.owner,{expectedRevision:v.revision,operationId:randomUUID(),change:{type:'edit',edit:{...v.transactions[0]!.effective!,note:'REMOVABLE PRIVATE'}}});
 const impact=await f.transactions.impact(f.owner,purchase.id);assert.ok(impact.relatedEventIds.includes(charge.id));const command={id:purchase.id,operationId:randomUUID(),expectedRevision:impact.revision,confirmed:true as const};await f.transactions.remove(f.owner,command);assert.equal((await f.transactions.remove(f.owner,command)).deleted,true);
 const after=await f.business.find(f.owner,detail.document.id);assert.ok(after!.events.some(e=>e.id===charge.id));assert.equal(after!.events.find(e=>e.id===charge.id)!.rawSequence,null);assert.equal(after!.events.some(e=>e.id===purchase.id),false);assert.equal(after!.document.totals.observedPurchases,null);assert.equal(after!.document.period.start,null);const exported=Object.values(unzipSync(await f.exporter(f.owner,{from:'2026-01',to:'2026-01'}))).map(b=>strFromU8(b)).join('');assert.equal(exported.includes(purchase.id),false);assert.ok(exported.includes(charge.id));assert.ok(after!.document.reasons.includes('user-deleted'));
 assert.equal((await f.pg.query('select * from finance_classification_revisions')).rows.length,0);assert.equal((await f.classification.read(f.owner)).transactions.some(e=>e.event.id===purchase.id),false);
 const duplicate=await f.raw.import(f.owner,{batchId:randomUUID(),document:source});assert.equal(duplicate.duplicate,true);assert.equal((await f.raw.find(f.owner,file.id))!.document.rows.length,0);assert.equal((await f.business.process(f.owner,file.id)).events.some(e=>e.id===purchase.id),false);
 await assert.rejects(f.transactions.impact(f.other,charge.id));await assert.rejects(f.transactions.deletion(f.other,purchase.id));
});
test('bank deletion removes inference-bearing source balances and marks partial coverage without fabricated balancing',async t=>{
 const f=await fixture();t.after(()=>f.pg.close());const file=(await f.raw.import(f.owner,{batchId:randomUUID(),document:bankSource()})).file,d=await f.business.process(f.owner,file.id),id=d.events[1]!.id,impact=await f.transactions.impact(f.owner,id);
 await f.transactions.remove(f.owner,{id,operationId:randomUUID(),expectedRevision:impact.revision,confirmed:true});const after=await f.business.find(f.owner,d.document.id);assert.equal(after!.events.length,2);assert.ok(after!.events.every(e=>e.balance===null));const raw=(await f.raw.find(f.owner,file.id))!;assert.equal(raw.document.metadata.some(m=>m.key==='총 입금금액'),false);assert.ok(raw.document.rows.every(r=>r.cells.find(c=>c.column==='잔액')!.value===null));const review=await f.review.read(f.owner,'2026-01');assert.equal(review.current.bank.state,'partial');assert.equal(review.current.bank.closing,null);
});
test('stale prepared classification cannot commit after delete; manual deleted identity cannot be reused',async t=>{
 const f=await fixture();t.after(()=>f.pg.close());const saved=await f.manual.save(f.owner,f.input()),v=await f.classification.read(f.owner),impact=await f.transactions.impact(f.owner,saved.id);
 await f.transactions.remove(f.owner,{id:saved.id,operationId:randomUUID(),expectedRevision:impact.revision,confirmed:true});await assert.rejects(f.classification.change(f.owner,{expectedRevision:v.revision,operationId:randomUUID(),change:{type:'edit',edit:v.transactions[0]!.effective!}}));await assert.rejects(f.manual.save(f.owner,{...f.input(),id:saved.id}));assert.equal((await f.transactions.read(f.owner)).manual.length,0);
});
test('XLSX has four sheets, exact typed text, opt-in notes and session/owner/Origin protected API',async t=>{
 const f=await fixture();t.after(()=>f.pg.close());await f.manual.save(f.owner,{...f.input(),input:{...f.input().input,description:'=HYPERLINK("https://example.invalid")',amount:'999999999999999'}});await f.manual.save(f.other,{...f.input(),input:{...f.input().input,description:'OTHER OWNER SECRET'}});
 assert.equal(financeExportSchema.safeParse({from:'2026-01',to:'2027-01'}).success,false);assert.equal(financeExportSchema.safeParse({from:'2026-02',to:'2026-01'}).success,false);
 const bytes=await f.exporter(f.owner,{from:'2026-01',to:'2026-12'}),files=unzipSync(bytes),all=Object.values(files).map(b=>strFromU8(b)).join('');assert.equal(Object.keys(files).filter(k=>k.startsWith('xl/worksheets')).length,4);assert.ok(all.includes('999999999999999'));assert.equal(all.includes('<f>'),false);assert.equal(all.includes('PRIVATE NOTE'),false);assert.equal(all.includes('OTHER OWNER SECRET'),false);const notes=unzipSync(await f.exporter(f.owner,{from:'2026-01',to:'2026-01',includeNotes:true}));assert.ok(Object.values(notes).map(b=>strFromU8(b)).join('').includes('PRIVATE NOTE'));
 await writeFile('/private/tmp/innova-finance-synthetic-export.xlsx',bytes);
 const users={findById:async(id:string)=>({id,email:'synthetic@example.invalid',passwordHash:'unused',role:id===f.other?'admin':'member',approvalStatus:'approved'})} as UserRepository,exams={find:async()=>undefined} as ExamRepository;
 const app=buildApp({logger:false,userRepository:users,examRepository:exams,financeManualRepository:f.manual,financeTransactionRepository:f.transactions,financeExporter:f.exporter,jwtSecret:'test-only-secret-at-least-thirty-two-characters'});t.after(()=>app.close());await app.ready();
 const headers={cookie:`exam_drill_auth=${app.jwt.sign({sub:f.owner})}`,'x-expected-user':f.owner,'x-finance-request':'1',origin:'http://localhost:5174'};
 assert.equal((await app.inject({url:'/api/finance/transactions/'})).statusCode,401);assert.equal((await app.inject({url:'/api/finance/transactions/',headers:{...headers,'x-expected-user':f.other}})).statusCode,403);
 const download=await app.inject({method:'POST',url:'/api/finance/transactions/export',headers,payload:{from:'2026-01',to:'2026-01'}});assert.equal(download.statusCode,200,download.body);assert.equal(download.headers['cache-control'],'no-store');assert.ok(String(download.headers['content-type']).includes('spreadsheetml'));
 assert.equal((await app.inject({method:'POST',url:'/api/finance/transactions/export',headers:{...headers,origin:'https://evil.invalid'},payload:{from:'2026-01',to:'2026-01'}})).statusCode,403);
});
