import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/neon-http';
import type {NeonQueryFunction} from '@neondatabase/serverless';
import {createFinanceRawRepository} from '../src/db/finance-raw.js';
import {createFinanceBusinessRepository,createBusinessFingerprint} from '../src/db/finance-business.js';
import {createRawCipher} from '../src/finance-raw-crypto.js';
import {buildApp} from '../src/app.js';
import type {UserRepository} from '../src/db/users.js';
import type {ExamRepository} from '../src/db/exam.js';
import {bankSource,cardSource} from './fixtures/finance-raw.js';
import type {FinanceRawDocument} from '@innova/contracts';
async function fixture(){
 const pg=new PGlite();
 const journal=JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
 for(const e of journal.entries)await pg.exec(await readFile(new URL(`../drizzle/${e.tag}.sql`,import.meta.url),'utf8'));
 const owner=randomUUID(),other=randomUUID(),admin=randomUUID();
 for(const id of [owner,other,admin])await pg.query("insert into users (id,email,password_hash,approval_status,role) values ($1,$2,'synthetic','approved',$3)",[id,`${id}@example.invalid`,id===admin?'admin':'member']);
 const query=async(sql:string,params:unknown[],options?:{arrayMode?:boolean})=>{const result=await pg.query(sql,params);return {...result,rowCount:result.affectedRows??result.rows.length,rows:options?.arrayMode?result.rows.map(r=>Object.values(r as object)):result.rows};};
 const db=drizzle({client:Object.assign(query,{query}) as unknown as NeonQueryFunction<false,false>});
 const cipher=createRawCipher('cd'.repeat(32)),raw=createFinanceRawRepository(db,cipher),business=createFinanceBusinessRepository(db,raw,cipher,createBusinessFingerprint('cd'.repeat(32)));
 const save=async(document:FinanceRawDocument,actor=owner)=>(await raw.import(actor,{batchId:randomUUID(),document})).file.id;
 return {pg,db,cipher,owner,other,admin,raw,business,save};
}
test('business SQL stores encrypted events with Raw row lineage, readback, idempotency and owner isolation',async t=>{
 const f=await fixture();t.after(()=>f.pg.close());
 const rawId=await f.save(bankSource());const first=await f.business.process(f.owner,rawId);
 assert.equal(first.document.state,'accepted');assert.equal(first.events.length,3);assert.ok(first.events.every(e=>e.rawFileId===rawId));
 const repeated=await f.business.process(f.owner,rawId);assert.deepEqual(repeated,first);
 assert.equal(await f.business.find(f.other,first.document.id),undefined);assert.equal(await f.business.find(f.admin,first.document.id),undefined);
 await assert.rejects(f.business.process(f.other,rawId));
 const rows=await f.pg.query('select * from finance_business_events');assert.equal(JSON.stringify(rows).includes('synthetic employer'),false);
 const otherRaw=await f.save(bankSource(),f.other);
 await assert.rejects(f.pg.query("insert into finance_business_events(id,owner_id,document_id,raw_file_id,raw_sequence,kind,payload_ciphertext) values($1,$2,$3,$4,1,'bank-cash','bad')",[randomUUID(),f.other,first.document.id,otherRaw]));
 const invalid=bankSource();invalid.rows[1]!.cells[5]!.value='9999';const invalidId=await f.save(invalid);const blocked=await f.business.process(f.owner,invalidId);assert.equal(blocked.document.state,'invalid');assert.deepEqual(blocked.events,[]);
});
test('parallel overlapping files cannot both become accepted, and reprocessing keeps the initial result',async t=>{
 const f=await fixture();t.after(()=>f.pg.close());
 const files=[await f.save(bankSource()),await f.save(bankSource({payment:'1100'}))];
 const results=await Promise.all(files.map(id=>f.business.process(f.owner,id)));
 assert.equal(results.filter(r=>r.document.state==='accepted').length,1);assert.equal(results.filter(r=>r.document.state==='needs-review').length,1);
 assert.equal((await f.pg.query<{count:number}>('select count(*)::int as count from finance_business_events')).rows[0]!.count,3);
 for(let i=0;i<files.length;i++)assert.deepEqual(await f.business.process(f.owner,files[i]!),results[i]);
 const list=await f.business.list(f.owner);assert.equal(list.documents.length,2);assert.equal(list.documents.find(d=>d.state==='needs-review')!.candidateDocumentIds.length,1);
});
test('bank/card settlement is separate from consumption; later statements remain pending and coverage unknown',async t=>{
 const f=await fixture();t.after(()=>f.pg.close());
 await f.business.process(f.owner,await f.save(bankSource({month:'2026-02',payment:'120'})));
 const card=await f.business.process(f.owner,await f.save(cardSource({due:true})));
 assert.equal(card.document.totals.observedPurchases,'600');assert.equal(card.document.totals.billedTotal,'120');assert.equal(card.document.period.coverage,'unknown');
 assert.equal((await f.business.list(f.owner)).settlements[0]!.state,'matched');
 const later=await f.business.process(f.owner,await f.save(cardSource({installment:'2/5'})));assert.equal(later.document.state,'needs-review');assert.equal(later.events.length,0);
 const movedSource=cardSource();movedSource.rows[0]!.cells.find(c=>c.column==='B')!.value='26.03.10';const moved=await f.business.process(f.owner,await f.save(movedSource));assert.equal(moved.document.state,'needs-review');assert.ok(moved.document.reasons.includes('possible-duplicate'));
 const still=await f.business.find(f.owner,card.document.id);assert.deepEqual(still,card);
});
test('business API keeps owner/expected actor/Origin boundaries and no-store responses',async t=>{
 const f=await fixture();t.after(()=>f.pg.close());
 const users={findById:async(id:string)=>({id,email:'synthetic@example.invalid',passwordHash:'unused',role:id===f.admin?'admin':'member',approvalStatus:'approved'})} as UserRepository;
 const exams={find:async()=>undefined,create:async()=>{throw Error('unused');}} as ExamRepository;
 const app=buildApp({logger:false,userRepository:users,examRepository:exams,financeRawRepository:f.raw,financeBusinessRepository:f.business,jwtSecret:'test-only-secret-at-least-thirty-two-characters'});t.after(()=>app.close());await app.ready();
 const headers=(id=f.owner)=>({cookie:`exam_drill_auth=${app.jwt.sign({sub:id})}`,'x-expected-user':id,'x-finance-request':'1',origin:'http://localhost:5174'});
 const id=await f.save(bankSource());
 assert.equal((await app.inject({url:'/api/finance/business/documents'})).statusCode,401);
 const result=await app.inject({method:'POST',url:'/api/finance/business/process',headers:headers(),payload:{rawFileId:id}});assert.equal(result.statusCode,200,result.body);assert.equal(result.headers['cache-control'],'no-store');
 const doc=result.json().document.id;
 for(const user of [f.other,f.admin]){assert.equal((await app.inject({url:`/api/finance/business/documents/${doc}`,headers:headers(user)})).statusCode,404);assert.equal((await app.inject({method:'POST',url:'/api/finance/business/process',headers:headers(user),payload:{rawFileId:id}})).statusCode,404);}
 assert.equal((await app.inject({method:'POST',url:'/api/finance/business/process',headers:{...headers(),'x-expected-user':f.other},payload:{rawFileId:id}})).statusCode,403);
 assert.equal((await app.inject({method:'POST',url:'/api/finance/business/process',headers:{...headers(),origin:'https://evil.invalid'},payload:{rawFileId:id}})).statusCode,403);
});

test('approval revoked after Raw read prevents business commit',async t=>{const f=await fixture();t.after(()=>f.pg.close());const id=await f.save(bankSource());const delayed={...f.raw,find:async(owner:string,file:string)=>{const value=await f.raw.find(owner,file);await f.pg.query("update users set approval_status='pending' where id=$1",[owner]);return value;}};const repository=createFinanceBusinessRepository(f.db,delayed,f.cipher,createBusinessFingerprint('cd'.repeat(32)));await assert.rejects(repository.process(f.owner,id));assert.equal((await f.pg.query('select * from finance_business_documents')).rows.length,0);assert.equal((await f.pg.query('select * from finance_business_scopes')).rows.length,0);});
