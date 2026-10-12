import {supabase} from './supabase';
/** Sends the customer emails a staff change queued. A failure leaves them queued for the worker. */
export async function notifyVisitChange(id:string){
 try{
  const {data}=await supabase.auth.getSession();
  const r=await fetch('/api/primeras-citas/correos',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token||''}`},body:JSON.stringify({id})});
  const d=await r.json();return r.ok?Number(d.enviados)||0:0;
 }catch{return 0;}
}
