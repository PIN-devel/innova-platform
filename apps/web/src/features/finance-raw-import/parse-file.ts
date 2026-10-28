import type { FinanceRawDocument } from '@innova/contracts';
export async function parseRawFile(file:File,password:string,signal:AbortSignal,onUnlocked?:()=>void): Promise<FinanceRawDocument> {
  signal.throwIfAborted();
  if(file.size>20_000_000) throw Error('파일이 너무 큽니다. 20MB 이하의 파일을 선택해 주세요.');
  const bytes=await file.arrayBuffer(); signal.throwIfAborted();
  if(String.fromCharCode(...new Uint8Array(bytes,0,Math.min(5,bytes.byteLength)))==='%PDF-'){
    const {parseRawDocument}=await import('./parse-document');
    signal.throwIfAborted();
    const controller=new AbortController(),abort=()=>controller.abort();
    signal.addEventListener('abort',abort,{once:true});
    const timeout=setTimeout(abort,60000);
    try{return await parseRawDocument(bytes,password,controller.signal,onUnlocked);}
    catch(error){if(signal.aborted)throw error;throw Error(error instanceof Error&&error.name==='PasswordException'?'PDF 암호를 확인해 주세요.':'지원 PDF 형식·기간·금액 합계를 확인해 주세요.');}
    finally{clearTimeout(timeout);signal.removeEventListener('abort',abort);}
  }
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./parse-worker.ts',import.meta.url),{type:'module'});
    const finish=()=>{clearTimeout(timeout);worker.terminate();signal.removeEventListener('abort',abort);};
    const abort=()=>{finish();reject(new DOMException('Canceled','AbortError'));};
    const timeout=setTimeout(()=>{finish();reject(Error('처리 시간이 초과됐습니다. 파일을 나눠 다시 시도해 주세요.'));},60000);
    signal.addEventListener('abort',abort,{once:true});
    worker.onmessage=e=>{finish();if(e.data.ok)resolve(e.data.document);else reject(Error(e.data.code==='password'?'PDF 암호를 확인해 주세요.':'지원 형식과 파일의 기간·합계·행 구성을 확인해 주세요.'));};
    worker.onerror=()=>{finish();reject(Error('파일을 읽지 못했습니다. 다시 선택해 주세요.'));};
    worker.postMessage({bytes,password:''},[bytes]);
  });
}
