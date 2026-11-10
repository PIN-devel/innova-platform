import type { FastifyInstance, FastifyRequest } from 'fastify';
import { businessDetailSchema, businessListSchema, businessProcessSchema, classificationCommandSchema, classificationViewSchema,reviewMonthSchema,financeReviewSchema,buildFinanceAnalysis,scheduleCommandSchema,scheduleViewSchema } from '@innova/contracts';
import type { FinanceBusinessRepository } from '../db/finance-business.js';
import type {FinanceClassificationRepository} from '../db/finance-classification.js';
import type {FinanceReviewRepository} from '../db/finance-review.js';
import type {FinanceScheduleRepository} from '../db/finance-schedule.js';
import { AppError, invalidInput } from '../errors.js';
export async function financeBusinessRoutes(app:FastifyInstance,{repository,classification,review,schedule,requireAuth,allowedOrigins}:{repository:FinanceBusinessRepository;classification?:FinanceClassificationRepository;review?:FinanceReviewRepository;schedule?:FinanceScheduleRepository;requireAuth:(request:FastifyRequest)=>Promise<void>;allowedOrigins:string[]}) {
  app.addHook('onRequest',async(request,reply)=>{
    reply.header('Cache-Control','no-store');
    await requireAuth(request);
    if(request.headers['x-expected-user']!==request.authUser!.id)throw new AppError(403,'FORBIDDEN','Session changed');
    if(request.headers['sec-fetch-site']==='cross-site')throw new AppError(403,'FORBIDDEN','Origin not allowed');
    if(request.method!=='GET'&&(!allowedOrigins.includes(String(request.headers.origin))||request.headers['x-finance-request']!=='1'||!request.headers['content-type']?.startsWith('application/json')))throw new AppError(403,'FORBIDDEN','Origin not allowed');
  });
  app.setErrorHandler((error,_request,reply)=>{
    const malformed=typeof error==='object'&&error!==null&&'code' in error&&String(error.code).startsWith('FST_ERR_CTP_');
    const safe=error instanceof AppError?error:malformed?invalidInput('Invalid business request'):new AppError(500,'INTERNAL_ERROR','Business operation failed');
    return reply.code(safe.statusCode).send({error:{code:safe.code,message:safe.message}});
  });
  if(schedule){
    app.get<{Querystring:{month?:string}}>('/schedule',async request=>{const month=reviewMonthSchema.safeParse(request.query.month);if(!month.success)throw invalidInput('Invalid schedule month');return scheduleViewSchema.parse(await schedule.read(request.authUser!.id,month.data));});
    app.post<{Querystring:{month?:string}}>('/schedule',async request=>{const month=reviewMonthSchema.safeParse(request.query.month),command=scheduleCommandSchema.safeParse(request.body);if(!month.success||!command.success)throw invalidInput('Invalid schedule request');return scheduleViewSchema.parse(await schedule.change(request.authUser!.id,month.data,command.data));});
  }
  if(review)app.get<{Querystring:{month?:string}}>('/review',async request=>{const parsed=reviewMonthSchema.safeParse(request.query.month);if(!parsed.success)throw invalidInput('Invalid review month');return financeReviewSchema.parse(await review.read(request.authUser!.id,parsed.data));});
  if(classification){
    app.get<{Querystring:{month?:string}}>('/analysis',async request=>{const parsed=reviewMonthSchema.safeParse(request.query.month);if(!parsed.success)throw invalidInput('Invalid analysis month');return buildFinanceAnalysis(parsed.data,await classification.read(request.authUser!.id),new Date().toISOString());});
    app.get('/classification',async request=>classificationViewSchema.parse(await classification.read(request.authUser!.id)));
    app.post('/classification',async request=>{const input=classificationCommandSchema.safeParse(request.body);if(!input.success)throw invalidInput('Invalid classification request');return classificationViewSchema.parse(await classification.change(request.authUser!.id,input.data));});
  }
  app.get('/documents',async request=>businessListSchema.parse(await repository.list(request.authUser!.id)));
  app.get<{Params:{id:string}}>('/documents/:id',async request=>{
    if(!/^[a-f0-9-]{36}$/i.test(request.params.id))throw new AppError(404,'NOT_FOUND','Business document not found');
    const result=await repository.find(request.authUser!.id,request.params.id);
    if(!result)throw new AppError(404,'NOT_FOUND','Business document not found');
    return businessDetailSchema.parse(result);
  });
  app.post('/process',async request=>{
    const input=businessProcessSchema.safeParse(request.body);
    if(!input.success)throw invalidInput('Invalid processing request');
    return businessDetailSchema.parse(await repository.process(request.authUser!.id,input.data.rawFileId));
  });
}
