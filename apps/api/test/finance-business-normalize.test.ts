import assert from 'node:assert/strict';
import {test} from 'node:test';
import {normalizeRaw,adjudicate,sourceMoney,sourceDay} from '../src/finance-business/normalize.js';
import {matchSettlements} from '../src/finance-business/settlements.js';
import {bankSource,cardSource,readback} from './fixtures/finance-raw.js';
const fingerprint=(v:unknown)=>JSON.stringify(v);
test('bank amounts/ordering/opening balance remain exact; transfers and card settlement are not consumption',()=>{
 for(const reverse of [false,true]){
  const raw=readback(bankSource({reverse}));const result=normalizeRaw(raw,fingerprint);
  assert.equal(result.document.state,'accepted');assert.equal(result.document.eventCount,3);
  assert.deepEqual(result.document.totals,{inflow:'3000',outflow:'1500',opening:'1000',closing:'2500',observedPurchases:null,billedPrincipal:null,billedFees:null,billedTotal:null});
  assert.equal(result.document.period.fullCalendarMonth,true);
  assert.deepEqual(new Set(result.events.map(e=>e.cashRole)),new Set(['salary-candidate','card-settlement-candidate','transfer-candidate']));
  assert.ok(result.events.every(e=>e.consumptionAmount===null));assert.equal(result.events[0]!.rawSequence,1);
 }
});
test('bank malformed/unknown source and failed sums/balances never become trusted transactions',()=>{
 const unknown=bankSource({account:'masked***'});assert.equal(normalizeRaw(readback(unknown),fingerprint).document.state,'invalid');
 for(const col of [3,5]){const doc=bankSource();doc.rows[1]!.cells[col]!.value='999';const result=normalizeRaw(readback(doc),fingerprint);assert.equal(result.document.state,'invalid');assert.equal(result.events.length,0);}
 assert.throws(()=>sourceDay('26.02.30'));assert.throws(()=>sourceMoney(null));assert.equal(sourceMoney(null,true),null);assert.equal(sourceMoney('(1,000)'),-1000n);
});
test('bank overlap/reissue/correction is held; distinct same-timestamp rows are retained',()=>{
 const prior=normalizeRaw(readback(bankSource()),fingerprint);
 const overlap=adjudicate(normalizeRaw(readback(bankSource({payment:'1100'})),fingerprint),[prior]);
 assert.equal(overlap.document.state,'needs-review');assert.equal(overlap.document.eventCount,0);assert.ok(overlap.document.reasons.includes('overlapping-document'));
 const other=adjudicate(normalizeRaw(readback(bankSource({month:'2026-03',account:'000000009999'})),fingerprint),[prior]);assert.ok(other.document.reasons.includes('different-bank-account'));
 const doc=bankSource();for(const row of doc.rows)row.cells[0]!.value='2026.01.10 09:00:00';const sameTime=normalizeRaw(readback(doc),fingerprint);assert.equal(sameTime.document.eventCount,3);
});
test('card purchases, charges, fees, later installments and unknown coverage are separate',()=>{
 const first=normalizeRaw(readback(cardSource()),fingerprint);assert.equal(first.document.state,'accepted');
 assert.equal(first.document.totals.observedPurchases,'600');assert.equal(first.document.totals.billedPrincipal,'120');
 assert.equal(first.document.period.coverage,'unknown');assert.equal(first.document.period.fullCalendarMonth,false);assert.equal(first.document.billingMonth,null);assert.equal(first.document.dueDate,null);
 assert.equal(first.events.find(e=>e.kind==='card-purchase')!.occurredOn,'2026-01-10');assert.equal(first.events.find(e=>e.kind==='card-charge')!.occurredOn,null);
 const later=normalizeRaw(readback(cardSource({installment:'2/5'})),fingerprint);assert.equal(later.document.totals.observedPurchases,null);assert.equal(later.events.find(e=>e.kind==='card-purchase')!.status,'needs-review');
 const duplicate=adjudicate(later,[first]);assert.equal(duplicate.document.state,'needs-review');assert.equal(duplicate.document.eventCount,0);
 const moved=cardSource();moved.rows[0]!.cells.find(c=>c.column==='B')!.value='26.02.10';const corrected=adjudicate(normalizeRaw(readback(moved),fingerprint),[first]);assert.equal(corrected.document.state,'needs-review');assert.ok(corrected.document.reasons.includes('possible-duplicate'));
 const unknownFee=normalizeRaw(readback(cardSource({feeBlank:true})),fingerprint);assert.equal(unknownFee.document.totals.billedTotal,null);
});
test('negative helper rows are traceable adjustments; cancellation/date/consumption are never invented',()=>{
 const result=normalizeRaw(readback(cardSource({adjustment:true})),fingerprint);
 const adjustment=result.events.find(e=>e.kind==='card-adjustment')!;
 assert.equal(adjustment.amount,'-10');assert.equal(adjustment.fee,'-1');assert.equal(adjustment.occurredOn,null);assert.deepEqual(adjustment.relatedSequences,[1]);
 assert.equal(result.document.totals.observedPurchases,null);assert.equal(result.document.totals.billedTotal,null);assert.equal(result.events.find(e=>e.kind==='card-purchase')!.consumptionAmount,null);
});
test('settlements need source-provided dates, exact amount, explicit bank signal and unique pairing',()=>{
 const bank=normalizeRaw(readback(bankSource({month:'2026-02',payment:'120'})),fingerprint);
 const card=normalizeRaw(readback(cardSource({due:true})),fingerprint);
 assert.equal(matchSettlements([bank.document,card.document],bank.events)[0]!.state,'matched');
 const unknown=normalizeRaw(readback(cardSource()),fingerprint);assert.equal(matchSettlements([bank.document,unknown.document],bank.events)[0]!.state,'missing-period');
 card.document.totals.billedTotal='121';assert.equal(matchSettlements([bank.document,card.document],bank.events)[0]!.state,'amount-mismatch');
 card.document.totals.billedTotal='120';const copy=structuredClone(card.document);copy.id=crypto.randomUUID();assert.ok(matchSettlements([bank.document,card.document,copy],bank.events).every(m=>m.state==='ambiguous'));
});

test('bank negative direction values or simultaneous positive inflow/outflow stay invalid even when control totals balance',()=>{
 for(const both of [false,true]){const document=bankSource(),put=(row:number,column:string,value:string)=>{document.rows[row]!.cells.find(c=>c.column===column)!.value=value;};
  if(both){put(0,'출금액','1000');put(0,'잔액','3000');put(1,'잔액','2000');put(2,'잔액','1500');document.metadata.find(m=>m.key==='총 출금금액')!.value='2500';}
  else{put(0,'입금액','-3000');put(0,'잔액','-2000');put(1,'잔액','-3000');put(2,'잔액','-3500');document.metadata.find(m=>m.key==='총 입금금액')!.value='-3000';}
  const result=normalizeRaw(readback(document),fingerprint);assert.equal(result.document.state,'invalid');assert.equal(result.events.length,0);
 }
});
