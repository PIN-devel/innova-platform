import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setupServer} from 'msw/node';
import {createServer} from 'vite';
import {createFinanceRawHandlers} from '../src/mocks/finance-raw-handlers.ts';
import {bankSource,cardSource} from '../../api/test/fixtures/finance-raw.ts';

test('business mocks preserve Raw links, repeated processing, pending overlaps and actor isolation',async t=>{
 let user={id:crypto.randomUUID(),email:'synthetic@example.invalid',role:'member',approvalStatus:'approved'};
 const server=setupServer(...createFinanceRawHandlers(()=>user));server.listen({onUnhandledRequest:'error'});t.after(()=>server.close());
 const headers=()=>({'x-expected-user':user.id,'x-finance-request':'1',origin:'http://localhost','content-type':'application/json'});
 const call=async(path,body)=>fetch('http://localhost/api/finance/'+path,{method:body?'POST':'GET',headers:headers(),...(body?{body:JSON.stringify(body)}:{})});
 const raw=await (await call('raw/imports',{batchId:crypto.randomUUID(),document:bankSource()})).json();
 const first=await (await call('business/process',{rawFileId:raw.file.id})).json();assert.equal(first.document.state,'accepted');assert.equal(first.events.length,3);assert.equal(first.events[0].rawFileId,raw.file.id);
 const again=await (await call('business/process',{rawFileId:raw.file.id})).json();assert.deepEqual(again,first);
 const newer=await (await call('raw/imports',{batchId:crypto.randomUUID(),document:bankSource({payment:'1100'})})).json();
 const pending=await (await call('business/process',{rawFileId:newer.file.id})).json();assert.equal(pending.document.state,'needs-review');assert.equal(pending.events.length,0);assert.ok(pending.document.candidateDocumentIds.includes(first.document.id));
 const read=await call('business/documents/'+first.document.id);assert.equal(read.headers.get('cache-control'),'no-store');assert.deepEqual(await read.json(),first);
 const card=await (await call('raw/imports',{batchId:crypto.randomUUID(),document:cardSource({installment:'2/5'})})).json();
 const interpreted=await (await call('business/process',{rawFileId:card.file.id})).json();assert.equal(interpreted.document.totals.observedPurchases,null);assert.equal(interpreted.document.period.coverage,'unknown');
 const original=user.id;user={...user,id:crypto.randomUUID(),role:'admin'};assert.equal((await call('business/documents/'+first.document.id)).status,404);assert.equal((await call('business/process',{rawFileId:raw.file.id})).status,404);
 assert.equal((await fetch('http://localhost/api/finance/business/documents',{headers:{...headers(),'x-expected-user':original}})).status,403);
});

test('business data is protected and a late processing response cannot enter the next session',async t=>{
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});t.after(()=>vite.close());
 const {QueryClient}=await import('@tanstack/react-query');const client=new QueryClient();t.after(()=>client.clear());
 const {businessKeys}=await vite.ssrLoadModule('/src/entities/finance-business/queries.ts');
 const {processBusinessFile}=await vite.ssrLoadModule('/src/features/finance-business/process-file.ts');
 const {clearProtectedQueries,isProtectedQueryKey}=await vite.ssrLoadModule('/src/features/auth/clear-protected-queries.ts');
 const owner=crypto.randomUUID(),key=businessKeys.list(owner,0);client.setQueryData(key,{documents:[],settlements:[]});assert.equal(isProtectedQueryKey(key),true);
 let resolve;const nativeFetch=globalThis.fetch;globalThis.fetch=()=>new Promise(r=>{resolve=r;});t.after(()=>{globalThis.fetch=nativeFetch;});
 const action=processBusinessFile(client,owner,0,crypto.randomUUID(),new AbortController().signal);clearProtectedQueries(client);
 resolve(new Response(JSON.stringify({invalid:'synthetic response after switch'}),{headers:{'content-type':'application/json'}}));await assert.rejects(action);assert.equal(client.getQueryData(key),undefined);
});

test('finance history survives the loader-to-view observer gap and is still removed on session change',async t=>{
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});t.after(()=>vite.close());
 const {QueryClient,QueryObserver}=await import('@tanstack/react-query');const client=new QueryClient({defaultOptions:{queries:{retry:false}}});t.after(()=>client.clear());
 const {businessListQuery,businessKeys}=await vite.ssrLoadModule('/src/entities/finance-business/queries.ts');
 const {rawFilesQuery,financeRawKeys}=await vite.ssrLoadModule('/src/entities/finance-raw/queries.ts');
 const {clearProtectedQueries}=await vite.ssrLoadModule('/src/features/auth/clear-protected-queries.ts');
 const prior=globalThis.fetch;let calls=0;globalThis.fetch=async url=>{calls++;return new Response(JSON.stringify(String(url).includes('/business/')?{documents:[],settlements:[]}:{files:[]}),{headers:{'content-type':'application/json'}});};t.after(()=>{globalThis.fetch=prior;});
 const owner=crypto.randomUUID(),business=businessListQuery(client,owner,0),raw=rawFilesQuery(client,owner,0);
 await client.query(business);await client.query(raw);
 // Route loading has completed but the lazy view has not subscribed yet.
 await new Promise(resolve=>setTimeout(resolve,10));
 const observers=[new QueryObserver(client,{...business,enabled:false}),new QueryObserver(client,{...raw,enabled:false})];const stops=observers.map(o=>o.subscribe(()=>{}));t.after(()=>stops.forEach(stop=>stop()));
 assert.deepEqual(observers[0].getCurrentResult().data,{documents:[],settlements:[]});assert.deepEqual(observers[1].getCurrentResult().data,{files:[]});assert.equal(calls,2);
 clearProtectedQueries(client);assert.equal(client.getQueryData(businessKeys.list(owner,0)),undefined);assert.equal(client.getQueryData(financeRawKeys.files(owner,0)),undefined);
});
