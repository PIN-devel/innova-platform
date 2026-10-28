const listeners=new Set<()=>void>();
const channelName='innova-pdf-password-change-v1';
export function subscribePdfPasswordChange(cancel:()=>void){listeners.add(cancel);const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel(channelName);if(channel)channel.onmessage=event=>{if(event.data?.type==='changed')cancel();};return ()=>{listeners.delete(cancel);channel?.close();};}
export function notifyPdfPasswordChange(){for(const cancel of listeners)cancel();if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel(channelName);channel.postMessage({type:'changed'});channel.close();}}
