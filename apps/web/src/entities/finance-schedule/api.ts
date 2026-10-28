import {scheduleViewSchema,type ScheduleCommand} from '@innova/contracts';
import {apiClient} from '@/shared/api/client';
const init=(owner:string,signal?:AbortSignal)=>({signal,cache:'no-store' as const,headers:{'X-Expected-User':owner,'X-Finance-Request':'1'}});
export async function readSchedule(owner:string,month:string,signal?:AbortSignal){return scheduleViewSchema.parse(await apiClient.get(`/finance/business/schedule?month=${encodeURIComponent(month)}`,init(owner,signal)));}
export async function changeSchedule(owner:string,month:string,command:ScheduleCommand,signal?:AbortSignal){return scheduleViewSchema.parse(await apiClient.post(`/finance/business/schedule?month=${encodeURIComponent(month)}`,command,init(owner,signal)));}
