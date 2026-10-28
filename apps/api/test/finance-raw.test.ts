import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/neon-http';
import type {NeonQueryFunction} from '@neondatabase/serverless';
import {bankRawColumns,financeRawDocumentSchema,type FinanceRawImport} from '@innova/contracts';
import {createFinanceRawRepository} from '../src/db/finance-raw.js';
import {createRawCipher} from '../src/finance-raw-crypto.js';
import {buildApp} from '../src/app.js';
import type {UserRepository} from '../src/db/users.js';
import {createApplicationLogger} from '../src/logger.js';
import type {ExamRepository} from '../src/db/exam.js';
const owner=randomUUID(),other=randomUUID(),admin=randomUUID(),pending=randomUUID();
const input=():FinanceRawImport=>({batchId:randomUUID(),document:financeRawDocumentSchema.parse({kind:'kb-bank-pdf',fileHash:'a'.repeat(64),parserVersion:'kb-raw-v1',metadata:[{key:'synthetic',value:'SYNTHETIC_PRIVATE_MARKER',page:1}],rows:[{sequence:1,page:1,sourceRow:1,kind:'transaction',cells:bankRawColumns.map((column,i)=>({column,value:i===6?null:i===3?'0':i===4?'100':i===5?'100':'synthetic',type:i===6?'blank':'text'}))}]})});
async function fixture(){
 const pg=new PGlite();
 const journal=JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
 for(const e of journal.entries)await pg.exec(await readFile(new URL(`../drizzle/${e.tag}.sql`,import.meta.url),'utf8'));
 for(const id of [owner,other,admin,pending])await pg.query("insert into users (id,email,password_hash,approval_status,role) values ($1,$2,'synthetic',$3,$4)",[id,`${id}@example.invalid`,id===pending?'pending':'approved',id===admin?'admin':'member']);
 const query=async(sql:string,params:unknown[],options?:{arrayMode?:boolean})=>{
  const result=await pg.query(sql,params);return {...result,rowCount:result.affectedRows??result.rows.length,rows:options?.arrayMode?result.rows.map(r=>Object.values(r as object)):result.rows};
 };
 const client=Object.assign(query,{query}) as unknown as NeonQueryFunction<false,false>;
 const repo=createFinanceRawRepository(drizzle({client}),createRawCipher('ab'.repeat(32)));
 return {pg,repo};
}
test('Raw migration/repository preserve cells, encrypt, isolate owner, and retry atomically',async t=>{
 const {pg,repo}=await fixture();t.after(()=>pg.close());
 const first=input();const saved=await repo.import(owner,first);
 assert.equal(saved.duplicate,false);
 const expected={...first.document};const {fileHash:_,...safe}=expected;
 assert.deepEqual((await repo.find(owner,saved.file.id))?.document,safe);
 assert.equal(await repo.find(other,saved.file.id),undefined);assert.equal(await repo.find(admin,saved.file.id),undefined);
 assert.deepEqual(await repo.list(other),[]);
 const repeated=await repo.import(owner,{...first,batchId:randomUUID()});assert.equal(repeated.file.id,saved.file.id);assert.equal(repeated.duplicate,true);
 const changed=structuredClone(first);changed.document.rows[0]!.cells[0]!.value='changed';
 await assert.rejects(repo.import(owner,changed),e=>e instanceof Error&&e.message.includes('differs'));
 const [{count}]= (await pg.query<{count:number}>('select count(*)::int as count from finance_raw_rows')).rows;assert.equal(count,1);
 const rows=await pg.query('select * from finance_raw_rows');assert.equal(JSON.stringify(rows).includes('synthetic'),false);
 const files=await pg.query('select metadata_ciphertext from finance_raw_files');assert.equal(JSON.stringify(files).includes('SYNTHETIC_PRIVATE_MARKER'),false);
 await repo.import(other,first);assert.equal((await repo.list(other)).length,1);
 await assert.rejects(pg.query('insert into finance_raw_rows (owner_id,file_id,sequence,payload_ciphertext) values ($1,$2,2,\'bad\')',[other,saved.file.id]));
 const invalid=structuredClone(first);invalid.document.rows[0]!.sequence=2;assert.equal(financeRawDocumentSchema.safeParse(invalid.document).success,false);
});
test('Raw route requires approved owner and expected actor/Origin; errors never echo input',async t=>{
 const {pg,repo}=await fixture();t.after(()=>pg.close());
 const users={findById:async(id:string)=>({id,email:'synthetic@example.invalid',passwordHash:'unused',role:id===admin?'admin':'member',approvalStatus:id===pending?'pending':'approved'})} as UserRepository;
 const exams={find:async()=>undefined,create:async()=>{throw Error('unused');}} as ExamRepository;
 const app=buildApp({logger:false,userRepository:users,examRepository:exams,financeRawRepository:repo,jwtSecret:'test-only-secret-at-least-thirty-two-characters'});t.after(()=>app.close());await app.ready();
 const headers=(id=owner)=>({cookie:`exam_drill_auth=${app.jwt.sign({sub:id})}`,'x-expected-user':id,'x-finance-request':'1',origin:'http://localhost:5174'});
 const noauth=await app.inject({url:'/api/finance/raw/files'});assert.equal(noauth.statusCode,401);assert.equal(noauth.headers['cache-control'],'no-store');
 const data=input();const saved=await app.inject({method:'POST',url:'/api/finance/raw/imports',payload:data,headers:headers()});assert.equal(saved.statusCode,200,saved.body);
 const id=saved.json().file.id;
 for(const actor of [other,admin]){const r=await app.inject({url:`/api/finance/raw/files/${id}`,headers:headers(actor)});assert.equal(r.statusCode,404);}
 assert.equal((await app.inject({url:'/api/finance/raw/files',headers:headers(pending)})).statusCode,403);
 assert.equal((await app.inject({url:'/api/finance/raw/files',headers:{...headers(),'x-expected-user':other}})).statusCode,403);
 for(const h of [{...headers(),origin:'https://evil.invalid'},{...headers(),origin:''},{...headers(),'x-finance-request':''}])assert.equal((await app.inject({method:'POST',url:'/api/finance/raw/imports',headers:h,payload:data})).statusCode,403);
 const invalid=await app.inject({method:'POST',url:'/api/finance/raw/imports',headers:headers(),payload:{...data,privateMarker:'SYNTHETIC_PRIVATE_MARKER'}});assert.equal(invalid.statusCode,400);assert.equal(invalid.body.includes('SYNTHETIC_PRIVATE_MARKER'),false);
 const readback=await app.inject({url:`/api/finance/raw/files/${id}`,headers:headers()});assert.equal(readback.statusCode,200);assert.equal(readback.headers['cache-control'],'no-store');assert.equal(readback.body.includes(data.document.fileHash),false);
});
test('AEAD rejects tampering and different owner/file/row purpose',()=>{
 const cipher=createRawCipher('bc'.repeat(32)),sealed=cipher.seal({private:'synthetic'},'owner:file:1');
 assert.deepEqual(cipher.open(sealed,'owner:file:1'),{private:'synthetic'});
 assert.throws(()=>cipher.open(sealed,'other:file:1'));assert.throws(()=>cipher.open(sealed.replace(/^1:/,'2:'),'owner:file:1'));
 assert.throws(()=>createRawCipher('short'));
});

 test('Raw parser/DB/crypto errors stay out of global logs and response bodies',async t=>{
 const {pg,repo}=await fixture();t.after(()=>pg.close());let logs='';
 const logger=createApplicationLogger({destination:{write(chunk){logs+=chunk;}}});
 const users={findById:async(id:string)=>({id,email:'synthetic@example.invalid',passwordHash:'unused',role:'member',approvalStatus:'approved'})} as UserRepository;
 const exams={find:async()=>undefined,create:async()=>{throw Error('unused');}} as ExamRepository;
 const app=buildApp({logger,userRepository:users,examRepository:exams,financeRawRepository:{...repo,list:async()=>{throw Error('SYNTHETIC_SECRET_DB_ERROR');}},jwtSecret:'test-only-secret-at-least-thirty-two-characters'});t.after(()=>app.close());await app.ready();
 const headers={cookie:`exam_drill_auth=${app.jwt.sign({sub:owner})}`,'x-expected-user':owner};
 const response=await app.inject({url:'/api/finance/raw/files',headers});assert.equal(response.statusCode,500);assert.equal(response.headers['cache-control'],'no-store');assert.equal(response.body.includes('SYNTHETIC_SECRET_DB_ERROR'),false);assert.equal(logs.includes('SYNTHETIC_SECRET_DB_ERROR'),false);
 });
