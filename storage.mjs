import {empty,apply,validate} from './core.mjs';
export async function openDb(name){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(name,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('store');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
export function access(db,key,update){
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction('store',update?'readwrite':'readonly'),store=transaction.objectStore('store'),request=store.get(key);
    let result,error;
    request.onsuccess=()=>{
      try{result=update?update(request.result):request.result;if(update)store.put(result,key)}
      catch(e){error=e;transaction.abort()}
    };
    transaction.oncomplete=()=>resolve(result);
    transaction.onabort=()=>reject(error||transaction.error||Error('تعذر حفظ البيانات'));
  });
}
export const initialize=db=>access(db,'data',old=>old||empty());
export const localAction=(db,type,payload)=>access(db,'data',s=>apply(s,type,payload));
export async function api(path,token,body){
  let response;
  try{response=await fetch('./api/'+path,{method:body===undefined?'GET':'POST',cache:'no-store',signal:AbortSignal.timeout(7000),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)})}
  catch{throw Object.assign(Error('لا يوجد اتصال بخادم المحل. البيانات المعروضة للقراءة فقط.'),{offline:true})}
  const data=await response.json().catch(()=>({error:'استجابة خادم غير صالحة'}));
  if(!response.ok)throw Object.assign(Error(data.error||'تعذر تنفيذ العملية'),{status:response.status});
  return data;
}
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('');
export async function backup(s){
  const data=JSON.stringify(validate(s));
  return JSON.stringify({format:'abu-ali-store',version:1,created:new Date().toISOString(),sha256:await digest(data),data});
}
export async function unpack(text){
  const env=JSON.parse(text);
  if(env.format!=='abu-ali-store'||env.version!==1||typeof env.data!=='string'||await digest(env.data)!==env.sha256)throw Error('النسخة الاحتياطية تالفة أو إصدارها غير مدعوم');
  return validate(JSON.parse(env.data));
}
export const save=(name,data,mime='application/json')=>{
  const url=URL.createObjectURL(new Blob([data],{type:mime}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
};
