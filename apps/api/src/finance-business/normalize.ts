import { randomUUID } from 'node:crypto';
import { businessDetailSchema } from '@innova/contracts';
import type { BusinessDetail, BusinessDocument, BusinessEvent, BusinessReason, FinanceRawReadback } from '@innova/contracts';

export type Projection = BusinessDetail & { scopeKeys: string[] };
export type PriorProjection = { document: BusinessDocument; scopeKeys: string[] };
const compact = (value: string | null) => (value ?? '').replace(/\s+/g, '');
const value = (row: FinanceRawReadback['document']['rows'][number], column: string) => row.cells.find(c => c.column === column)?.value ?? null;
const emptyTotals = () => ({ inflow: null, outflow: null, opening: null, closing: null, observedPurchases: null, billedPrincipal: null, billedFees: null, billedTotal: null });
const unique = <T>(values: T[]) => [...new Set(values)];
export function sourceMoney(value: string | null, optional = false): bigint | null {
  if (value === null || compact(value) === '') { if (optional) return null; throw Error('invalid-source'); }
  let text = compact(value).replaceAll(',', '').replace(/원$/, '');
  text = text.replace(/^\((\d+)\)$/, '-$1');
  if (!/^-?\d{1,25}$/.test(text)) throw Error('invalid-source');
  return BigInt(text);
}
export function sourceDay(value: string | null): string {
  const match = compact(value).match(/^(\d{2}|\d{4})[./-](\d{2})[./-](\d{2})\.?$/);
  if (!match) throw Error('invalid-source');
  const year = match[1]!.length === 2 ? `20${match[1]}` : match[1]!;
  const day = `${year}-${match[2]}-${match[3]}`;
  const date = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== day) throw Error('invalid-source');
  return day;
}
const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0,10);
const meta = (raw: FinanceRawReadback, name: string) => raw.document.metadata.find(m => compact(m.key) === compact(name))?.value ?? null;
function base(raw: FinanceRawReadback): Projection {
  return { scopeKeys: [], document: {
    id: randomUUID(), rawFileId: raw.file.id, kind: raw.document.kind, currency: 'KRW', scale: 0, state: 'accepted', processorVersion: 'kb-business-v1',
    createdAt: new Date().toISOString(), eventCount: 0, proposedEventCount: 0, reasons: [], candidateDocumentIds: [],
    period: { start: null, end: null, fullCalendarMonth: false, coverage: 'unknown' },
    billingMonth: null, dueDate: null, totals: emptyTotals(),
  }, events: [] };
}
function event(raw: FinanceRawReadback, sequence: number, kind: BusinessEvent['kind']): BusinessEvent {
  return { id: randomUUID(), rawFileId: raw.file.id, rawSequence: sequence, sourcePage: raw.document.rows[sequence-1]!.page, sourceRow: raw.document.rows[sequence-1]!.sourceRow, relatedSequences: [], kind,
    status: 'observed', reason: null, occurredOn: null, occurredAt: null, amount: null, consumptionAmount: null,
    fee: null, inflow: null, outflow: null, balance: null, remaining: null, installment: null,
    description: '', counterparty: null, cashRole: null };
}
function bank(raw: FinanceRawReadback, fingerprint: (value: unknown) => string, result: Projection) {
  const account = compact(meta(raw, '계좌번호')).replaceAll('-', '');
  if (!/^\d{8,20}$/.test(account)) throw Error('missing-source-identity');
  result.scopeKeys = [fingerprint(['bank-account', account])];
  const start = sourceDay(meta(raw, '조회기간 시작')), end = sourceDay(meta(raw, '조회기간 종료'));
  if (start > end) throw Error('bank-check-failed');
  result.document.period = { start, end, coverage: 'reported-period', fullCalendarMonth: start.endsWith('-01') && start.slice(0,7) === end.slice(0,7) && nextDay(end).endsWith('-01') };
  for (const row of raw.document.rows) {
    if (row.kind !== 'transaction') throw Error('invalid-source');
    const dateTime = compact(value(row, '거래일시')).match(/^(\d{4}\.\d{2}\.\d{2})(\d{2}):(\d{2}):(\d{2})$/);
    if (!dateTime || Number(dateTime[2]) > 23 || Number(dateTime[3]) > 59 || Number(dateTime[4]) > 59) throw Error('invalid-source');
    const day = sourceDay(dateTime[1]!);
    if (day < start || day > end) throw Error('bank-check-failed');
    const inflow = sourceMoney(value(row, '입금액'))!, outflow = sourceMoney(value(row, '출금액'))!, balance = sourceMoney(value(row, '잔액'))!;
    if(inflow<0n||outflow<0n||inflow>0n&&outflow>0n)throw Error('invalid-source');
    const item = event(raw, row.sequence, 'bank-cash');
    item.status = 'confirmed'; item.occurredOn = day; item.occurredAt = `${day}T${dateTime[2]}:${dateTime[3]}:${dateTime[4]}`;
    item.amount = (inflow - outflow).toString(); item.inflow = inflow.toString(); item.outflow = outflow.toString(); item.balance = balance.toString();
    item.description = [value(row, '적요'), value(row, '송금메모')].filter(Boolean).join(' · ');
    item.counterparty = value(row, '보낸분/받는분');
    const text = compact(item.description + (item.counterparty ?? ''));
    item.cashRole = inflow > 0n && outflow === 0n && /급여|월급/.test(text) ? 'salary-candidate'
      : outflow > 0n && /KB국민카드|국민카드|KB카드/.test(text) ? 'card-settlement-candidate'
      : /이체|송금/.test(text) ? 'transfer-candidate' : 'unclassified';
    // A bank outflow is cash movement. Consumption is deliberately unknown.
    result.events.push(item);
  }
  const sum = (field: 'inflow' | 'outflow') => result.events.reduce((total,e) => total + BigInt(e[field]!),0n);
  if (sum('inflow') !== sourceMoney(meta(raw,'총 입금금액')) || sum('outflow') !== sourceMoney(meta(raw,'총 출금금액'))) throw Error('bank-check-failed');
  const chronological = [result.events, [...result.events].reverse()].find(events => events.every((e,i) => i === 0 || (events[i-1]!.occurredAt! <= e.occurredAt! && BigInt(events[i-1]!.balance!) + BigInt(e.amount!) === BigInt(e.balance!))));
  if (!chronological?.length) throw Error('bank-check-failed');
  result.document.totals = { ...emptyTotals(), inflow: sum('inflow').toString(), outflow: sum('outflow').toString(),
    opening: (BigInt(chronological[0]!.balance!) - BigInt(chronological[0]!.amount!)).toString(), closing: chronological.at(-1)!.balance };
}
function card(raw: FinanceRawReadback, fingerprint: (value: unknown) => string, result: Projection) {
  // A printed card label is not proof of a globally stable account identifier.
  result.scopeKeys = [fingerprint(['kb-pay-statement-scope'])];
  result.document.reasons.push('statement-only');
  const bill = meta(raw, '청구월');
  if (bill && /^\d{4}[-.]\d{2}$/.test(compact(bill))) { const month = compact(bill).replace('.','-'); sourceDay(`${month}-01`); result.document.billingMonth = month; }
  const due = meta(raw, '결제일');
  if (due) result.document.dueDate = sourceDay(due);
  const seen = new Set<string>(), dates: string[] = [];
  let parent: { purchase: BusinessEvent; charge: BusinessEvent } | null = null;
  let principal = 0n, fees = 0n, feesKnown = true;
  const summaries: bigint[] = [];
  for (const row of raw.document.rows) {
    if (row.kind === 'header' || row.kind === 'blank') continue;
    if (row.kind === 'summary') { const control = sourceMoney(value(row,'I'),true); if (control !== null) summaries.push(control); parent = null; continue; }
    if (row.kind === 'continuation') {
      if (!parent) throw Error('invalid-source');
      const purchaseDelta = sourceMoney(value(row,'G'),true), feeDelta = sourceMoney(value(row,'J'),true);
      const adjustment = event(raw,row.sequence,'card-adjustment');
      adjustment.status = 'needs-review'; adjustment.reason = 'unresolved-adjustment';
      adjustment.amount = purchaseDelta?.toString() ?? null; adjustment.fee = feeDelta?.toString() ?? null;
      adjustment.description = [value(row,'D'),value(row,'E'),value(row,'F')].filter(Boolean).join(' · ');
      adjustment.relatedSequences = [parent.purchase.rawSequence];
      parent.purchase.relatedSequences.push(row.sequence); parent.charge.relatedSequences.push(row.sequence);
      parent.purchase.status = 'needs-review'; parent.purchase.reason = 'unresolved-adjustment'; parent.purchase.consumptionAmount = null;
      result.document.reasons.push('unresolved-adjustment');
      if (feeDelta !== null) { fees += feeDelta; feesKnown = false; }
      result.events.push(adjustment); continue;
    }
    if (row.kind !== 'transaction') throw Error('invalid-source');
    const day = sourceDay(value(row,'B')), amount = sourceMoney(value(row,'G'))!, billed = sourceMoney(value(row,'I'))!;
    if (!value(row,'C')) throw Error('missing-source-identity');
    dates.push(day); principal += billed;
    const ratio = compact(value(row,'H'));
    const match = ratio ? ratio.match(/^(\d+)\/(\d+)$/) : null;
    if (ratio && !match) throw Error('invalid-source');
    const installment = match ? { number: Number(match[1]), total: Number(match[2]) } : null;
    if (installment && (installment.number < 1 || installment.total > 1000 || installment.number > installment.total)) throw Error('invalid-source');
    const key = fingerprint([day,compact(value(row,'C')),compact(value(row,'E')),compact(value(row,'F')),amount.toString()]);
    if (seen.has(key)) { result.document.state = 'needs-review'; result.document.reasons.push('possible-duplicate'); }
    seen.add(key);
    result.scopeKeys.push('candidate:'+fingerprint([compact(value(row,'C')),compact(value(row,'E')),compact(value(row,'F')),amount.toString()]));
    const purchase = event(raw,row.sequence,'card-purchase');
    purchase.occurredOn = day; purchase.amount = amount.toString(); purchase.installment = installment;
    purchase.description = [value(row,'E'),value(row,'F')].filter(Boolean).join(' · '); purchase.counterparty = value(row,'C');
    purchase.status = installment && installment.number > 1 ? 'needs-review' : 'observed';
    purchase.reason = installment && installment.number > 1 ? 'unknown-purchase' : null;
    purchase.consumptionAmount = purchase.reason ? null : amount.toString();
    if (amount < 0n || /취소|환불/.test(value(row,'D') ?? '')) { purchase.status = 'needs-review'; purchase.reason = 'unlinked-refund'; purchase.consumptionAmount = null; }
    if (purchase.reason) result.document.reasons.push(purchase.reason);
    const charge = event(raw,row.sequence,'card-charge');
    charge.amount = billed.toString(); charge.installment = installment; charge.remaining = sourceMoney(value(row,'K'),true)?.toString() ?? null;
    charge.description = purchase.description; charge.counterparty = purchase.counterparty;
    // Purchase date is not a charge/payment date.
    const fee = sourceMoney(value(row,'J'),true);
    charge.fee = fee?.toString() ?? null;
    if (fee === null) { feesKnown = false; result.document.reasons.push('missing-fee'); }
    else { fees += fee; if (fee !== 0n) { const item = event(raw,row.sequence,'card-fee'); item.amount = fee.toString(); item.description = purchase.description; result.events.push(item); } }
    result.events.push(purchase,charge); parent = { purchase,charge };
  }
  if (!dates.length || (summaries.length && !summaries.includes(principal))) throw Error('invalid-source');
  dates.sort(); result.document.period.start = dates[0]!; result.document.period.end = dates.at(-1)!;
  const purchases = result.events.filter(e=>e.kind==='card-purchase');
  result.document.totals.observedPurchases = purchases.some(e=>e.consumptionAmount===null) ? null : purchases.reduce((sum,e)=>sum+BigInt(e.consumptionAmount!),0n).toString();
  result.document.totals.billedPrincipal = principal.toString();
  result.document.totals.billedFees = feesKnown ? fees.toString() : null;
  result.document.totals.billedTotal = feesKnown ? (principal + fees).toString() : null;
  if (!result.document.dueDate || !result.document.billingMonth) result.document.reasons.push('missing-period');
}
export function normalizeRaw(raw: FinanceRawReadback, fingerprint: (value: unknown) => string): Projection {
  const result = base(raw);
  try { if (raw.document.kind === 'kb-bank-pdf') bank(raw,fingerprint,result); else card(raw,fingerprint,result); }
  catch (error) {
    const reason: BusinessReason = error instanceof Error && ['bank-check-failed','missing-source-identity'].includes(error.message) ? error.message as BusinessReason : 'invalid-source';
    result.document.state = 'invalid'; result.document.reasons = [reason]; result.events = [];
    result.document.totals = emptyTotals(); result.document.period.fullCalendarMonth = false;
  }
  result.document.reasons = unique(result.document.reasons);
  result.document.proposedEventCount = result.events.length;
  result.document.eventCount = result.document.state === 'accepted' ? result.events.length : 0;
  if (!businessDetailSchema.safeParse(result).success) { result.document.state='invalid'; result.document.reasons=['invalid-source']; result.events=[]; result.document.eventCount=0; result.document.totals=emptyTotals(); result.document.period.fullCalendarMonth=false; }
  return result;
}
export function adjudicate(projection: Projection, prior: PriorProjection[]): Projection {
  const doc = projection.document;
  if (doc.state === 'invalid') return projection;
  const hold = (reason: BusinessReason, candidate: BusinessDocument) => {
    doc.state = 'needs-review'; doc.reasons = unique([...doc.reasons,reason]); doc.candidateDocumentIds = unique([...doc.candidateDocumentIds,candidate.id]);
  };
  for (const other of prior) {
    const candidate = other.document;
    if (candidate.state === 'invalid' || candidate.rawFileId === doc.rawFileId || candidate.kind !== doc.kind) continue;
    const sameScope = projection.scopeKeys.some(key => !key.startsWith('candidate:') && other.scopeKeys.includes(key));
    if (!sameScope) { if (doc.kind === 'kb-bank-pdf' && candidate.state === 'accepted') hold('different-bank-account',candidate); continue; }
    if (doc.period.start && doc.period.end && candidate.period.start && candidate.period.end && doc.period.start <= candidate.period.end && candidate.period.start <= doc.period.end) hold('overlapping-document',candidate);
    if (doc.kind === 'kb-bank-pdf' && candidate.state === 'accepted') {
      if (candidate.period.end && doc.period.start === nextDay(candidate.period.end) && candidate.totals.closing !== doc.totals.opening) hold('bank-check-failed',candidate);
      if (doc.period.end && candidate.period.start === nextDay(doc.period.end) && doc.totals.closing !== candidate.totals.opening) hold('bank-check-failed',candidate);
    }
    if (doc.kind === 'kb-card-xlsx' && projection.scopeKeys.some(key=>key.startsWith('candidate:')&&other.scopeKeys.includes(key))) hold('possible-duplicate',candidate);
    if (doc.kind === 'kb-card-xlsx' && doc.dueDate && candidate.dueDate === doc.dueDate) hold('possible-duplicate',candidate);
  }
  doc.eventCount = doc.state === 'accepted' ? projection.events.length : 0;
  return projection;
}
