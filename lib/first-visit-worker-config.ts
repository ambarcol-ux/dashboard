import {timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';

export function authorizedVisitWorker(request:Request, env:NodeJS.ProcessEnv=process.env) {
 const secret=env.FIRST_VISIT_WORKER_SECRET;
 const actual=request.headers.get('authorization')||'';
 if(!secret)return false;
 const expected=`Bearer ${secret}`;
 const a=Buffer.from(actual),b=Buffer.from(expected);
 return a.length===b.length&&timingSafeEqual(a,b);
}

export function visitWorkerConfiguration(env:NodeJS.ProcessEnv=process.env) {
 let origin=false;
 try { const url=new URL(env.FIRST_VISIT_PUBLIC_ORIGIN||'');origin=url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash; }catch{}
 let recipients=false;
 try { const values=Object.values(JSON.parse(env.FIRST_VISIT_INTERNAL_RECIPIENTS||'{}'));recipients=values.length>0&&values.every(v=>Array.isArray(v)&&v.length>0&&v.every(x=>typeof x==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))); }catch{}
 const checks={
  base_datos:Boolean(env.NEXT_PUBLIC_SUPABASE_URL&&env.SUPABASE_SERVICE_ROLE_KEY&&env.SUPABASE_SERVICE_ROLE_KEY!=='[SENSITIVE]'),
  whatsapp:Boolean(env.META_WA_TOKEN&&env.META_WA_PHONE_NUMBER_ID),
  version_meta:/^v\d+\.0$/.test(env.META_GRAPH_VERSION||''),
  webhook:Boolean(env.META_APP_SECRET&&env.META_WA_VERIFY_TOKEN),
  origen_publico:origin,
  enlaces_privados:Boolean(env.FIRST_VISIT_LINK_SECRET||(env.SUPABASE_SERVICE_ROLE_KEY&&env.SUPABASE_SERVICE_ROLE_KEY!=='[SENSITIVE]')),
  correo_interno:Boolean(env.RESEND_API_KEY&&env.FIRST_VISIT_EMAIL_FROM&&recipients),
 };
 return {activo:env.FIRST_VISIT_MESSAGES_ENABLED==='true',configuracion:checks,faltantes:Object.keys(checks).filter(k=>!checks[k as keyof typeof checks])};
}
