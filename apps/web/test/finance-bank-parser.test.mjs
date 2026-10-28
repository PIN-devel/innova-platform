import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'vite';
import {bankRawColumns} from '@innova/contracts';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Exercise extraction/validation with synthetic PDF.js text, without storing a
// financial PDF. Real PDF decoding and Android workers require separate QA.
test('bank text extraction accepts both printed directions within one second and rejects broken balances',async t=>{
 const cacheDir=await mkdtemp(join(tmpdir(),'finance-bank-parser-'));let vite;
 t.after(async()=>{await vite?.close();await rm(cacheDir,{recursive:true,force:true});});
 vite=await createServer({cacheDir,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',ssr:{noExternal:['pdfjs-dist']},plugins:[{
  name:'synthetic-pdf-text',enforce:'pre',
  resolveId(id){if(id==='pdfjs-dist')return '\0synthetic-pdf-text';},
  load(id){if(id==='\0synthetic-pdf-text')return `
   let items=[];
   export const setItems=value=>{items=value;};
   export const GlobalWorkerOptions={};
   export const getDocument=()=>({destroy:async()=>{},promise:Promise.resolve({numPages:1,getPage:async()=>({getViewport:()=>({width:595.28,height:842}),getTextContent:async()=>({items})})})});
  `;},
 }]});
 const {parseRawDocument}=await vite.ssrLoadModule('/src/features/finance-raw-import/parse-document.ts');
 const {setItems}=await vite.ssrLoadModule('pdfjs-dist');
 const item=(str,x,y)=>({str,transform:[1,0,0,1,x,842-y],height:10});
 const columns=[33,110,170,252,316,380,444,529];
 const metadata=[item('2026.01.01 ~ 2026.01.31',33,90),item('000000001234',170,140),item('3000',170,172),item('1500',440,172)];
 const rows=[
  ['2026.01.10 09:00:00','급여','synthetic employer','0','3000','4000','','synthetic branch'],
  ['2026.01.10 09:00:00','KB국민카드','synthetic card','1000','0','3000','','synthetic branch'],
  ['2026.01.10 09:00:00','타계좌 이체','synthetic recipient','500','0','2500','','synthetic branch'],
 ];
 const textRows=values=>[...metadata,...bankRawColumns.map((name,i)=>item(name,columns[i],210)),...values.flatMap((row,i)=>row.map((value,col)=>item(value,columns[col],240+i*24)))];
 const bytes=()=>new TextEncoder().encode('%PDF-synthetic-text').buffer;
 for(const printed of [rows,[...rows].reverse()]){
  setItems(textRows(printed));
  const document=await parseRawDocument(bytes());
  assert.equal(document.rows.length,3);
  assert.deepEqual(document.rows.map(row=>row.cells[5].value),printed.map(row=>row[5]));
 }
 const broken=structuredClone(rows);broken[1][5]='2999';setItems(textRows(broken));
 await assert.rejects(parseRawDocument(bytes()),/bank-balance-mismatch/);
 const wrongTotal=structuredClone(rows);wrongTotal[0][4]='3001';setItems(textRows(wrongTotal));
 await assert.rejects(parseRawDocument(bytes()),/bank-total-mismatch/);
});
