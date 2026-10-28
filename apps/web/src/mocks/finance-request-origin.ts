/** MSW sees the browser Request before the network supplies its Origin header.
 * Real API routes continue requiring Origin; only the local service-worker
 * adapter accepts a same-origin browser referrer when that header is absent. */
export function financeMockOrigin(request:Request){
 const origin=new URL(request.url).origin,header=request.headers.get('origin');
 if(header!==null)return header===origin;
 if(request.headers.get('sec-fetch-site')==='cross-site'||!request.referrer)return false;
 try{return new URL(request.referrer).origin===origin;}catch{return false;}
}
