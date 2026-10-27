import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/neon-http';
import type {NeonQueryFunction} from '@neondatabase/serverless';
import {applyClassification,classificationCommandSchema,classificationView,emptyClassification,type BusinessDetail,type ClassificationCommand,type ClassificationEdit,type ClassificationState} from '@innova/contracts';
import {normalizeRaw} from '../src/finance-business/normalize.js';
import {createFinanceRawRepository} from '../src/db/finance-raw.js';
import {createFinanceBusinessRepository,createBusinessFingerprint} from '../src/db/finance-business.js';
import {createFinanceClassificationRepository} from '../src/db/finance-classification.js';
import {createRawCipher} from '../src/finance-raw-crypto.js';
import {buildApp} from '../src/app.js';
import type {UserRepository} from '../src/db/users.js';
import type {ExamRepository} from '../src/db/exam.js';
import {cardSource} from './fixtures/finance-raw.js';
const command=(revision:number,change:ClassificationCommand['change'])=>classificationCommandSchema.parse({expectedRevision:revision,operationId:randomUUID(),change});
function source(){const document=cardSource();const {fileHash:_,...body}=document;return normalizeRaw({file:{id:randomUUID(),batchId:randomUUID(),kind:document.kind,parserVersion:document.parserVersion,rowCount:document.rows.length,createdAt:new Date().toISOString()},document:body},v=>JSON.stringify(v));}
const effective=(state:ClassificationState,details:BusinessDetail[],id:string)=>classificationView(state,details).transactions.find(t=>t.event.id===id)!.effective!;
test('classification uses integer allocations, stable category IDs and original transaction counts',()=>{
 const detail=source(),id=detail.events.find(e=>e.kind==='card-purchase')!.id,a=randomUUID(),b=randomUUID();let state=emptyClassification();
 state=applyClassification(state,[detail],command(0,{type:'category-add',id:a,name:'식료품'}));state=applyClassification(state,[detail],command(1,{type:'category-add',id:b,name:'생활'}));
 const edit={...effective(state,[detail],id),allocations:[{categoryId:a,amount:'200'},{categoryId:a,amount:'100'},{categoryId:b,amount:'300'}]};
 state=applyClassification(state,[detail],command(2,{type:'edit',edit}));assert.equal(state.edits[0]!.allocations.length,2);const view=classificationView(state,[detail]);assert.equal(view.summary.total,'600');assert.equal(view.summary.transactionCount,1);assert.equal(view.summary.allocations.reduce((s,a)=>s+BigInt(a.amount),0n),600n);
 const original=JSON.stringify(state);assert.throws(()=>applyClassification(state,[detail],command(3,{type:'edit',edit:{...edit,allocations:[{categoryId:a,amount:'599'}]}})));assert.equal(JSON.stringify(state),original);
 for(const occurredOn of ['2026-02-10','2026-01-32','2026-01-00'])assert.throws(()=>applyClassification(state,[detail],command(3,{type:'edit',edit:{...edit,occurredOn}})));
 assert.throws(()=>applyClassification(state,[detail],command(3,{type:'edit',edit:{...edit,amount:'-600'}})));
 state=applyClassification(state,[detail],command(3,{type:'category-rename',id:a,name:'장보기'}));assert.equal(state.edits[0]!.allocations[0]!.categoryId,a);
 state=applyClassification(state,[detail],command(4,{type:'category-move',id:a,targetId:b}));assert.deepEqual(state.edits[0]!.allocations,[{categoryId:b,amount:'600'}]);
 state=applyClassification(state,[detail],command(5,{type:'category-move',id:b,targetId:'unclassified'}));assert.equal(classificationView(state,[detail]).summary.total,'600');assert.equal(state.edits[0]!.allocations[0]!.categoryId,'unclassified');
});
test('user correction/reset/history restoration preserves Raw, source amount and deleted category mapping',()=>{
 const detail=source(),before=JSON.stringify(detail),id=detail.events[0]!.id,c=randomUUID();let state=applyClassification(emptyClassification(),[detail],command(0,{type:'category-add',id:c,name:'식비'}));
 const edit={...effective(state,[detail],id),description:'사용자 거래명',amount:'550',note:'합성 메모',allocations:[{categoryId:c,amount:'550'}]};state=applyClassification(state,[detail],command(1,{type:'edit',edit}));const prior=structuredClone(state);
 assert.equal(classificationView(state,[detail]).summary.total,'550');state=applyClassification(state,[detail],command(2,{type:'reset',eventId:id}));assert.equal(classificationView(state,[detail]).summary.total,'600');
 state=applyClassification(state,[detail],command(3,{type:'category-move',id:c,targetId:'unclassified'}));state=applyClassification(state,[detail],command(4,{type:'restore',eventId:id,revision:2}),prior);assert.equal(state.edits[0]!.amount,'550');assert.equal(state.edits[0]!.allocations[0]!.categoryId,'unclassified');assert.equal(JSON.stringify(detail),before);
 const pending=structuredClone(detail);pending.document.id=randomUUID();pending.document.state='needs-review';pending.document.eventCount=0;pending.document.candidateDocumentIds=[detail.document.id];pending.document.totals.observedPurchases='700';pending.events=[];
 const view=classificationView(state,[detail,pending]);assert.equal(view.transactions[0]!.sourceReview,true);assert.equal(view.summary.total,'550');assert.equal(view.transactions[0]!.effective!.note,'합성 메모');
});
test('full cancellation reverses purchase allocations, partial refund stays explicit and excess is rejected',()=>{
 const detail=source(),purchase=detail.events[0]!,refund={...purchase,id:randomUUID(),rawSequence:2,sourceRow:2,kind:'card-adjustment' as const,status:'needs-review' as const,reason:'unresolved-adjustment' as const,occurredOn:null,amount:'-600',consumptionAmount:null,relatedSequences:[purchase.rawSequence]};detail.events.push(refund);const cat=randomUUID();let state=applyClassification(emptyClassification(),[detail],command(0,{type:'category-add',id:cat,name:'합성 분류'}));
 const edit={...effective(state,[detail],purchase.id),allocations:[{categoryId:cat,amount:'400'},{categoryId:'unclassified',amount:'200'}]};state=applyClassification(state,[detail],command(1,{type:'edit',edit}));
 const refundEdit:ClassificationEdit={eventId:refund.id,description:'확인한 환불',occurredOn:purchase.occurredOn!,amount:'-600',allocations:[{categoryId:'unclassified',amount:'-600'}],confirmed:true,refundOf:purchase.id,note:''};
 assert.throws(()=>applyClassification(state,[detail],command(2,{type:'edit',edit:{...refundEdit,confirmed:false}})));
 const full=applyClassification(state,[detail],command(2,{type:'edit',edit:refundEdit}));assert.equal(classificationView(full,[detail]).summary.total,'0');assert.ok(classificationView(full,[detail]).summary.allocations.every(a=>a.amount==='0'));assert.equal(full.edits.find(e=>e.eventId===refund.id)!.allocations[0]!.categoryId,'unclassified');
 const partial=applyClassification(state,[detail],command(2,{type:'edit',edit:{...refundEdit,amount:'-100',allocations:[{categoryId:'unclassified',amount:'-100'}]}}));assert.equal(classificationView(partial,[detail]).summary.total,'500');assert.equal(effective(partial,[detail],refund.id).allocations[0]!.categoryId,'unclassified');
 assert.throws(()=>applyClassification(state,[detail],command(2,{type:'edit',edit:{...refundEdit,amount:'-601',allocations:[{categoryId:'unclassified',amount:'-601'}]}})));
 assert.throws(()=>applyClassification(full,[detail],command(3,{type:'edit',edit:{...edit,amount:'500',allocations:[{categoryId:cat,amount:'500'}]}})));
});
test('unknown installments and bank cash cannot become freely editable consumption',()=>{
 const detail=source();detail.events[0]!.reason='unknown-purchase';detail.events[0]!.consumptionAmount=null;const state=emptyClassification();assert.equal(classificationView(state,[detail]).transactions[0]!.eligible,false);assert.equal(classificationView(state,[detail]).summary.total,'0');
 const bank=structuredClone(detail);bank.document.kind='kb-bank-pdf';assert.equal(classificationView(state,[bank]).transactions.length,0);
});
async function fixture(){const pg=new PGlite(),journal=JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));for(const e of journal.entries)await pg.exec(await readFile(new URL(`../drizzle/${e.tag}.sql`,import.meta.url),'utf8'));
 const owner=randomUUID(),other=randomUUID(),admin=randomUUID();for(const id of [owner,other,admin])await pg.query("insert into users(id,email,password_hash,approval_status,role) values($1,$2,'synthetic','approved',$3)",[id,`${id}@example.invalid`,id===admin?'admin':'member']);
 const query=async(sql:string,params:unknown[],options?:{arrayMode?:boolean})=>{const r=await pg.query(sql,params);return {...r,rowCount:r.affectedRows??r.rows.length,rows:options?.arrayMode?r.rows.map(r=>Object.values(r as object)):r.rows};};const db=drizzle({client:Object.assign(query,{query}) as unknown as NeonQueryFunction<false,false>}),cipher=createRawCipher('ef'.repeat(32)),raw=createFinanceRawRepository(db,cipher),business=createFinanceBusinessRepository(db,raw,cipher,createBusinessFingerprint('ef'.repeat(32))),repository=createFinanceClassificationRepository(db,business,cipher);
 const rawId=(await raw.import(owner,{batchId:randomUUID(),document:cardSource()})).file.id,detail=await business.process(owner,rawId);return {pg,db,cipher,owner,other,admin,raw,business,repository,rawId,detail};}
test('classification SQL atomically stores encrypted history, concurrent CAS and operation idempotency',async t=>{
 const f=await fixture();t.after(()=>f.pg.close());const id=f.detail.events.find(e=>e.kind==='card-purchase')!.id,view=await f.repository.read(f.owner);assert.equal(view.revision,0);
 const edit={...view.transactions.find(t=>t.event.id===id)!.effective!,note:'private synthetic note'},first=command(0,{type:'edit',edit});const saved=await f.repository.change(f.owner,first);assert.equal(saved.revision,1);assert.equal((await f.repository.change(f.owner,first)).revision,1);
 await assert.rejects(f.repository.change(f.owner,{...first,change:{type:'reset',eventId:id}}));
 const concurrent=await Promise.allSettled([f.repository.change(f.owner,command(1,{type:'reset',eventId:id})),f.repository.change(f.owner,command(1,{type:'edit',edit:{...edit,description:'경합'}}))]);assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal((await f.repository.read(f.owner)).revision,2);
 assert.equal(JSON.stringify((await f.pg.query('select * from finance_classification_revisions')).rows).includes('private synthetic note'),false);
 await f.repository.change(f.owner,command(2,{type:'restore',eventId:id,revision:1}));assert.equal((await f.repository.read(f.owner)).transactions[0]!.effective!.note,'private synthetic note');
 assert.deepEqual(await f.business.process(f.owner,f.rawId),f.detail);assert.equal((await f.repository.read(f.owner)).transactions[0]!.effective!.note,'private synthetic note');
 const changed=cardSource();changed.rows[0]!.cells.find(c=>c.column==='G')!.value='700';const file=(await f.raw.import(f.owner,{batchId:randomUUID(),document:changed})).file.id;await f.business.process(f.owner,file);const after=await f.repository.read(f.owner);assert.equal(after.transactions[0]!.sourceReview,true);assert.equal(after.transactions[0]!.effective!.note,'private synthetic note');
 assert.equal((await f.repository.read(f.other)).transactions.length,0);await assert.rejects(f.repository.change(f.other,command(0,{type:'edit',edit})));await f.pg.query('delete from users where id=$1',[f.owner]);assert.equal((await f.pg.query('select * from finance_classification_revisions')).rows.length,0);
});
test('classification API denies foreign users/admin, stale actors, cross-origin and unapproved writes',async t=>{
 const f=await fixture();t.after(()=>f.pg.close());let approved=true;const users={findById:async(id:string)=>({id,email:'synthetic@example.invalid',passwordHash:'unused',role:id===f.admin?'admin':'member',approvalStatus:approved?'approved':'pending'})} as UserRepository,exams={find:async()=>undefined,create:async()=>{throw Error();}} as ExamRepository;
 const app=buildApp({logger:false,userRepository:users,examRepository:exams,financeRawRepository:f.raw,financeBusinessRepository:f.business,financeClassificationRepository:f.repository,jwtSecret:'synthetic-only-secret-thirty-two-characters'});t.after(()=>app.close());await app.ready();const url='/api/finance/business/classification',headers=(id=f.owner)=>({cookie:`exam_drill_auth=${app.jwt.sign({sub:id})}`,'x-expected-user':id,'x-finance-request':'1',origin:'http://localhost:5174'});
 assert.equal((await app.inject({url})).statusCode,401);const read=await app.inject({url,headers:headers()});assert.equal(read.statusCode,200);assert.equal(read.headers['cache-control'],'no-store');const review=await app.inject({url:'/api/finance/business/review?month=2026-01',headers:headers()});assert.equal(review.statusCode,200);assert.equal(review.json().current.card.observedTotal,'600');assert.equal((await app.inject({url:'/api/finance/business/review?month=2026-13',headers:headers()})).statusCode,400);for(const actor of [f.other,f.admin])assert.equal((await app.inject({url:'/api/finance/business/review?month=2026-01',headers:headers(actor)})).json().current.card.observedTotal,null);
 const analysis=await app.inject({url:'/api/finance/business/analysis?month=2026-01',headers:headers()});assert.equal(analysis.statusCode,200);assert.equal(analysis.json().total,'600');assert.equal(analysis.json().stats.averagePurchase,'600');for(const actor of [f.other,f.admin])assert.equal((await app.inject({url:'/api/finance/business/analysis?month=2026-01',headers:headers(actor)})).json().total,null);
 const edit=read.json().transactions[0].effective,payload=command(0,{type:'edit',edit});assert.equal((await app.inject({method:'POST',url,headers:headers(),payload})).statusCode,200);
 for(const id of [f.other,f.admin]){assert.equal((await app.inject({url,headers:headers(id)})).json().transactions.length,0);assert.equal((await app.inject({method:'POST',url,headers:headers(id),payload})).statusCode,400);}
 assert.equal((await app.inject({method:'POST',url,headers:{...headers(),'x-expected-user':f.other},payload})).statusCode,403);assert.equal((await app.inject({method:'POST',url,headers:{...headers(),origin:'https://evil.invalid'},payload})).statusCode,403);assert.equal((await app.inject({method:'POST',url,headers:headers(),payload:{...payload,owner:f.other}})).statusCode,400);approved=false;assert.equal((await app.inject({method:'POST',url,headers:headers(),payload})).statusCode,403);
});

test('approval revoked during classification source read prevents state and history writes',async t=>{const f=await fixture();t.after(()=>f.pg.close());const delayed={...f.business,list:async(owner:string)=>{const value=await f.business.list(owner);await f.pg.query("update users set approval_status='pending' where id=$1",[owner]);return value;}};const repository=createFinanceClassificationRepository(f.db,delayed,f.cipher),view=await f.repository.read(f.owner);await assert.rejects(repository.change(f.owner,command(0,{type:'edit',edit:{...view.transactions[0]!.effective!,note:'revoked synthetic'}})));assert.equal((await f.pg.query('select * from finance_classification_workspaces')).rows.length,0);assert.equal((await f.pg.query('select * from finance_classification_revisions')).rows.length,0);});
