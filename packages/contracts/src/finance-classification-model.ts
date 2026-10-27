import type {BusinessDetail} from './finance-business.js';
import {classificationEditSchema,classificationStateSchema,classificationViewSchema,type ClassificationCommand,type ClassificationEdit,type ClassificationState,type ClassificationView} from './finance-classification.js';
export const emptyClassification=():ClassificationState=>({categories:[{id:'unclassified',name:'미분류'}],edits:[]});
const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function combineAllocations(parts:ClassificationEdit['allocations']){const merged=new Map<string,bigint>();for(const p of parts)merged.set(p.categoryId,(merged.get(p.categoryId)??0n)+BigInt(p.amount));const nonzero=[...merged].filter(([,amount])=>amount!==0n);return (nonzero.length?nonzero:[...merged].slice(0,1)).map(([categoryId,amount])=>({categoryId,amount:amount.toString()}));}
export function classificationView(state:ClassificationState,details:BusinessDetail[],revision=0,updatedAt:string|null=null,history:ClassificationView['history']=[]):ClassificationView {
 const transactions:ClassificationView['transactions']=[];
 for(const {document,events} of details){if(document.state!=='accepted'||document.kind!=='kb-card-xlsx')continue;
  for(const event of events){if(!['card-purchase','card-fee','card-adjustment'].includes(event.kind))continue;
   const basisDate=event.occurredOn??events.find(p=>p.kind==='card-purchase'&&(p.rawSequence===event.rawSequence||event.relatedSequences.includes(p.rawSequence)))?.occurredOn??null;
   const eligible=event.amount!==null&&basisDate!==null&&event.reason!=='unknown-purchase'&&(event.kind!=='card-adjustment'||BigInt(event.amount)<0n);
   const edit=structuredClone(state.edits.find(e=>e.eventId===event.id));
   const known=event.kind==='card-purchase'&&event.consumptionAmount!==null;
   const knownAmount=event.kind==='card-fee'?event.amount:event.consumptionAmount;
   const automatic=known?{eventId:event.id,description:(event.description||'카드 거래').slice(0,200),occurredOn:basisDate!,amount:knownAmount!,note:'',allocations:[{categoryId:'unclassified',amount:knownAmount!}],confirmed:false,refundOf:null}:null;
   transactions.push({event,basisDate,documentId:document.id,sourceReview:details.some(d=>d.document.state==='needs-review'&&d.document.candidateDocumentIds.includes(document.id)),eligible,effective:edit??automatic,userEdited:!!edit});
  }
 }
 // An unedited full refund reverses the original category shares. A partial
 // refund has unknown purpose until explicitly allocated by its owner.
 for(const t of transactions){const e=t.effective;if(!e?.refundOf)continue;const purchase=transactions.find(p=>p.event.id===e.refundOf)?.effective;if(purchase&&BigInt(e.amount)===-BigInt(purchase.amount)&&e.allocations.every(a=>a.categoryId==='unclassified'))e.allocations=purchase.allocations.map(a=>({...a,amount:(-BigInt(a.amount)).toString()}));}
 const sums=new Map<string,{amount:bigint;ids:Set<string>}>();let total=0n,count=0,excluded=0;
 for(const t of transactions){if(!t.effective){excluded++;continue;}count++;total+=BigInt(t.effective.amount);for(const a of t.effective.allocations){const entry=sums.get(a.categoryId)??{amount:0n,ids:new Set<string>()};entry.amount+=BigInt(a.amount);entry.ids.add(t.event.id);sums.set(a.categoryId,entry);}}
 return classificationViewSchema.parse({revision,updatedAt,categories:state.categories,transactions,history,summary:{total:total.toString(),transactionCount:count,excludedCount:excluded,allocations:[...sums].map(([categoryId,v])=>({categoryId,amount:v.amount.toString(),transactionCount:v.ids.size}))}});
}
export function applyClassification(input:ClassificationState,details:BusinessDetail[],command:ClassificationCommand,restore?:ClassificationState):ClassificationState {
 const state=structuredClone(input),change=command.change,view=classificationView(state,details);
 const category=(id:string)=>{const c=state.categories.find(c=>c.id===id);if(!c)throw Error('Unknown category');return c;};
 if(change.type==='category-add'){if(state.categories.some(c=>c.id===change.id||c.name===change.name))throw Error('Duplicate category');state.categories.push({id:change.id,name:change.name});}
 else if(change.type==='category-rename'){category(change.id);if(state.categories.some(c=>c.id!==change.id&&c.name===change.name))throw Error('Duplicate category');category(change.id).name=change.name;}
 else if(change.type==='category-move'){category(change.id);category(change.targetId);if(change.id===change.targetId)throw Error('Same category');for(const e of state.edits)e.allocations=combineAllocations(e.allocations.map(a=>({...a,categoryId:a.categoryId===change.id?change.targetId:a.categoryId})));state.categories=state.categories.filter(c=>c.id!==change.id);}
 else {
  const id=change.type==='edit'?change.edit.eventId:change.eventId,target=view.transactions.find(t=>t.event.id===id);
  if(!target)throw Error('Transaction unavailable');
  let edit:ClassificationEdit|undefined;
  if(change.type==='edit')edit=structuredClone(change.edit);
  if(change.type==='restore'){if(!restore)throw Error('History unavailable');edit=structuredClone(restore.edits.find(e=>e.eventId===id));if(edit)edit.allocations=combineAllocations(edit.allocations.map(a=>({...a,categoryId:state.categories.some(c=>c.id===a.categoryId)?a.categoryId:'unclassified'})));}
  state.edits=state.edits.filter(e=>e.eventId!==id);
  if(edit){if(!target.eligible)throw Error('Unconfirmed source');if(!validDate(edit.occurredOn)||edit.occurredOn.slice(0,7)!==target.basisDate!.slice(0,7))throw Error('Date must stay in source month');
   const amount=BigInt(edit.amount),source=BigInt(target.event.amount!);if(source<0n?amount>0n:amount<0n)throw Error('Invalid amount sign');
   if(!target.effective&&!edit.confirmed)throw Error('Source confirmation required');
   edit.allocations=combineAllocations(edit.allocations);let sum=0n;for(const a of edit.allocations){category(a.categoryId);const part=BigInt(a.amount);if(amount<0n?part>0n:part<0n)throw Error('Invalid allocation sign');sum+=part;}if(sum!==amount)throw Error('Allocation sum differs');
   if(amount<0n){if(!edit.refundOf)throw Error('Refund requires original purchase');}else if(edit.refundOf)throw Error('Only refunds may link a purchase');
   state.edits.push(classificationEditSchema.parse(edit));
  }
 }
 const result=classificationStateSchema.parse(state),next=classificationView(result,details);
 for(const t of next.transactions){const e=t.effective;if(!e||BigInt(e.amount)>=0n)continue;const original=next.transactions.find(p=>p.event.id===e.refundOf);if(!original?.effective||original.event.kind!=='card-purchase'||BigInt(original.effective.amount)<=0n)throw Error('Refund purchase unavailable');const refunded=next.transactions.filter(p=>p.effective?.refundOf===e.refundOf).reduce((s,p)=>s-BigInt(p.effective!.amount),0n);if(refunded>BigInt(original.effective.amount))throw Error('Refund exceeds purchase');}
 return result;
}
