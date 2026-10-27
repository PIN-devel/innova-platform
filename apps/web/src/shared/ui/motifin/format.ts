export const financeMoney=(value:string|null)=>value===null?'확인 불가':`${BigInt(value).toLocaleString('ko-KR')}원`;
/** Ratios for decorative geometry only; all visible financial values remain exact integers. */
export function visualRatio(value:string,total:string){const a=BigInt(value),b=BigInt(total);return b<=0n||a<=0n?0:Number((a>b?b:a)*10000n/b)/100;}
