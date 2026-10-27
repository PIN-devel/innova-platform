import type { BusinessDocument, BusinessEvent, BusinessList } from '@innova/contracts';
export function matchSettlements(documents: BusinessDocument[], events: BusinessEvent[]): BusinessList['settlements'] {
  const bank = events.filter(e => e.kind === 'bank-cash' && e.cashRole === 'card-settlement-candidate' && e.status === 'confirmed');
  const result: BusinessList['settlements'] = [];
  for (const card of documents.filter(d=>d.kind==='kb-card-xlsx' && d.state==='accepted')) {
    if (!card.dueDate || !card.billingMonth) { result.push({cardDocumentId:card.id,state:'missing-period',bankEventIds:[],bankDocumentIds:[]}); continue; }
    if (card.totals.billedTotal === null) { result.push({cardDocumentId:card.id,state:'unknown-total',bankEventIds:[],bankDocumentIds:[]}); continue; }
    const sameDay = bank.filter(e => e.occurredOn === card.dueDate);
    const sameAmount = sameDay.filter(e => e.outflow === card.totals.billedTotal);
    result.push({cardDocumentId:card.id,state:sameAmount.length===1?'matched':sameAmount.length>1?'ambiguous':sameDay.length?'amount-mismatch':'unmatched',bankEventIds:(sameAmount.length?sameAmount:sameDay).map(e=>e.id),bankDocumentIds:[]});
  }
  // One bank withdrawal must not pay two independent statement documents.
  for (const item of result) if (item.state==='matched' && result.filter(other=>other.bankEventIds.includes(item.bankEventIds[0]!)).length>1) item.state='ambiguous';
  for(const item of result)item.bankDocumentIds=[...new Set(item.bankEventIds.flatMap(id=>{const event=bank.find(e=>e.id===id);const doc=documents.find(d=>d.kind==='kb-bank-pdf'&&d.rawFileId===event?.rawFileId);return doc?[doc.id]:[];}))];
  return result;
}
