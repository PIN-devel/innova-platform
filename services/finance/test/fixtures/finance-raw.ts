import { randomUUID } from 'node:crypto';
import { bankRawColumns, cardRawColumns, financeRawDocumentSchema, type FinanceRawDocument, type FinanceRawReadback } from '@innova/contracts';
export function bankSource(options:{month?:string;account?:string;payment?:string;reverse?:boolean}={}):FinanceRawDocument {
  const month=options.month??'2026-01',payment=options.payment??'1000';
  const raw=[
    [`${month}.01 09:00:00`.replaceAll('-','.'),'급여','synthetic employer','0','3000','4000',null,'synthetic branch'],
    [`${month}.10 09:00:00`.replaceAll('-','.'),'KB국민카드','synthetic card','1000','0','3000',null,'synthetic branch'],
    [`${month}.11 09:00:00`.replaceAll('-','.'),'타계좌 이체','synthetic recipient','500','0','2500',null,'synthetic branch'],
  ];
  raw[1]![3]=payment;raw[1]![5]=(4000n-BigInt(payment)).toString();raw[2]![5]=(3500n-BigInt(payment)).toString();
  if(options.reverse)raw.reverse();
  const end=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
  return financeRawDocumentSchema.parse({kind:'kb-bank-pdf',fileHash:randomUUID().replaceAll('-','').repeat(2),parserVersion:'kb-raw-v1',metadata:[
    {key:'계좌번호',value:options.account??'000000001234',page:1},
    {key:'조회기간 시작',value:`${month}-01`,page:1},{key:'조회기간 종료',value:`${month}-${end}`,page:1},
    {key:'총 입금금액',value:'3000',page:1},{key:'총 출금금액',value:(BigInt(payment)+500n).toString(),page:1},
  ],rows:raw.map((values,i)=>({sequence:i+1,page:1,sourceRow:i+1,kind:'transaction',cells:bankRawColumns.map((column,c)=>({column,value:values[c],type:values[c]===null?'blank':'text'}))}))});
}
export function cardSource(options:{installment?:string;due?:boolean;adjustment?:boolean;feeBlank?:boolean}={}):FinanceRawDocument {
  const row=(sourceRow:number,kind:string,values:Record<string,string|null>)=>({sequence:sourceRow-3,page:1,sourceRow,kind,cells:cardRawColumns.map(column=>({column,value:values[column]??null,type:values[column]===undefined||values[column]===null?'blank':'text'}))});
  const rows=[row(4,'transaction',{B:'26.01.10',C:'synthetic-card',D:'할부',E:'synthetic store',G:'600',H:options.installment??'1/5',I:'120',J:options.feeBlank?null:'0',K:'480'})];
  if(options.adjustment)rows.push(row(5,'continuation',{G:'-10',J:'-1',F:'synthetic adjustment'}));
  rows.push(row(options.adjustment?6:5,'summary',{B:'synthetic total',I:'120'}));
  return financeRawDocumentSchema.parse({kind:'kb-card-xlsx',fileHash:randomUUID().replaceAll('-','').repeat(2),parserVersion:'kb-raw-v1',metadata:options.due?[{key:'청구월',value:'2026-02',page:1},{key:'결제일',value:'2026-02-10',page:1}]:[],rows});
}
export function readback(document:FinanceRawDocument):FinanceRawReadback {
 const {fileHash:_,...safe}=document;
 return {file:{id:randomUUID(),batchId:randomUUID(),kind:document.kind,parserVersion:document.parserVersion,rowCount:document.rows.length,createdAt:new Date().toISOString()},document:safe};
}
