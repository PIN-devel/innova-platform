import type {QueryClient} from '@tanstack/react-query';
import type {LoaderFunctionArgs} from 'react-router';
import {selectedReviewMonth} from '@/shared/lib/finance-month';
import {requireAccess} from '@/features/auth/route-session';
import {assertSessionVersion} from '@/entities/auth/session-version';
import {reviewQuery} from '@/entities/finance-review/queries';
import {loadRouteQuery} from '@/shared/lib/router-query/route-query';
export const reviewLoader=(client:QueryClient)=>async({request,context}:LoaderFunctionArgs)=>{const {user,epoch}=requireAccess(context,client,request,'exam');await loadRouteQuery(client,reviewQuery(client,user!.id,epoch,selectedReviewMonth(request.url)),request,()=>assertSessionVersion(client,epoch));return null;};
