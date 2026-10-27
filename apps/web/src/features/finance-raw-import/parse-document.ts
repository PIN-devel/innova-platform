// Vite provides the URL default export for this worker asset.
// eslint-disable-next-line import/default
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { bankRawColumns, cardRawColumns, financeRawDocumentSchema, type FinanceRawDocument } from '@innova/contracts';
const norm = (v: string) => v.replace(/\s+/g, '');
const integer = (v: string) => {
  const s = norm(v).replaceAll(',', '').replace(/원$/, '');
  if (!/^-?\d+$/.test(s)) throw Error('invalid-amount');
  return BigInt(s);
};
const hash = async (bytes: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
const array = <T>(v: T | T[] | undefined): T[] => v === undefined ? [] : Array.isArray(v) ? v : [v];
type Xml = Record<string, any>; // XML has an external, validated OOXML shape.
const xml = (bytes: Uint8Array): Xml => {
  const s = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(s) || XMLValidator.validate(s) !== true) throw Error('invalid-workbook');
  return new XMLParser({ignoreAttributes:false, attributeNamePrefix:'@_', parseTagValue:false, trimValues:false, processEntities:true}).parse(s);
};
const text = (v: any): string => typeof v === 'string' ? v : v?.['#text'] ?? '';
const richText = (v: Xml) => v.t !== undefined ? text(v.t) : array<Xml>(v.r).map(r => text(r.t)).join('');

function card(bytes: ArrayBuffer): Pick<FinanceRawDocument, 'kind' | 'metadata' | 'rows'> {
  let expanded = 0;
  const files = unzipSync(new Uint8Array(bytes), {filter: entry => {
    expanded += entry.originalSize;
    if (entry.originalSize > 12_000_000 || expanded > 40_000_000) throw Error('file-limit');
    return entry.name.startsWith('xl/') && entry.name.endsWith('.xml');
  }});
  const sheets = Object.keys(files).filter(p => /^xl\/worksheets\/sheet\d+\.xml$/.test(p));
  if (sheets.length !== 1) throw Error('unsupported-workbook');
  const strings = files['xl/sharedStrings.xml'] ? array<Xml>(xml(files['xl/sharedStrings.xml']).sst.si).map(richText) : [];
  const sheet = xml(files[sheets[0]]).worksheet;
  const sourceRows = array<Xml>(sheet.sheetData?.row);
  const rows: FinanceRawDocument['rows'] = [];
  let parent = false;
  for (const r of sourceRows) {
    const sourceRow = Number(r['@_r']);
    if (!Number.isInteger(sourceRow) || sourceRow < 1) throw Error('invalid-workbook');
    const map = new Map<string, FinanceRawDocument['rows'][number]['cells'][number]>();
    for (const c of array<Xml>(r.c)) {
      const address = String(c['@_r']);
      const column = address.replace(/\d/g, '');
      if (!cardRawColumns.includes(column)) throw Error('unsupported-column');
      if (c.f !== undefined) throw Error('unsupported-formula');
      const t = c['@_t']; let value: string | null = c.v === undefined || c.v === '' ? null : text(c.v);
      if (t === 's') { const i = Number(c.v); if (!Number.isInteger(i) || strings[i] === undefined) throw Error('invalid-workbook'); value = strings[i]; }
      if (t === 'inlineStr' && c.is !== undefined) value = richText(c.is);
      const type = value === null ? 'blank' : t === 's' || t === 'inlineStr' || t === 'str' ? 'text' : t === 'b' ? 'boolean' : t === 'e' ? 'error' : 'number';
      map.set(column, {column, value, type, source:address});
    }
    const cells = cardRawColumns.map(column => map.get(column) ?? {column, value:null, type:'blank' as const, source:`${column}${sourceRow}`});
    const val = (column: string) => cells.find(c => c.column === column)?.value;
    const transaction = /^\d{2,4}\.\d{2}\.\d{2}/.test(val('B') ?? '') && !!val('C');
    let kind: FinanceRawDocument['rows'][number]['kind'] = sourceRow < 4 ? 'header' : transaction ? 'transaction' : val('B') ? 'summary' : cells.some(c => c.value !== null && c.value !== '') ? 'continuation' : 'blank';
    if (kind === 'transaction') { integer(val('G') ?? ''); integer(val('I') ?? ''); parent = true; }
    if (kind === 'summary') parent = false;
    if (kind === 'continuation' && !parent) throw Error('orphan-row');
    rows.push({sequence:rows.length+1, sourceRow, page:1, kind, cells});
  }
  if (!rows.some(r => r.kind === 'transaction')) throw Error('empty-document');
  const merges = array<Xml>(sheet.mergeCells?.mergeCell).map(c => String(c['@_ref']));
  return {kind:'kb-card-xlsx', rows, metadata:[{key:'worksheet-part',value:sheets[0],page:1},{key:'merged-cells',value:JSON.stringify(merges),page:1},{key:'coverage',value:'unknown',page:1}]};
}

type Item = { str:string; x:number; y:number; height:number };
async function bank(bytes: ArrayBuffer, password: string, signal?: AbortSignal,onUnlocked?:()=>void): Promise<Pick<FinanceRawDocument, 'kind' | 'metadata' | 'rows'>> {
  const {getDocument,GlobalWorkerOptions}=await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
  signal?.throwIfAborted();
  const task = getDocument({data:new Uint8Array(bytes),verbosity:0,stopAtErrors:true,useSystemFonts:true});
  let supplied=false;let rejectPassword:(error:Error)=>void=()=>{};
  const passwordFailure=new Promise<never>((_,reject)=>{rejectPassword=reject;});
  task.onPassword=(updatePassword:(value:string)=>void)=>{if(!password||supplied){const error=new Error('PDF password required');error.name='PasswordException';rejectPassword(error);void task.destroy().catch(()=>{});return;}supplied=true;updatePassword(password);};
  const abort=()=>{void task.destroy().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try {
    const pdf = await Promise.race([task.promise,passwordFailure]);
    if(supplied)onUnlocked?.();
    if (pdf.numPages > 100) throw Error('file-limit');
    const rows: FinanceRawDocument['rows'] = [], metadata: FinanceRawDocument['metadata'] = [];
    // Reviewed KB text-PDF template; different geometry is rejected, never guessed.
    const bounds = [32.69,109.05,168.66,250.78,314.56,378.34,442.12,527.16,574.95];
    for (let n=1; n<=pdf.numPages; n++) {
      const page = await pdf.getPage(n), viewport = page.getViewport({scale:1});
      const content = await page.getTextContent();
      const items: Item[] = content.items.filter((i): i is typeof i & {str:string;transform:number[];height:number} => 'str' in i).filter(i=>i.str.trim()).map(i=>({str:i.str,x:i.transform[4],y:viewport.height-i.transform[5],height:i.height}));
      const header = items.filter(i=>norm(i.str)==='거래일시')[0];
      if (!header || Math.abs(viewport.width-595.28)>3) throw Error('unsupported-bank-layout');
      for (const label of bankRawColumns) if (!items.some(i=>norm(i.str)===norm(label)&&Math.abs(i.y-header.y)<15)) throw Error('missing-bank-column');
      const dates = items.filter(i=>i.x<bounds[1]&&/^\d{4}\.\d{2}\.\d{2}/.test(i.str.trim())&&i.y>header.y).sort((a,b)=>a.y-b.y);
      for (let index=0;index<dates.length;index++) {
        const d=dates[index], bottom=Math.min(d.y+18,(dates[index+1]?.y ?? d.y+23)-5);
        const cells = bankRawColumns.map((column,c)=>{
          const fragments=items.filter(i=>i.x>=bounds[c]-0.5&&i.x<bounds[c+1]-0.5&&i.y>=d.y-4&&i.y<bottom).sort((a,b)=>Math.abs(a.y-b.y)<2?a.x-b.x:a.y-b.y);
          const value=fragments.length?fragments.map(i=>i.str).join('\n'):null;
          return {column,value,type:value===null?'blank' as const:'text' as const};
        });
        const combined=cells[0].value?.match(/^(\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.+)$/s);
        if(combined){if(cells[1].value!==null)throw Error('ambiguous-bank-cell');cells[0].value=combined[1];cells[1].value=combined[2];cells[1].type='text';}
        if (!/\d{2}:\d{2}:\d{2}/.test(cells[0].value??'')) throw Error('incomplete-bank-row');
        for (const i of [3,4,5]) integer(cells[i].value??'');
        rows.push({sequence:rows.length+1, sourceRow:index+1, page:n, kind:'transaction',cells});
      }
      metadata.push({key:'페이지 번호 / 총 페이지',value:`${n}/${pdf.numPages}`,page:n});
      if(n===1) {
        const area=(left:number,right:number,top:number,bottom:number)=>items.filter(i=>i.x>=left&&i.x<right&&i.y>=top&&i.y<bottom).sort((a,b)=>a.y-b.y||a.x-b.x).map(i=>i.str).join('\n')||null;
        for(const [key,left,right,top,bottom] of [
          ['계좌명',168.6,575,117,133],['계좌번호',168.6,303.5,133,149],['예금주',437.3,575,133,149],
          ['총 잔액',168.6,303.5,149,165],['출금가능금액',437.3,575,149,165],['총 입금금액',168.6,303.5,165,181],['총 출금금액',437.3,575,165,181],
        ] as const) metadata.push({key,value:area(left,right,top,bottom),page:1});
        const line=items.filter(i=>i.y<header.y).map(i=>i.str).join(' ');
        const period=line.match(/(\d{4}\.\d{2}\.\d{2})\s*[~∼-]\s*(\d{4}\.\d{2}\.\d{2})/);
        if(!period) throw Error('missing-bank-period');
        metadata.push({key:'조회기간 시작',value:period[1],page:1},{key:'조회기간 종료',value:period[2],page:1});
      }
    }
    if(!rows.length) throw Error('empty-document');
    const total=(i:number)=>rows.reduce((sum,r)=>sum+integer(r.cells[i].value??''),0n);
    for(const [key,col] of [['총 입금금액',4],['총 출금금액',3]] as const) if(integer(metadata.find(m=>m.key===key)?.value??'')!==total(col)) throw Error('bank-total-mismatch');
    const ascending=rows.length<2||norm(rows[0].cells[0].value??'')<=norm(rows.at(-1)!.cells[0].value??'');
    const ordered=ascending?rows:[...rows].reverse();
    for(let i=1;i<ordered.length;i++) if(integer(ordered[i-1].cells[5].value??'')+integer(ordered[i].cells[4].value??'')-integer(ordered[i].cells[3].value??'')!==integer(ordered[i].cells[5].value??'')) throw Error('bank-balance-mismatch');
    return {kind:'kb-bank-pdf',rows,metadata};
  } finally { signal?.removeEventListener('abort',abort); await task.destroy().catch(()=>{}); }
}

export async function parseRawDocument(bytes: ArrayBuffer,password='',signal?:AbortSignal,onUnlocked?:()=>void): Promise<FinanceRawDocument> {
  if(bytes.byteLength>20_000_000||bytes.byteLength<5) throw Error('file-limit');
  const fileHash=await hash(bytes), signature=new Uint8Array(bytes,0,5);
  const pdf=String.fromCharCode(...signature)==='%PDF-';
  if(!pdf&&!(signature[0]===80&&signature[1]===75)) throw Error('unsupported-format');
  return financeRawDocumentSchema.parse({...await(pdf?bank(bytes,password,signal,onUnlocked):card(bytes)),fileHash,parserVersion:'kb-raw-v1'});
}
