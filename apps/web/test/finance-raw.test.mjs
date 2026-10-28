import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setupServer} from 'msw/node';
import {createFinanceRawHandlers} from '../src/mocks/finance-raw-handlers.ts';
import {bankRawColumns} from '@innova/contracts';
import {createServer} from 'vite';

test('Raw MSW mirrors actor isolation, duplicate/conflict, and no-store readback',async t=>{
 let user={id:crypto.randomUUID(),email:'synthetic@example.invalid',role:'member',approvalStatus:'approved'};
 const server=setupServer(...createFinanceRawHandlers(()=>user));server.listen({onUnhandledRequest:'error'});t.after(()=>server.close());
 const base='http://localhost/api/finance/raw';
 const headers=()=>({'x-expected-user':user.id,'x-finance-request':'1',origin:'http://localhost','content-type':'application/json'});
 const document={kind:'kb-bank-pdf',fileHash:'b'.repeat(64),parserVersion:'kb-raw-v1',metadata:[],rows:[{sequence:1,page:1,sourceRow:1,kind:'transaction',cells:bankRawColumns.map(column=>({column,value:null,type:'blank'}))}]};
 const post=(doc=document)=>fetch(base+'/imports',{method:'POST',headers:headers(),body:JSON.stringify({batchId:crypto.randomUUID(),document:doc})});
 const first=await post();assert.equal(first.status,200);const saved=await first.json();assert.equal(saved.duplicate,false);
 assert.equal((await (await post()).json()).duplicate,true);
 const changed=structuredClone(document);changed.rows[0].cells[0].value='changed';assert.equal((await post(changed)).status,409);
 const read=await fetch(base+'/files/'+saved.file.id,{headers:headers()});assert.equal(read.headers.get('cache-control'),'no-store');assert.equal(JSON.stringify(await read.json()).includes(document.fileHash),false);
 const old=user.id;user={...user,id:crypto.randomUUID(),role:'admin'};
 assert.equal((await fetch(base+'/files/'+saved.file.id,{headers:headers()})).status,404);
 assert.equal((await fetch(base+'/files',{headers:{...headers(),'x-expected-user':old}})).status,403);
 user=null;assert.equal((await fetch(base+'/files')).status,401);
});

test('Raw cache is protected and late GETs cannot populate a different session',async t=>{
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});t.after(()=>vite.close());
 const {QueryClient}=await import('@tanstack/react-query');
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});t.after(()=>client.clear());
 const {rawFilesQuery,financeRawKeys}=await vite.ssrLoadModule('/src/entities/finance-raw/queries.ts');
 const {clearProtectedQueries,isProtectedQueryKey}=await vite.ssrLoadModule('/src/features/auth/clear-protected-queries.ts');
 const {getSessionVersion}=await vite.ssrLoadModule('/src/entities/auth/session-version.ts');
 const prior=globalThis.fetch;let resolve;
 globalThis.fetch=()=>new Promise(r=>{resolve=r;});t.after(()=>{globalThis.fetch=prior;});
 const owner=crypto.randomUUID(),options=rawFilesQuery(client,owner,0);
 const pending=options.queryFn({signal:new AbortController().signal});
 client.setQueryData(financeRawKeys.files(owner,0),{files:[]});
 assert.equal(isProtectedQueryKey(financeRawKeys.files(owner,0)),true);
 clearProtectedQueries(client);assert.equal(getSessionVersion(client),1);assert.equal(client.getQueryData(financeRawKeys.files(owner,0)),undefined);
 resolve(new Response(JSON.stringify({files:[]}),{headers:{'content-type':'application/json'}}));await assert.rejects(pending);
});

test('XLSX Raw preserves attributed text, blank cells and every physical column',async t=>{
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});t.after(()=>vite.close());
 const {parseRawDocument}=await vite.ssrLoadModule('/src/features/finance-raw-import/parse-document.ts');
 const {zipSync,strToU8}=await import('fflate');
 const source='<worksheet><sheetData><row r="2"><c r="L2" t="str"><v xml:space="preserve">Synthetic\nHeader</v></c></row><row r="4"><c r="B4" t="str"><v>26.01.01</v></c><c r="C4" t="str"><v>synthetic</v></c><c r="F4" t="str"><v>unlabeled-column</v></c><c r="G4"><v>100</v></c><c r="I4"><v>100</v></c><c r="J4" t="inlineStr"/><c r="K4" t="inlineStr"><is><t></t></is></c></row><row r="5"><c r="J5"><v>-1</v></c></row><row r="6"><c r="B6" t="str"><v>Summary</v></c><c r="I6"><v>100</v></c></row></sheetData></worksheet>';
 const bytes=zipSync({'xl/worksheets/sheet1.xml':strToU8(source)});
 const doc=await parseRawDocument(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 assert.equal(doc.rows.length,4);assert.equal(doc.rows[0].cells[11].value,'Synthetic\nHeader');
 assert.equal(doc.rows[1].cells.length,12);assert.equal(doc.rows[1].cells[5].value,'unlabeled-column');
 assert.equal(doc.rows[1].cells[9].value,null);assert.equal(doc.rows[1].cells[9].type,'blank');assert.equal(doc.rows[1].cells[10].value,'');
 assert.equal(doc.rows[2].kind,'continuation');assert.equal(doc.rows[2].cells[9].value,'-1');assert.equal(doc.rows[3].kind,'summary');
 const invalid=zipSync({'xl/worksheets/sheet1.xml':strToU8(source.replace('<v>100</v>','<f>SUM(1,2)</f><v>100</v>'))});
 await assert.rejects(parseRawDocument(invalid.buffer.slice(invalid.byteOffset,invalid.byteOffset+invalid.byteLength)));
});

test('Raw command caches confirmed metadata only and rejects a late save after account change',async t=>{
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});t.after(()=>vite.close());
 const {QueryClient}=await import('@tanstack/react-query');const client=new QueryClient();t.after(()=>client.clear());
 const {importRawFiles}=await vite.ssrLoadModule('/src/features/finance-raw-import/import-files.ts');
 const {financeRawKeys}=await vite.ssrLoadModule('/src/entities/finance-raw/queries.ts');
 const {clearProtectedQueries}=await vite.ssrLoadModule('/src/features/auth/clear-protected-queries.ts');
 const owner=crypto.randomUUID(),id=crypto.randomUUID();
 const document={kind:'kb-card-xlsx',fileHash:'c'.repeat(64),parserVersion:'kb-raw-v1',metadata:[{key:'synthetic',value:'PRIVATE_RAW_MARKER',page:1}],rows:[{sequence:1,page:1,sourceRow:1,kind:'header',cells:[...'ABCDEFGHIJKL'].map(column=>({column,value:null,type:'blank'}))}]};
 const file={id,batchId:crypto.randomUUID(),kind:document.kind,parserVersion:document.parserVersion,rowCount:1,createdAt:new Date().toISOString()};
 const priorWorker=globalThis.Worker,priorFetch=globalThis.fetch;let changed=false;
 globalThis.Worker=class{postMessage(){queueMicrotask(()=>this.onmessage?.({data:{ok:true,document}}));}terminate(){}};
 globalThis.fetch=async(_url,init)=>{if(init.method==='POST'){if(changed)clearProtectedQueries(client);return new Response(JSON.stringify({file,duplicate:false}),{headers:{'content-type':'application/json'}});}const {fileHash:_,...safe}=document;return new Response(JSON.stringify({file,document:safe}),{headers:{'content-type':'application/json'}});};
 t.after(()=>{globalThis.Worker=priorWorker;globalThis.fetch=priorFetch;});
 const input=()=>new File([new Uint8Array([80,75,3,4,0])],'synthetic.xlsx');
 const results=await importRawFiles(client,owner,0,[input()],'',new AbortController().signal);
 assert.equal(results[0].status,'saved');assert.deepEqual(client.getQueryData(financeRawKeys.files(owner,0)),{files:[file]});assert.equal(JSON.stringify(client.getQueryData(financeRawKeys.files(owner,0))).includes('PRIVATE_RAW_MARKER'),false);
 changed=true;await assert.rejects(importRawFiles(client,owner,0,[input()],'',new AbortController().signal));assert.equal(client.getQueryData(financeRawKeys.files(owner,0)),undefined);
});
