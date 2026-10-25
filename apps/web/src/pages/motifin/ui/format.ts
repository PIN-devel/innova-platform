const number = new Intl.NumberFormat("ko-KR");
export function money(amount: number | null) {
  return amount === null ? "확인 불가" : `${number.format(amount)}원`;
}
const compactNumber = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 });
export function compactMoney(amount: number | null) {
  if (amount === null) return "확인 불가";
  return Math.abs(amount) < 10_000 ? money(amount) : `${compactNumber.format(amount / 10_000)}만원`;
}
