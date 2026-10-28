import type {FastifyInstance,FastifyRequest} from 'fastify';
import {manualSaveSchema,manualTransactionSchema,transactionDeleteSchema,transactionDeletedSchema,transactionImpactSchema,transactionWorkspaceSchema,financeExportSchema} from '@innova/contracts';
import type {FinanceManualRepository} from '../db/finance-manual.js';
import type {FinanceTransactionRepository} from '../db/finance-transactions.js';
import {AppError,invalidInput} from '../errors.js';
export async function financeTransactionRoutes(app:FastifyInstance,{manual,transactions,exporter,requireAuth,allowedOrigins}:{manual:FinanceManualRepository;transactions:FinanceTransactionRepository;exporter:(owner:string,input:unknown)=>Promise<Uint8Array>;requireAuth:(request:FastifyRequest)=>Promise<void>;allowedOrigins:string[]}){
 app.addHook('onRequest',async(request,reply)=>{
  reply.header('Cache-Control','no-store').header('Vary','Cookie');await requireAuth(request);
  if(request.headers['x-expected-user']!==request.authUser!.id||request.headers['sec-fetch-site']==='cross-site')throw new AppError(403,'FORBIDDEN','Session changed');
  if(request.method!=='GET'&&(!allowedOrigins.includes(String(request.headers.origin))||request.headers['x-finance-request']!=='1'||!request.headers['content-type']?.startsWith('application/json')))throw new AppError(403,'FORBIDDEN','Origin not allowed');
 });
 app.setErrorHandler((error,_request,reply)=>{const safe=error instanceof AppError?error:invalidInput('Transaction request failed');return reply.code(safe.statusCode).send({error:{code:safe.code,message:safe.message}});});
 app.get('/',async request=>transactionWorkspaceSchema.parse(await transactions.read(request.authUser!.id)));
 app.post('/manual',async request=>{const input=manualSaveSchema.safeParse(request.body);if(!input.success)throw invalidInput('Invalid manual transaction');return manualTransactionSchema.parse(await manual.save(request.authUser!.id,input.data));});
 app.get<{Params:{id:string}}>('/:id/impact',async request=>{if(!/^[a-f0-9-]{36}$/i.test(request.params.id))throw new AppError(404,'NOT_FOUND','Transaction unavailable');return transactionImpactSchema.parse(await transactions.impact(request.authUser!.id,request.params.id));});
 app.post('/delete',async request=>{const input=transactionDeleteSchema.safeParse(request.body);if(!input.success)throw invalidInput('Confirm deletion impact');return transactionDeletedSchema.parse(await transactions.remove(request.authUser!.id,input.data));});
 app.get<{Params:{id:string}}>('/:id/deletion',async request=>transactionDeletedSchema.parse(await transactions.deletion(request.authUser!.id,request.params.id)));
 app.post('/export',async(request,reply)=>{const input=financeExportSchema.safeParse(request.body);if(!input.success)throw invalidInput('Choose 1 to 12 consecutive months');const content=await exporter(request.authUser!.id,input.data);await requireAuth(request);return reply.header('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('Content-Disposition',`attachment; filename="motifin-${input.data.from}-${input.data.to}.xlsx"`).header('X-Content-Type-Options','nosniff').send(Buffer.from(content));});
}
