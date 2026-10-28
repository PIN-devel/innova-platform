import {transactionWorkspaceSchema,manualTransactionSchema,transactionImpactSchema,transactionDeletedSchema,type ManualSave,type TransactionDelete} from '@innova/contracts';
import {apiClient} from '@/shared/api/client';
const init=(owner:string,signal:AbortSignal)=>({signal,cache:'no-store' as const,headers:{'X-Expected-User':owner,'X-Finance-Request':'1'}});
export const readTransactions=async(owner:string,signal:AbortSignal)=>transactionWorkspaceSchema.parse(await apiClient.get('/finance/transactions/',init(owner,signal)));
export const saveManual=async(owner:string,input:ManualSave,signal:AbortSignal)=>manualTransactionSchema.parse(await apiClient.post('/finance/transactions/manual',input,init(owner,signal)));
export const deletionImpact=async(owner:string,id:string,signal:AbortSignal)=>transactionImpactSchema.parse(await apiClient.get(`/finance/transactions/${id}/impact`,init(owner,signal)));
export const deleteTransaction=async(owner:string,input:TransactionDelete,signal:AbortSignal)=>transactionDeletedSchema.parse(await apiClient.post('/finance/transactions/delete',input,init(owner,signal)));
export const readDeletion=async(owner:string,id:string,signal:AbortSignal)=>transactionDeletedSchema.parse(await apiClient.get(`/finance/transactions/${id}/deletion`,init(owner,signal)));
export const exportTransactions=(owner:string,input:unknown,signal:AbortSignal)=>apiClient.download('/finance/transactions/export',input,init(owner,signal));
