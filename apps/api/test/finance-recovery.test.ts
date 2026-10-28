import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/neon-http';
import type {NeonQueryFunction} from '@neondatabase/serverless';
import {createFinanceRawRepository} from '../src/db/finance-raw.js';
import {createFinanceBusinessRepository,createBusinessFingerprint} from '../src/db/finance-business.js';
import {createRawCipher} from '../src/finance-raw-crypto.js';
import {bankSource} from './fixtures/finance-raw.js';
// A synthetic runbook rehearsal, not a production export/restore endpoint.
const tables=['finance_raw_batches','finance_raw_files','finance_raw_rows','finance_business_scopes','finance_business_documents','finance_business_events'];
async function database(){const pg=new PGlite(),journal=JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));for(const e of journal.entries)await pg.exec(await readFile(new URL(`../drizzle/${e.tag}.sql`,import.meta.url),'utf8'));const query=async(sql:string,params:unknown[],options?:{arrayMode?:boolean})=>{const r=await pg.query(sql,params);return {...r,rowCount:r.affectedRows??r.rows.length,rows:options?.arrayMode?r.rows.map(r=>Object.values(r as object)):r.rows};},db=drizzle({client:Object.assign(query,{query}) as unknown as NeonQueryFunction<false,false>}),cipher=createRawCipher('ac'.repeat(32)),raw=createFinanceRawRepository(db,cipher),business=createFinanceBusinessRepository(db,raw,cipher,createBusinessFingerprint('ac'.repeat(32)));return {pg,raw,business};}
test('isolated synthetic financial restore preserves newer authentication state and reapplies deletion exclusions',async t=>{
 const live=await database(),isolated=await database();t.after(()=>live.pg.close());t.after(()=>isolated.pg.close());const owner=randomUUID(),other=randomUUID();for(const f of [live,isolated])for(const id of [owner,other])await f.pg.query("insert into users(id,email,password_hash,approval_status,role) values($1,$2,'synthetic','approved','member')",[id,`${id}@example.invalid`]);
 const source=bankSource(),saved=await live.raw.import(owner,{batchId:randomUUID(),document:source}),detail=await live.business.process(owner,saved.file.id);
 const backup:Record<string,unknown[]>={};for(const table of tables)backup[table]=(await live.pg.query(`select * from ${table} where owner_id=$1`,[owner])).rows;
 assert.equal(JSON.stringify(backup).includes('synthetic employer'),false);
 // Newer state in a different domain must not be rolled back with finance.
 await isolated.pg.query("update users set role='admin' where id=$1",[other]);
 const restore=async(deleted:Set<string>)=>{if(deleted.has(owner))return;await isolated.pg.transaction(async tx=>{for(const table of tables)await tx.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`,[JSON.stringify(backup[table])]);});};
 await restore(new Set([owner]));assert.equal((await isolated.raw.list(owner)).length,0);
 await restore(new Set());assert.deepEqual(await isolated.raw.find(owner,saved.file.id),await live.raw.find(owner,saved.file.id));assert.deepEqual(await isolated.business.find(owner,detail.document.id),detail);
 assert.equal((await isolated.pg.query<{role:string}>('select role from users where id=$1',[other])).rows[0]!.role,'admin');
 // Account deletion cascades through restored Raw/business relationships.
 await isolated.pg.query('delete from users where id=$1',[owner]);for(const table of tables)assert.equal((await isolated.pg.query(`select * from ${table} where owner_id=$1`,[owner])).rows.length,0);
 await restore(new Set([owner]));assert.equal((await isolated.raw.list(owner)).length,0);
});
