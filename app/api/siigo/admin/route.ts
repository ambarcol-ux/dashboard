import {createClient} from '@supabase/supabase-js';
import {publicServerClient,publicReply,UUID_RE} from '@/lib/public-db';
import {siigo,siigoAll,SiigoError,type SiigoCred,type Params} from '@/lib/siigo';
import {processSiigoQueue} from '@/lib/siigo';
export const dynamic='force-dynamic';
export const maxDuration=60;
type Value=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const norm=(v:unknown)=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

/** Configuración › Facturación por sede (administration only):
 *  «catalogos» → the store's Siigo lists to choose its parameters (document types, payment methods, sellers, inventory groups).
 *  «cruce» → matches the store's dresses with its Siigo products and saves the links (rental = code, sale = code + V).
 *  «vincular» → cut-over: links the open contracts whose invoice was made by hand in Siigo, so their next payments go as receipts.
 *  «enviar» → sends the queue now. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return publicReply({error:'Inicia sesión.'},401);
 const body=await request.json().catch(()=>({})) as {accion?:string;sede_id?:string};
 if(!UUID_RE.test(String(body.sede_id||'')))return publicReply({error:'Sede no válida.'},400);
 const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
 const {error:denied}=await userDb.rpc('siigo_parametros',{p_sede:body.sede_id});
 if(denied)return publicReply({error:'Solo administración.'},403);
 const db=publicServerClient();
 const {data:all}=await db.rpc('siigo_credenciales_activas_servidor');
 const raw=((all||[]) as SiigoCred[]).find(c=>c.sede_id===body.sede_id);
 if(!raw)return publicReply({error:'Guarda primero las credenciales de Siigo de esta sede.'},400);
 const c:SiigoCred={...raw,parametros:(raw.parametros||{}) as Params};
 try{
  if(body.accion==='catalogos'){
   const get=(p:string)=>siigo(c,p).catch(()=>[]);
   const [fv,rc,cc,fc,nc,ds,pagos,pagosRc,usuarios,grupos]=await Promise.all([get('/v1/document-types?type=FV'),get('/v1/document-types?type=RC'),get('/v1/document-types?type=CC'),
    get('/v1/document-types?type=FC'),get('/v1/document-types?type=NC'),get('/v1/document-types?type=DS'),get('/v1/payment-types?document_type=FV'),get('/v1/payment-types?document_type=RC'),
    get('/v1/users'),get('/v1/account-groups')]);
   const docs=(x:unknown)=>((Array.isArray(x)?x:[]) as Value[]).filter(d=>d.active!==false).map(d=>({id:d.id,nombre:`${d.name}${d.description&&d.description!==d.name?` · ${d.description}`:''} (${d.type}-${d.code})`,electronica:String(d.electronic_type||'').startsWith('Electronic')}));
   const pays=(x:unknown)=>((Array.isArray(x)?x:[]) as Value[]).filter(d=>d.active!==false).map(d=>({id:d.id,nombre:d.name,tipo:d.type,vence:!!d.due_date}));
   const {data:cuentas}=await db.from('cuentas_dinero').select('id,nombre,sede_id,activo').eq('activo',true).then(r=>r,()=>({data:[]}));
   return publicReply({fv:docs(fv),rc:docs(rc),cc:docs(cc),fc:docs(fc),nc:docs(nc),ds:docs(ds),pagos:pays(pagos),pagos_rc:pays(pagosRc),
    vendedores:(((usuarios as Value).results||[]) as Value[]).map(u=>({id:u.id,nombre:`${u.first_name||''} ${u.last_name||''}`.trim()||u.username})),
    grupos:((Array.isArray(grupos)?grupos:[]) as Value[]).map(g=>({id:g.id,nombre:g.name})),
    cuentas_erp:((cuentas||[]) as Value[]).filter(k=>!k.sede_id||k.sede_id===c.sede_id).map(k=>({id:k.id,nombre:k.nombre}))});
  }
  if(body.accion==='cruce'){
   const productos=await siigoAll(c,'/v1/products');
   const byCode=new Map(productos.map(p=>[String(p.code||'').toUpperCase(),p])),byNorm=new Map(productos.map(p=>[norm(p.code),p]));
   const {data:vs}=await db.from('vestidos').select('id,codigo,nombre').eq('sede_actual_id',c.sede_id).eq('archivado',false);
   const r={coinciden:0,parecidos:[] as string[],solo_erp:[] as string[],siigo:productos.length,vestidos:(vs||[]).length};
   for(const v of (vs||[]) as Value[]){
    const code=String(v.codigo||'').trim().toUpperCase();
    let alq=byCode.get(code),ven=byCode.get(`${code}V`),parecido=false;
    if(!alq){const p=byNorm.get(norm(code));if(p&&!/V$/.test(norm(p.code))){alq=p;parecido=true;}}
    if(!ven){const p=byNorm.get(`${norm(code)}V`);if(p){ven=p;parecido=true;}}
    if(!alq&&!ven){r.solo_erp.push(code);continue;}
    await db.rpc('siigo_producto_vincular_servidor',{p_sede:c.sede_id,p_vestido:v.id,p_alquiler:alq?.code||null,p_venta:ven?.code||null,p_origen:parecido?'cruce-parecido':'cruce'});
    if(parecido)r.parecidos.push(`${code} → ${[alq?.code,ven?.code].filter(Boolean).join(' / ')}`);else r.coinciden++;
   }
   return publicReply({...r,parecidos:r.parecidos.slice(0,200),solo_erp:r.solo_erp.slice(0,300),total_parecidos:r.parecidos.length,total_solo_erp:r.solo_erp.length});
  }
  if(body.accion==='vincular'){
   const {data:ks}=await db.from('contratos').select('id,numero_contrato,numero_factura,estado').eq('sede_id',c.sede_id).not('numero_factura','is',null);
   const {data:ya}=await db.from('siigo_documentos').select('contrato_id').eq('tipo','factura').neq('estado','anulado').eq('sede_id',c.sede_id);
   const tiene=new Set(((ya||[]) as Value[]).map(x=>x.contrato_id));
   const abiertos=((ks||[]) as Value[]).filter(k=>!tiene.has(k.id)&&!['finalizado','cancelado','cancelada','anulado','anulada'].includes(String(k.estado||'').toLowerCase())&&!/siigo/i.test(k.numero_factura));
   const r={vinculados:[] as string[],no_encontrados:[] as string[]};
   for(const k of abiertos.slice(0,150)){
    const n=String(k.numero_factura).replace(/\D/g,'');if(!n){r.no_encontrados.push(`${k.numero_contrato} (factura «${k.numero_factura}»)`);continue;}
    let inv:Value|null=null;
    for(const name of [`FV-2-${n}`,`FV-1-${n}`]){const d=await siigo(c,`/v1/invoices?name=${name}`).catch(()=>({results:[]}));const hit=((d.results||[]) as Value[]).find(x=>x.name===name);if(hit){inv=hit;break;}}
    if(!inv){r.no_encontrados.push(`${k.numero_contrato} (factura «${k.numero_factura}»)`);continue;}
    await db.rpc('siigo_vincular_factura_servidor',{p_contrato:k.id,p_siigo_id:inv.id,p_numero:inv.name,p_respuesta:inv});
    r.vinculados.push(`${k.numero_contrato} → ${inv.name}`);
   }
   return publicReply({...r,pendientes:Math.max(0,abiertos.length-150)});
  }
  if(body.accion==='enviar')return publicReply(await processSiigoQueue(db));
  return publicReply({error:'Acción no válida.'},400);
 }catch(e){return publicReply({error:e instanceof SiigoError||e instanceof Error?e.message:'Siigo no respondió.'},502);}
}
