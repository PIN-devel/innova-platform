import {financeMockOrigin} from './finance-request-origin.ts';
import {createFinanceBusinessHandlers} from './finance-business-handlers.ts';
import {createFinancePdfPasswordHandlers} from './finance-pdf-password-handlers.ts';
import {http,HttpResponse} from 'msw';
import {financeRawImportSchema,type AuthUser,type FinanceRawDocument,type FinanceRawFile} from '@innova/contracts';
export function createFinanceRawHandlers(current:()=>AuthUser|null,verifyAccountPassword:(password:string)=>boolean=()=>false){
 const passwords=createFinancePdfPasswordHandlers(current,verifyAccountPassword);
 const files=new Map<string,{owner:string;doc:FinanceRawDocument;file:FinanceRawFile}>();
 const headers={'Cache-Control':'no-store'};
 const error=(status:number,code:string,message:string)=>HttpResponse.json({error:{code,message}},{status,headers});
 const access=(request:Request)=>{const user=current();if(!user)return error(401,'UNAUTHORIZED','Authentication required');if(user.approvalStatus!=='approved')return error(403,user.approvalStatus==='rejected'?'SIGNUP_REJECTED':'APPROVAL_PENDING','Approval required');if(request.headers.get('x-expected-user')!==user.id)return error(403,'FORBIDDEN','Session changed');if(request.method!=='GET'&&(!financeMockOrigin(request)||request.headers.get('x-finance-request')!=='1'))return error(403,'FORBIDDEN','Origin not allowed');return null;};
 return [
  ...passwords.handlers,
  ...createFinanceBusinessHandlers(current,(owner,id)=>{const found=files.get(id);if(!found||found.owner!==owner)return undefined;const {fileHash:_,...document}=found.doc;return {file:found.file,document};}),
  http.get('*/api/finance/raw/files',({request})=>{const denied=access(request);if(denied)return denied;return HttpResponse.json({files:[...files.values()].filter(f=>f.owner===current()!.id).map(f=>f.file)},{headers});}),
  http.get('*/api/finance/raw/files/:id',({request,params})=>{const denied=access(request);if(denied)return denied;const found=files.get(String(params.id));if(!found||found.owner!==current()!.id)return error(404,'NOT_FOUND','Raw file not found');const {fileHash:_,...document}=found.doc;return HttpResponse.json({file:found.file,document},{headers});}),
  http.post('*/api/finance/raw/imports',async({request})=>{const denied=access(request);if(denied)return denied;let body;try{body=await request.json();}catch{return error(400,'INVALID_INPUT','Invalid Raw document');}const changed=access(request);if(changed)return changed;const parsed=financeRawImportSchema.safeParse(body);if(!parsed.success)return error(400,'INVALID_INPUT','Invalid Raw document');const owner=current()!.id,doc=parsed.data.document;if(parsed.data.pdfPasswordRevision!==undefined&&!passwords.leaseValid(owner,parsed.data.pdfPasswordRevision,parsed.data.pdfPasswordAttemptId!))return error(409,'CONFLICT','PDF password changed');
   const old=[...files.values()].find(f=>f.owner===owner&&f.doc.kind===doc.kind&&f.doc.fileHash===doc.fileHash);if(old){if(JSON.stringify(old.doc)!==JSON.stringify(doc))return error(409,'CONFLICT','Document extraction differs; review required');return HttpResponse.json({file:old.file,duplicate:true},{headers});}
   const file:FinanceRawFile={id:crypto.randomUUID(),batchId:parsed.data.batchId,kind:doc.kind,parserVersion:doc.parserVersion,rowCount:doc.rows.length,createdAt:new Date().toISOString()};files.set(file.id,{owner,doc,file});return HttpResponse.json({file,duplicate:false},{headers});
  }),
 ];
}
