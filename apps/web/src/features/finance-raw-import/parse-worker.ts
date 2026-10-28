import { parseRawDocument } from './parse-document';
self.onmessage = async (event: MessageEvent<{ bytes:ArrayBuffer; password:string }>) => {
  try { self.postMessage({ok:true,document:await parseRawDocument(event.data.bytes,event.data.password)}); }
  catch(error) { self.postMessage({ok:false,code:error instanceof Error&&error.name==='PasswordException'?'password':'parse'}); }
  finally { event.data.password=''; self.close(); }
};
