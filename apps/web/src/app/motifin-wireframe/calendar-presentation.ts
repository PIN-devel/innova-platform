import type { CalendarEdit, CalendarEvent, CashCalendar, CashFlowSnapshot } from "@/entities/cash-flow/model";

/** Synthetic calendar only. No repayment engine, bank sync or repurchase prediction. */
export function createSyntheticCalendar(read: () => CashFlowSnapshot, refresh: () => CashFlowSnapshot, shortfall: boolean) {
  let serial = 0;
  let protectedAmount = 500_000;
  const overrides = new Map<string, CalendarEvent>();
  const stopped = new Map<string, string>();
  const event = (id: string, title: string, day: string, amount: number | null, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, title, date: `2026-10-${day}`, amount, direction: "expense", method: "bank", certainty: "confirmed", repeat: "monthly", note: "사용자가 확인한 합성 일정", status: "planned", ...extra });
  const templates = [
    event("plan-rent", "월세", "05", 700_000),
    event("plan-salary", "급여", "25", 3_200_000, { direction: "income", certainty: "estimate", note: "과거 급여를 참고해 사용자가 확인한 예상액 · 실제 입금 전" }),
    event("plan-utility", "공과금", "18", null, { note: "고지 전 · 금액을 확인하면 예상 계산에 반영해요" }),
    event("plan-bill", "카드대금", "25", 740_000, { repeat: "none", note: "9월 이용 순액 620,000원 + 할부 2/5회 120,000원 · 구독 포함" }),
    event("plan-transfer", "파킹 통장으로 옮기기", "27", 600_000, { direction: "transfer", note: "사용자가 등록한 이체 계획 · 소비가 아니에요" }),
    event("plan-subscription", "카드 구독", "18", 20_000, { method: "card", note: "10월 카드 이용 계획 · 10월 출금에 더하지 않고 이후 납부를 위해 남겨둬요" }),
    event("plan-nutrition", "영양제 정기배송", "22", 45_000, { method: "card", note: "사용자가 신청한 정기배송 · 구매 간격을 추정한 일정이 아니에요" }),
    event("plan-points", "복지포인트 지급", "15", 100_000, { direction: "income", method: "points", note: "현금이 아닌 포인트 · 잔액과 생활비 계산에서 제외해요" }),
  ];
  if (!read().importHistory.length) templates.length = 0;
  if (shortfall) templates.push(event("plan-large", "목돈 납부 계획", "14", 4_000_000, { repeat: "none", note: "급여 전 부족을 검토하기 위한 합성 계획" }));
  function occurrences(monthId: string) {
    return templates.flatMap(template => {
      if (monthId < template.date.slice(0, 7) || template.repeat === "none" && monthId !== template.date.slice(0, 7)) return [];
      const id = `${template.id}@${monthId}`;
      const bill = read().months.at(-1)?.payments.find(p => p.id === "oct-bill");
      const current = template.id === "plan-bill" ? { ...template, amount: bill?.amount ?? null } : template;
      if (stopped.has(template.id) && monthId >= stopped.get(template.id)!) return [];
      const day = Math.min(Number(template.date.slice(8)), new Date(Number(monthId.slice(0, 4)), Number(monthId.slice(5, 7)), 0).getDate());
      return [overrides.get(id) ?? { ...current, id, date: `${monthId}-${String(day).padStart(2, "0")}` }];
    }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }
  function find(id: string) {
    const [base, month] = id.split("@");
    const template = templates.find(item => item.id === base);
    const occurrence = month ? occurrences(month).find(item => item.id === id) : undefined;
    if (!template || !occurrence) throw new Error("일정을 다시 선택해주세요.");
    return { template, occurrence, month: month! };
  }
  function calendar(monthId: string): CashCalendar {
    const snapshot = read();
    const latest = snapshot.months.at(-1)!;
    const lastDay = (id: string) => `${id}-${new Date(Number(id.slice(0, 4)), Number(id.slice(5, 7)), 0).getDate()}`;
    const asOf = lastDay(latest.id);
    const horizon = [...templates.map(t => t.date.slice(0, 7)), "2026-11"].sort().at(-1)!;
    const months = [...snapshot.months.map(m => m.id)];
    const cursor = new Date(`${latest.id}-01T00:00:00Z`);
    while (cursor.toISOString().slice(0, 7) < horizon) {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      months.push(cursor.toISOString().slice(0, 7));
    }
    const historical = monthId <= latest.id;
    const history = snapshot.months.find(m => m.id === monthId);
    const completed: CalendarEvent[] = (history?.transactions ?? []).filter(t => t.source === "bank").map(t => ({ id: t.id, title: t.title, date: t.date, amount: Math.abs(t.amount), direction: t.kind === "income" || t.id.endsWith("transfer-in") ? "income" : t.kind === "transfer" ? "transfer" : "expense", method: "bank", certainty: "confirmed", repeat: "none", note: t.note, status: "matched", transactionId: t.id }));
    const incomplete = !latest.bank || latest.bankCoverage !== "complete" || latest.cardCoverage !== "complete";
    // Start from the last observed balance. Include intervening plans for later months.
    const prior = months.filter(m => m > latest.id && m < monthId).flatMap(occurrences).filter(e => e.status === "planned");
    const active = occurrences(monthId).filter(e => e.status === "planned");
    const cash = (e: CalendarEvent) => e.method === "bank";
    const signed = (e: CalendarEvent) => (e.direction === "income" ? 1 : -1) * (e.amount ?? 0);
    const priorUnknown = prior.some(e => cash(e) && e.amount === null);
    const opening = historical ? history?.bank?.closing ?? null : latest.bank && !priorUnknown ? latest.bank.closing + prior.filter(cash).reduce((n, e) => n + signed(e), 0) : null;
    const unknownCount = active.filter(e => e.method !== "points" && e.amount === null).length;
    const income = active.filter(e => cash(e) && e.direction === "income").reduce((n, e) => n + (e.amount ?? 0), 0);
    const outgoing = active.filter(e => cash(e) && e.direction !== "income").reduce((n, e) => n + (e.amount ?? 0), 0);
    let balance: number | null = incomplete || priorUnknown ? null : opening;
    let lowest = balance === null ? null : { date: `${monthId}-01`, amount: balance };
    const rows: CashCalendar["items"] = [];
    for (const e of occurrences(monthId)) {
      if (e.status === "planned" && cash(e)) {
        if (e.amount === null) balance = null;
        else if (balance !== null) balance += signed(e);
      }
      rows.push({ ...e, balance });
    }
    const dateEndBalances = new Map(rows.map(row => [row.date, row.balance]));
    for (const row of rows) row.balance = dateEndBalances.get(row.date) ?? null;
    // Group by date: intraday processing order is not supplied by the samples.
    for (const row of rows.filter((item, i, all) => i === all.length - 1 || all[i + 1]!.date !== item.date)) {
      if (row.balance !== null && lowest && row.balance < lowest.amount) lowest = { date: row.date, amount: row.balance };
    }
    const newCard = [...prior, ...active].filter(e => e.method === "card").reduce((n, e) => n + (e.amount ?? 0), 0);
    // Remaining instalment principal after September: 480k; October's 120k is in the bill.
    const billOccurrence = [...prior, ...active].find(e => e.id.startsWith("plan-bill@"));
    const futureCardReserve = latest.cardCoverage !== "complete" ? null : 480_000 - (billOccurrence ? 120_000 : 0) + newCard;
    const projected = historical ? history?.bank?.closing ?? null : balance;
    const available = historical || projected === null || futureCardReserve === null || unknownCount || incomplete || priorUnknown ? null : projected - futureCardReserve - protectedAmount;
    const nextIncome = active.find(e => cash(e) && e.direction === "income")?.date ?? null;
    const beforeIncome = active.filter(e => cash(e) && e.direction !== "income" && (!nextIncome || e.date < nextIncome)).reduce((n, e) => n + (e.amount ?? 0), 0);
    const warnings = [];
    if (incomplete) warnings.push("은행·카드 자료가 부족해요");
    if (unknownCount) warnings.push(`금액 미확인 ${unknownCount}건`);
    if (priorUnknown) warnings.push("이전 달 예정 금액이 미확인이에요");
    if (monthId > "2026-10") warnings.push("새 카드 이용·다음 청구액은 아직 확인하지 않았어요");
    return { monthId, months, asOf, historical, opening, income, outgoing, projected, available: monthId > "2026-10" ? null : available, futureCardReserve, protectedAmount, unknownCount, incomplete, warnings, lowest: historical ? null : lowest, nextIncome, beforeIncome, items: historical ? [] : rows, completed };
  }
  return { calendar, actions: {
    saveCalendarEvent(id: string | null, edit: CalendarEdit, scope: "once" | "future") {
      if (!edit.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(edit.date) || Number.isNaN(Date.parse(edit.date)) || new Date(edit.date).toISOString().slice(0, 10) !== edit.date || edit.amount !== null && (!Number.isSafeInteger(edit.amount) || edit.amount < 0)) throw new Error("이름·날짜·0원 이상의 정수 금액을 확인해주세요.");
      if (edit.date.slice(0, 4) > "2030") throw new Error("이 시안에서는 2030년까지의 계획을 등록할 수 있어요.");
      if (edit.date.slice(0, 7) <= read().months.at(-1)!.id) throw new Error("자료 기준일 이후의 계획만 등록할 수 있어요.");
      if (edit.method !== "bank" && edit.direction === "transfer" || edit.method === "card" && edit.direction === "income") throw new Error("이체는 통장, 수입은 통장 또는 포인트로 등록해주세요.");
      if (id?.startsWith("plan-bill@")) throw new Error("청구 자료의 카드대금은 연결된 소비 내역에서 확인해주세요.");
      if (id) {
        const { template, occurrence, month } = find(id);
        if (edit.date.slice(0, 7) !== month) throw new Error("이번 회차는 같은 달 안에서 날짜를 바꿔주세요.");
        if (scope === "future" && template.repeat === "monthly") {
          stopped.set(template.id, month);
          templates.push({ ...occurrence, ...edit, id: `manual-${++serial}`, title: edit.title.trim(), status: "planned" });
        } else overrides.set(id, { ...occurrence, ...edit, repeat: occurrence.repeat, title: edit.title.trim() });
      } else templates.push({ ...edit, title: edit.title.trim(), id: `manual-${++serial}`, status: "planned" });
      return refresh();
    },
    changeCalendarEvent(id: string, change: "skip" | "resume" | "end") {
      if (id.startsWith("plan-bill@")) throw new Error("확인된 카드 청구는 일정 삭제로 없앨 수 없어요.");
      const { template, occurrence, month } = find(id);
      if (change === "end") stopped.set(template.id, month);
      else overrides.set(id, { ...occurrence, status: change === "skip" ? "skipped" : "planned" });
      return refresh();
    },
    setProtectedAmount(amount: number) {
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("남겨둘 금액은 0원 이상의 정수로 입력해주세요.");
      protectedAmount = amount;
      return refresh();
    },
  } };
}
