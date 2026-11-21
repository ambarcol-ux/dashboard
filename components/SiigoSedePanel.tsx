'use client';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {toast} from 'sonner';
import {leerCatalogoCuentas} from '@/lib/siigo-cuentas-excel';

type Opt={id:number|string;nombre:string};
type Cat={fv:Opt[];rc:Opt[];cc:Opt[];fc:Opt[];nc:Opt[];ds:Opt[];pagos:Opt[];pagos_rc:Opt[];vendedores:Opt[];grupos:Opt[];cuentas_erp:{id:string;nombre:string}[]};
type P={envio_activo?:boolean;tipo_factura_defecto?:string;vendedor?:number;grupo_inventario?:number;documentos?:Record<string,number>;formas_pago?:Record<string,number>;cuentas?:Record<string,string>;socios?:Record<string,string>;tercero_defecto?:string};
type Doc={id:string;tipo:string;estado:string;numero:string|null;error:string|null;valor:string|null;contrato:string|null;proveedor:string|null;fecha:string};
const TIPO:Record<string,string>={comprobante:'Comprobante interno',factura:'Factura',recibo_caja:'Recibo de caja',anticipo:'Anticipo (depósito)',devolucion_anticipo:'Devolución de depósito',nota_credito:'Nota crédito',correccion_factura:'Corrección de factura',gasto:'Gasto',soporte_gasto:'Doc. soporte gasto',soporte_producto:'Doc. soporte vestidos'};
const cop=(v:unknown)=>`$${Number(v||0).toLocaleString('es-CO')}`;
const call=async(body:Record<string,unknown>)=>{const {data:{session}}=await supabase.auth.getSession();
 const r=await fetch('/api/siigo/admin',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token||''}`},body:JSON.stringify(body)});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Siigo no respondió.');return d;};

/** Configuración › Facturación por sede: Siigo parameters of one store, its switch «Enviar a Siigo», product match, cut-over link and queue. */
export default function SiigoSedePanel({sedeId,sede,configurada}:{sedeId:string;sede:string;configurada:boolean}){
 const [p,setP]=useState<P>({}),[cat,setCat]=useState<Cat|null>(null),[docs,setDocs]=useState<Doc[]>([]),[busy,setBusy]=useState(''),[informe,setInforme]=useState<string>('');
 const load=useCallback(async()=>{
  const [{data:pp},{data:dd}]=await Promise.all([supabase.rpc('siigo_parametros',{p_sede:sedeId}),supabase.rpc('siigo_documentos_listar',{p_sede:sedeId,p_estado:null})]);
  setP((pp||{}) as P);setDocs((dd||[]) as Doc[]);
 },[sedeId]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 const run=async(name:string,f:()=>Promise<void>)=>{setBusy(name);try{await f();}catch(e){toast.error(e instanceof Error?e.message:'Error');}finally{setBusy('');}};
 const traer=()=>run('cat',async()=>setCat(await call({accion:'catalogos',sede_id:sedeId})));
 const guardar=(next:P)=>run('save',async()=>{const {error}=await supabase.rpc('siigo_parametros_guardar',{p_sede:sedeId,p_parametros:next});if(error)throw error;setP(next);toast.success('Parámetros guardados.');});
 const set=(k:keyof P,v:unknown)=>setP(x=>({...x,[k]:v}));
 const setIn=(k:'documentos'|'formas_pago'|'cuentas',key:string,v:string)=>setP(x=>({...x,[k]:{...(x[k]||{}),[key]:k==='cuentas'?v:Number(v)||undefined}}));
 const sel=(label:string,value:unknown,opts:Opt[]|undefined,on:(v:string)=>void)=><label className="text-xs font-bold text-gray-600">{label}
  <select className="mt-1 w-full border rounded-xl p-2 text-sm" value={String(value??'')} onChange={e=>on(e.target.value)}><option value="">—</option>
   {(opts||[]).map(o=><option key={o.id} value={o.id}>{o.nombre}</option>)}{value&&!(opts||[]).some(o=>String(o.id)===String(value))?<option value={String(value)}>{String(value)} (guardado)</option>:null}</select></label>;
 const txt=(label:string,value:unknown,on:(v:string)=>void,ph:string)=><label className="text-xs font-bold text-gray-600">{label}<input className="mt-1 w-full border rounded-xl p-2 text-sm" value={String(value??'')} placeholder={ph} onChange={e=>on(e.target.value)}/></label>;
 const listos=!!(p.documentos?.factura_electronica||p.documentos?.factura_ingreso)&&!!p.documentos?.recibo_caja&&!!p.formas_pago?.credito&&!!p.grupo_inventario&&!!p.cuentas?.anticipo;
 if(!configurada)return <p className="mt-4 text-xs text-gray-500">Guarda las credenciales para configurar el envío a Siigo.</p>;
 return <div className="mt-6 border-t pt-5 space-y-4">
  <div className="flex flex-wrap items-center gap-3 justify-between">
   <h3 className="font-black text-gray-900">Envío automático a Siigo</h3>
   <label className={`flex items-center gap-2 text-sm font-black ${p.envio_activo?'text-emerald-700':'text-gray-500'}`}>
    <input type="checkbox" checked={!!p.envio_activo} disabled={!listos||!!busy} onChange={e=>{if(e.target.checked&&!confirm(`Desde ahora ${sede} trabaja solo en el ERP: cada contrato, abono, depósito y gasto se enviará a Siigo. No sigan digitándolo a mano en Siigo. ¿Activar?`))return;void guardar({...p,envio_activo:e.target.checked});}}/>
    {p.envio_activo?'Enviar a Siigo: ACTIVO':'Enviar a Siigo: apagado'}</label>
  </div>
  {!listos&&<p className="text-xs text-amber-700 font-bold">Para activarlo elige al menos: factura, recibo de caja, forma de pago «crédito», grupo de inventario y cuenta de anticipos.</p>}
  <div className="flex flex-wrap gap-2">
   <button type="button" disabled={!!busy} onClick={()=>void traer()} className="px-4 py-2 rounded-xl border text-sm font-black">{busy==='cat'?'Consultando Siigo…':'Traer opciones desde Siigo'}</button>
   <button type="button" disabled={!!busy} onClick={()=>void run('cruce',async()=>{const r=await call({accion:'cruce',sede_id:sedeId});setInforme(`Cruce de productos: ${r.vestidos} vestidos del ERP · ${r.siigo} productos en Siigo · ✅ ${r.coinciden} coinciden · ⚠️ ${r.total_parecidos} parecidos vinculados${r.parecidos.length?`: ${r.parecidos.slice(0,30).join(', ')}`:''} · ❌ ${r.total_solo_erp} solo en el ERP (se crearán en Siigo al facturarlos)${r.solo_erp.length?`: ${r.solo_erp.slice(0,60).join(', ')}`:''}.`);})} className="px-4 py-2 rounded-xl border text-sm font-black">{busy==='cruce'?'Cruzando (1–2 min)…':'Cruzar vestidos con Siigo'}</button>
   <button type="button" disabled={!!busy} onClick={()=>void run('vincular',async()=>{const r=await call({accion:'vincular',sede_id:sedeId});setInforme(`Facturas hechas a mano: ${r.vinculados.length} contratos vinculados${r.vinculados.length?` (${r.vinculados.slice(0,40).join(', ')})`:''}. No encontradas en Siigo (${r.no_encontrados.length}): ${r.no_encontrados.slice(0,60).join(', ')||'ninguna'}.${r.pendientes?` Quedan ${r.pendientes}: vuelve a pulsar.`:''}`);await load();})} className="px-4 py-2 rounded-xl border text-sm font-black">{busy==='vincular'?'Vinculando…':'Vincular facturas hechas a mano'}</button>
   {/* Siigo does not expose the chart of accounts: each company's export feeds the account search of Cierres de caja › Siigo. */}
   <label className={`px-4 py-2 rounded-xl border text-sm font-black cursor-pointer ${busy?'opacity-50 pointer-events-none':''}`}>{busy==='cuentas'?'Cargando cuentas…':'Cargar catálogo de cuentas (Excel de Siigo)'}
    <input type="file" accept=".xlsx" className="hidden" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;void run('cuentas',async()=>{const {empresa,cuentas}=await leerCatalogoCuentas(f);
     if(!confirm(`Catálogo de ${empresa||'la empresa'} con ${cuentas.length} cuentas. ¿Cargarlo para ${sede}?`))return;
     const {data,error}=await supabase.rpc('siigo_cuentas_cargar',{p_sede:sedeId,p_cuentas:cuentas});if(error)throw error;setInforme(`Catálogo de cuentas de ${sede}: ${data} cuentas cargadas (${empresa}).`);});}}/></label>
   <button type="button" disabled={!!busy||!p.envio_activo} onClick={()=>void run('enviar',async()=>{const r=await call({accion:'enviar',sede_id:sedeId});toast.success(`Enviados ${r.enviados} · esperando ${r.esperando} · con error ${r.errores}`);await load();})} className="px-4 py-2 rounded-xl border text-sm font-black">{busy==='enviar'?'Enviando…':'Enviar cola ahora'}</button>
  </div>
  {informe&&<p className="text-xs bg-slate-50 border rounded-xl p-3 text-gray-700 whitespace-pre-wrap">{informe}</p>}
  {cat&&<div className="space-y-4">
   <div className="grid md:grid-cols-3 gap-3">
    {sel('Factura electrónica',p.documentos?.factura_electronica,cat.fv,v=>setIn('documentos','factura_electronica',v))}
    {sel('Factura de ingreso (no va a la DIAN)',p.documentos?.factura_ingreso,cat.fv,v=>setIn('documentos','factura_ingreso',v))}
    <label className="text-xs font-bold text-gray-600">Factura por defecto<select className="mt-1 w-full border rounded-xl p-2 text-sm" value={p.tipo_factura_defecto||'electronica'} onChange={e=>set('tipo_factura_defecto',e.target.value)}><option value="electronica">Electrónica</option><option value="ingreso">De ingreso</option></select></label>
    {sel('Recibo de caja (abonos y anticipos)',p.documentos?.recibo_caja,cat.rc,v=>setIn('documentos','recibo_caja',v))}
    {sel('Nota crédito',p.documentos?.nota_credito,cat.nc,v=>setIn('documentos','nota_credito',v))}
    {sel('Nota crédito de facturas electrónicas',p.documentos?.nota_credito_electronica,cat.nc,v=>setIn('documentos','nota_credito_electronica',v))}
    {sel('Comprobante devolución de depósitos',p.documentos?.comprobante_devolucion,cat.cc,v=>setIn('documentos','comprobante_devolucion',v))}
    {sel('Comprobante interno (entre sedes y socios)',p.documentos?.comprobante_interno,cat.cc,v=>setIn('documentos','comprobante_interno',v))}
    {sel('Gasto / compra con factura electrónica',p.documentos?.gasto,cat.fc,v=>setIn('documentos','gasto',v))}
    {sel('Documento soporte (cuenta de cobro / vestidos)',p.documentos?.soporte,cat.ds,v=>setIn('documentos','soporte',v))}
    {sel('Vendedor',p.vendedor,cat.vendedores,v=>set('vendedor',Number(v)||undefined))}
    {sel('Grupo de inventario (vestidos nuevos)',p.grupo_inventario,cat.grupos,v=>set('grupo_inventario',Number(v)||undefined))}
   </div>
   <div><p className="text-xs font-black text-gray-700 mb-2">Formas de pago (ERP → Siigo)</p><div className="grid md:grid-cols-3 gap-3">
    {sel('Saldo a crédito (clientes nacionales)',p.formas_pago?.credito,cat.pagos,v=>setIn('formas_pago','credito',v))}
    {sel('Efectivo',p.formas_pago?.efectivo,cat.pagos_rc,v=>setIn('formas_pago','efectivo',v))}
    {sel('Transferencia (por defecto)',p.formas_pago?.transferencia,cat.pagos_rc,v=>setIn('formas_pago','transferencia',v))}
    {cat.cuentas_erp.map(k=><div key={k.id}>{sel(`Cuenta ERP: ${k.nombre}`,p.formas_pago?.[`cuenta:${k.id}`],cat.pagos_rc,v=>setIn('formas_pago',`cuenta:${k.id}`,v))}</div>)}
   </div></div>
   <div><p className="text-xs font-black text-gray-700 mb-2">Cuentas contables (las define la contadora)</p><div className="grid md:grid-cols-3 gap-3">
    {txt('Anticipos de clientes (2805…)',p.cuentas?.anticipo,v=>setIn('cuentas','anticipo',v),'28050501')}
    {txt('Ingreso por daños (retención del depósito)',p.cuentas?.ingreso_danos,v=>setIn('cuentas','ingreso_danos',v),'41700502')}
    {txt('Producto Siigo de la retención (arreglos)',p.cuentas?.producto_danos,v=>setIn('cuentas','producto_danos',v),'ARREGLO1')}
    {txt('Caja (1105…)',p.cuentas?.efectivo,v=>setIn('cuentas','efectivo',v),'11050501')}
    {txt('Banco por defecto (1110…)',p.cuentas?.transferencia,v=>setIn('cuentas','transferencia',v),'11100501')}
    {cat.cuentas_erp.map(k=><div key={k.id}>{txt(`Cuenta contable de ${k.nombre}`,p.cuentas?.[`cuenta:${k.id}`],v=>setIn('cuentas',`cuenta:${k.id}`,v),'1110…')}</div>)}
    {txt('Gastos (cuenta por defecto 51/52…)',p.cuentas?.gasto_defecto,v=>setIn('cuentas','gasto_defecto',v),'51959501')}
    {txt('Pagos a proveedores (costura, lavandería…)',p.cuentas?.['gasto:proveedores'],v=>setIn('cuentas','gasto:proveedores',v),'51…')}
    {txt('Plata entre sedes',p.cuentas?.entre_sedes,v=>setIn('cuentas','entre_sedes',v),'1380…')}
    {txt('Préstamos de socios',p.cuentas?.socios,v=>setIn('cuentas','socios',v),'2355…')}
    {txt('NIT de la empresa (comprobantes internos)',p.tercero_defecto,v=>set('tercero_defecto',v),'900…')}
    <label className="text-xs font-bold text-gray-600 md:col-span-2">Socios (uno por línea: Nombre=cédula)<textarea className="mt-1 w-full border rounded-xl p-2 text-sm" rows={2}
     value={Object.entries(p.socios||{}).map(([k,v])=>`${k}=${v}`).join('\n')} placeholder="Andrés Romero=80031674"
     onChange={e=>set('socios',Object.fromEntries(e.target.value.split('\n').map(l=>l.split('=').map(x=>x.trim())).filter(x=>x[0]&&x[1])))}/></label>
   </div></div>
   <button type="button" disabled={!!busy} onClick={()=>void guardar(p)} className="px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-black">{busy==='save'?'Guardando…':'Guardar parámetros de '+sede}</button>
  </div>}
  <div>
   <p className="text-xs font-black text-gray-700 mb-2">Documentos para Siigo ({docs.length})</p>
   {docs.length===0?<p className="text-xs text-gray-500">Aún no hay documentos.</p>:<div className="max-h-80 overflow-y-auto divide-y border rounded-xl">{docs.map(d=><div key={d.id} className="p-2 text-xs flex flex-wrap gap-2 items-center">
    <span className={`px-2 py-0.5 rounded-full font-black ${d.estado==='enviado'?'bg-emerald-50 text-emerald-700':d.estado==='error'?'bg-rose-50 text-rose-700':d.estado==='anulado'?'bg-gray-100 text-gray-500':'bg-amber-50 text-amber-700'}`}>{d.estado}</span>
    <b>{TIPO[d.tipo]||d.tipo}</b><span>{d.contrato||d.proveedor||''}</span><span>{d.valor?cop(d.valor):''}</span>{d.numero&&<span className="font-bold">{d.numero}</span>}
    <span className="text-gray-400">{new Date(d.fecha).toLocaleDateString('es-CO')}</span>
    {d.error&&<span className="w-full text-rose-700">{d.error}</span>}
    {(d.estado==='error'||d.estado==='pendiente')&&<span className="flex gap-2">{d.estado==='error'&&<button type="button" className="underline font-bold" onClick={()=>void run('a',async()=>{const {error}=await supabase.rpc('siigo_documento_accion',{p_id:d.id,p_accion:'reintentar'});if(error)throw error;await load();})}>Reintentar</button>}
     <button type="button" className="underline text-gray-500" onClick={()=>{if(confirm('¿Anular este documento? No se enviará a Siigo.'))void run('a',async()=>{const {error}=await supabase.rpc('siigo_documento_accion',{p_id:d.id,p_accion:'anular'});if(error)throw error;await load();});}}>Anular</button></span>}
   </div>)}</div>}
  </div>
 </div>;
}
