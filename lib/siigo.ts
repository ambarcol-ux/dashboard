import type {SupabaseClient} from '@supabase/supabase-js';

/** Siigo API per store (credentials in Configuración › Facturación por sede). The ERP is the only place where people work: this module
 *  turns each queued ERP document (public.siigo_documentos) into its Siigo document. Rental = the dress code (service), sale = code + V
 *  (product), as each store's Siigo already has them; a missing product or customer is created first. */
type Value=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type SiigoCred={sede_id:string;sede:string;usuario_api:string;access_key:string;partner_id:string;parametros:Params};
export type Params={envio_activo?:boolean;tipo_factura_defecto?:'electronica'|'ingreso';vendedor?:number;grupo_inventario?:number;
 documentos?:{factura_electronica?:number;factura_ingreso?:number;recibo_caja?:number;nota_credito?:number;nota_credito_electronica?:number;comprobante_devolucion?:number;comprobante_interno?:number;gasto?:number;compra?:number;soporte?:number};
 formas_pago?:Record<string,number>;cuentas?:Record<string,string>;ciudad?:{state_code:string;city_code:string};
 /** Partner name → cédula (loans) and the store's own NIT for internal journals. */
 socios?:Record<string,string>;tercero_defecto?:string};
const API='https://api.siigo.com';
const CITY:Record<string,{state_code:string;city_code:string}>={villavicencio:{state_code:'50',city_code:'50001'},'bogotá':{state_code:'11',city_code:'11001'},bogota:{state_code:'11',city_code:'11001'},
 pereira:{state_code:'66',city_code:'66001'},barranquilla:{state_code:'08',city_code:'08001'}};
const tokens=new Map<string,{token:string;at:number}>();

export class SiigoError extends Error{constructor(msg:string,public status=0,public body:unknown=null){super(msg);}}
const errorText=(d:Value)=>{const e=(d?.Errors||d?.errors||[]) as Value[];return e.length?e.map(x=>[x.Code,x.Message,x.Params?.join?.(', ')].filter(Boolean).join(': ')).join(' · '):String(d?.Message||d?.message||'')};

export async function siigoToken(c:SiigoCred){
 const hit=tokens.get(c.sede_id);if(hit&&Date.now()-hit.at<20*3600000)return hit.token;
 const r=await fetch(`${API}/auth`,{method:'POST',headers:{'Content-Type':'application/json','Partner-Id':c.partner_id},body:JSON.stringify({username:c.usuario_api,access_key:c.access_key}),signal:AbortSignal.timeout(20000)});
 const d=await r.json().catch(()=>({})) as Value;
 if(!r.ok||!d.access_token)throw new SiigoError(`Siigo no aceptó las credenciales de ${c.sede}: ${errorText(d)||r.status}`,r.status,d);
 tokens.set(c.sede_id,{token:d.access_token,at:Date.now()});return String(d.access_token);
}
export async function siigo(c:SiigoCred,path:string,init:{method?:string;body?:unknown}={}){
 const r=await fetch(`${API}${path}`,{method:init.method||'GET',headers:{'Content-Type':'application/json','Partner-Id':c.partner_id,Authorization:`Bearer ${await siigoToken(c)}`},
  body:init.body===undefined?undefined:JSON.stringify(init.body),signal:AbortSignal.timeout(40000)});
 if(r.status===401)tokens.delete(c.sede_id);
 const d=await r.json().catch(()=>({})) as Value;
 if(!r.ok)throw new SiigoError(errorText(d)||`Siigo respondió ${r.status}`,r.status,d);
 return d;
}
/** All pages of a Siigo list (products: ~3.000 per store). */
export async function siigoAll(c:SiigoCred,path:string,max=60){
 const out:Value[]=[];
 for(let page=1;page<=max;page++){const d=await siigo(c,`${path}${path.includes('?')?'&':'?'}page_size=100&page=${page}`);const rows=(d.results||[]) as Value[];out.push(...rows);if(rows.length<100)break;}
 return out;
}

const hoy=()=>new Date(Date.now()-5*3600000).toISOString().slice(0,10);
const fecha=(v:unknown)=>/^\d{4}-\d{2}-\d{2}/.test(String(v||''))?String(v).slice(0,10):hoy();
const ID_TYPE=(t:string)=>/nit/i.test(t)?'31':/c[eé]dula de extranjer|^ce$/i.test(t)?'22':/tarjeta|^ti$/i.test(t)?'12':/pasaporte|^pp$/i.test(t)?'41':'13';
const name2=(full:string)=>{const p=full.trim().split(/\s+/);return p.length>2?[p.slice(0,p.length-2).join(' '),p.slice(-2).join(' ')]:p.length===2?p:[p[0]||'Cliente','.'];};

/** Customer (or supplier) by identification; created when missing. */
async function ensureThird(c:SiigoCred,t:{documento:string;nombre:string;tipo_documento?:string;email?:string|null;telefono?:string|null;direccion?:string|null},type:'Customer'|'Supplier'){
 const id=String(t.documento||'').replace(/\D/g,'');
 if(id.length<5)throw new SiigoError('Falta la cédula o NIT del tercero.');
 const found=await siigo(c,`/v1/customers?identification=${id}`);
 if((found.results||[]).length)return id;
 const company=ID_TYPE(t.tipo_documento||'')==='31';
 const city=c.parametros.ciudad||CITY[c.sede.toLowerCase()]||CITY.villavicencio;
 const [first,last]=name2(t.nombre||'Cliente');
 await siigo(c,'/v1/customers',{method:'POST',body:{type,person_type:company?'Company':'Person',id_type:ID_TYPE(t.tipo_documento||''),identification:id,
  name:company?[t.nombre||'Proveedor']:[first,last],address:{address:(t.direccion||'Sin dirección').slice(0,100),city:{country_code:'Co',...city}},
  ...(t.telefono?{phones:[{number:String(t.telefono).replace(/\D/g,'').slice(-10)}]}:{}),
  contacts:[{first_name:company?(t.nombre||'Proveedor').slice(0,50):first,last_name:company?'.':last,...(t.email?{email:t.email}:{})}]}});
 return id;
}

/** Product of a dress: rental = code (service), sale = code + V (product with stock). Uses the saved link, else the code, else creates it. */
async function ensureProduct(c:SiigoCred,db:SupabaseClient,v:Value,venta:boolean){
 const linked=venta?v.venta:v.alquiler,code=String(linked||`${String(v.codigo).trim()}${venta?'V':''}`).toUpperCase();
 const found=await siigo(c,`/v1/products?code=${encodeURIComponent(code)}`);
 if(!(found.results||[]).length){
  if(!c.parametros.grupo_inventario)throw new SiigoError('Falta elegir el grupo de inventario de Siigo en Facturación por sede.');
  await siigo(c,'/v1/products',{method:'POST',body:{code,name:`${code} ${String(v.nombre||'').toUpperCase()}${v.talla?` T.${v.talla}`:''}`.slice(0,100),account_group:c.parametros.grupo_inventario,
   type:venta?'Product':'Service',stock_control:venta,tax_classification:'Excluded',prices:[{currency_code:'COP',price_list:[{position:1,value:Number(v.precio)||0}]}]}});
 }
 if(!linked)await db.rpc('siigo_producto_vincular_servidor',{p_sede:c.sede_id,p_vestido:v.id,p_alquiler:venta?null:code,p_venta:venta?code:null,p_origen:'factura'});
 return code;
}

// Siigo product of a contract concept for this store: the one linked in Configuración, or one created here (code ERP###) and linked.
async function ensureConcepto(c:SiigoCred,db:SupabaseClient,cp:Value){
 const map=(cp.siigo_productos||{}) as Record<string,string>;if(map[c.sede_id])return map[c.sede_id];
 const code=`ERP${String(cp.codigo).padStart(3,'0')}`;
 const found=await siigo(c,`/v1/products?code=${encodeURIComponent(code)}`);
 if(!(found.results||[]).length){
  if(!c.parametros.grupo_inventario)throw new SiigoError('Falta elegir el grupo de inventario de Siigo en Facturación por sede.');
  await siigo(c,'/v1/products',{method:'POST',body:{code,name:String(cp.nombre).toUpperCase().slice(0,100),account_group:c.parametros.grupo_inventario,type:'Service',stock_control:false,tax_classification:'Excluded'}});
 }
 const {data:act}=await db.from('conceptos_contrato').select('siigo_productos').eq('id',cp.id).maybeSingle();
 await db.from('conceptos_contrato').update({siigo_productos:{...((act?.siigo_productos||{}) as Record<string,string>),[c.sede_id]:code},updated_at:new Date().toISOString()}).eq('id',cp.id);
 return code;
}

const formaPago=(c:SiigoCred,medio:string,cuenta:string|null)=>{
 const f=c.parametros.formas_pago||{};
 const id=(cuenta&&f[`cuenta:${cuenta}`])||(/efectivo/i.test(medio)?f.efectivo:f.transferencia)||f.transferencia||f.efectivo;
 if(!id)throw new SiigoError('Falta emparejar las formas de pago con Siigo en Facturación por sede.');
 return id;
};
const cuentaCaja=(c:SiigoCred,medio:string,cuenta:string|null)=>{
 const k=c.parametros.cuentas||{};const code=(cuenta&&k[`cuenta:${cuenta}`])||(/efectivo/i.test(medio)?k.efectivo:k.transferencia);
 if(!code)throw new SiigoError('Falta la cuenta contable de caja/banco en Facturación por sede.');return code;
};
const doc=(c:SiigoCred,k:keyof NonNullable<Params['documentos']>,label:string)=>{const id=c.parametros.documentos?.[k];if(!id)throw new SiigoError(`Falta elegir el tipo de documento «${label}» en Facturación por sede.`);return {id};};
/** «FV-2-756» → prefix FV-2, consecutive 756. */
const split=(name:string)=>{const m=/^(.*)-(\d+)$/.exec(String(name||''));return m?{prefix:m[1],consecutive:Number(m[2])}:null;};

export type Job={id:string;sede_id:string;tipo:string;datos:Value;intentos:number;contrato_id:string|null;cliente:Value|null;contrato:Value|null;factura:Value|null;cuenta_id:string|null};
export type Sent={siigoId:string|null;numero:string|null;respuesta:Value;esperar?:boolean;mensaje?:string};

/** Builds and sends one queued document. Returns what Siigo answered (or «esperar» when its invoice is not in Siigo yet). */
export async function sendJob(db:SupabaseClient,c:SiigoCred,j:Job):Promise<Sent>{
 const d=j.datos,obs=d.numero_contrato?`Contrato ${d.numero_contrato} · ERP Ámbar`:'ERP Ámbar';
 const noEfectivo=!/efectivo/i.test(String(d.medio||''));
 // Deposits do not go through the cash register: a deposit received or returned by transfer uses the deposits account («solo depósitos»)
 // when the store has it set up in Facturación por sede (Pereira has none: its own bank).
 if((j.tipo==='anticipo'||j.tipo==='devolucion_anticipo')&&!j.cuenta_id&&noEfectivo){
  const {data:dep}=await db.from('cuentas_dinero').select('id').eq('solo_depositos',true).eq('activo',true).or(`sede_id.is.null,sede_id.eq.${c.sede_id}`).limit(1).maybeSingle();
  if(dep?.id&&c.parametros.formas_pago?.[`cuenta:${dep.id}`])j={...j,cuenta_id:String(dep.id)};
 }
 // A contract payment that did not come in cash waits until it is passed to Cierres de caja, where its account (bank) is chosen: that
 // account decides the Siigo payment method. After two days it goes with the store's default bank.
 if(j.tipo==='recibo_caja'&&!j.cuenta_id&&noEfectivo&&fecha(d.fecha)>=new Date(Date.now()-5*3600000-2*86400000).toISOString().slice(0,10))
  return {siigoId:null,numero:null,respuesta:{},esperar:true,mensaje:'Esperando que se pase a Cierres de caja con su cuenta (banco).'};
 if(j.tipo==='factura'&&d.venta){
  const cli=(d.cliente||{}) as Value,v=(d.vestido||{}) as Value,total=Number(d.total);
  const id=cli.documento?await ensureThird(c,cli as never,'Customer'):'222222222222';
  const electronica=d.tipo_factura!=='ingreso';
  const r=await siigo(c,'/v1/invoices',{method:'POST',body:{document:doc(c,electronica?'factura_electronica':'factura_ingreso',electronica?'Factura electrónica':'Factura de ingreso'),
   date:fecha(d.fecha),customer:{identification:id,branch_office:0},...(c.parametros.vendedor?{seller:c.parametros.vendedor}:{}),observations:`Venta de vestido${d.numero_venta?` n.º ${d.numero_venta}`:''} · ERP Ámbar`,
   items:[{code:await ensureProduct(c,db,v,true),description:`${v.codigo} ${v.nombre||''}${v.talla?` talla ${v.talla}`:''} · venta`.slice(0,500),quantity:1,price:total}],
   payments:[{id:formaPago(c,String(d.medio||''),d.cuenta_id||j.cuenta_id),value:total,due_date:fecha(d.fecha)}],...(electronica?{stamp:{send:true}}:{}),mail:{send:!!cli.email}}});
  return {siigoId:r.id||null,numero:r.name||String(r.number||''),respuesta:{...r,total}};
 }
 if(j.tipo==='factura'){
  const k=j.contrato!,cli=j.cliente!,venta=d.tipo_venta==='venta';
  // A draft with no money is not invoiced yet (it may expire): the invoice goes when it is signed or receives its first payment.
  const {data:est}=await db.from('contratos').select('estado,anticipo,tipo_evento,created_at').eq('id',j.contrato_id).maybeSingle();
  if(est&&String(est.estado||'').toLowerCase()==='borrador'&&!(Number(est.anticipo)>0))return {siigoId:null,numero:null,respuesta:{},esperar:true,mensaje:'Esperando la firma o el primer abono del contrato.'};
  // The contract's concepts are saved right after the contract: a contract just created waits a moment so its invoice includes them.
  if(est?.created_at&&Date.now()-Date.parse(String(est.created_at))<120000)return {siigoId:null,numero:null,respuesta:{},esperar:true,mensaje:'Esperando que se guarden los conceptos del contrato.'};
  const id=await ensureThird(c,cli as never,'Customer');
  const vs=(k.vestidos||[]) as Value[];
  // Concepts of the contract (Pre XV, laundry, bows…): one line each with its Siigo product; the dresses take the rest of the value.
  const {data:lin}=await db.from('contrato_conceptos').select('descripcion,cantidad,valor_unitario,concepto:conceptos_contrato(id,codigo,nombre,siigo_productos)').eq('contrato_id',j.contrato_id).order('created_at');
  const conceptos=((lin||[]) as Value[]).filter(x=>Number(x.valor_unitario)*Number(x.cantidad)>0);
  const extras=conceptos.reduce((t,x)=>t+Number(x.valor_unitario)*Number(x.cantidad),0);
  const base=Math.max(0,Number(k.valor_total)-Number(k.descuento)-extras);
  if(!vs.length&&!conceptos.length)throw new SiigoError('El contrato no tiene vestidos con código de inventario.');
  const items:Value[]=[];let resto=base;const uso=String(est?.tipo_evento||'')==='PreXV'?'Alquiler Pre XV':'Alquiler';
  if(base>0||!conceptos.length)for(const [i,v] of vs.entries()){const precio=i===vs.length-1?resto:Math.floor(base/vs.length);resto-=precio;
   items.push({code:await ensureProduct(c,db,v,venta),description:`${uso} · ${v.codigo} ${v.nombre||''}${v.talla?` talla ${v.talla}`:''} · contrato ${k.numero}`.slice(0,500),quantity:1,price:precio});}
  for(const x of conceptos){const cp=x.concepto as Value;
   items.push({code:await ensureConcepto(c,db,cp),description:`${cp.nombre}${x.descripcion?` · ${x.descripcion}`:''} · contrato ${k.numero}`.slice(0,500),quantity:Number(x.cantidad),price:Number(x.valor_unitario)});}
  if(Number(k.total_arreglos)>0)items.push({code:items[0].code,description:`Arreglos contrato ${k.numero}`,quantity:1,price:Number(k.total_arreglos)});
  // Contract edited to a higher value after it was invoiced: an additional invoice only for the difference (private.siigo_ajuste_contrato).
  if(d.adicional)items.splice(0,items.length,{code:items[0].code,description:`Mayor valor del contrato ${k.numero} (ajuste)`,quantity:1,price:Number(d.valor)});
  const total=items.reduce((s,x)=>s+Number(x.price),0);
  // The store may have invoiced the same sale by hand in Siigo: an invoice of this customer in the last 3 days with the same total is
  // linked instead of creating a duplicate (its payments are then already in Siigo).
  const desde=new Date(Date.now()-3*86400000).toISOString().slice(0,10);
  const previa=((await siigo(c,`/v1/invoices?created_start=${desde}&page_size=100`).catch(()=>({results:[]}))).results||[] as Value[])
   .find((x:Value)=>String((x.customer as Value)?.identification||'')===String(id)&&Math.abs(Number(x.total)-total)<=1000&&!/ERP Ámbar/.test(String(x.observations||'')));
  if(previa&&!d.adicional)return {siigoId:String(previa.id),numero:String(previa.name),respuesta:{...previa,total,hecha_en_siigo:true}};
  const credito=c.parametros.formas_pago?.credito;if(!credito)throw new SiigoError('Falta la forma de pago «crédito / clientes nacionales» en Facturación por sede.');
  const electronica=d.tipo_factura!=='ingreso';
  // The invoice shows what the customer already paid (as the stores did by hand): each payment registered in the ERP whose receipt was
  // not sent yet goes as a payment line (cash, bank…), and only the rest goes on credit. Those receipts are then not sent again.
  const {data:pg}=await db.from('pagos').select('id,valor_pagado,medio_pago,fecha_pago').eq('contrato_id',j.contrato_id).is('anulado_at',null).order('fecha_pago');
  const {data:rcs}=await db.from('siigo_documentos').select('origen_id,estado').eq('contrato_id',j.contrato_id).eq('tipo','recibo_caja');
  const enviados=new Set(((rcs||[]) as Value[]).filter(x=>x.estado==='enviado').map(x=>String(x.origen_id)));
  const abonos:{id:string;valor:number;forma:number}[]=[];let pagado=0;
  for(const p of (d.adicional?[]:pg||[]) as Value[]){if(enviados.has(String(p.id)))continue;const v=Math.min(Number(p.valor_pagado)||0,total-pagado);if(v<=0)break;
   const {data:mov}=await db.from('caja_movimientos').select('cuenta_id').eq('origen','pago').eq('origen_id',p.id).is('anulado_at',null).limit(1).maybeSingle();
   abonos.push({id:String(p.id),valor:v,forma:formaPago(c,String(p.medio_pago||''),(mov?.cuenta_id as string|null)||null)});pagado+=v;}
  const porCobrar=Math.round((total-pagado)*100)/100;
  const payments=[...abonos.map(a=>({id:a.forma,value:a.valor,due_date:fecha(d.fecha)})),...(porCobrar>0?[{id:credito,value:porCobrar,due_date:fecha(k.fecha_evento&&String(k.fecha_evento)>hoy()?k.fecha_evento:hoy())}]:[])];
  const r=await siigo(c,'/v1/invoices',{method:'POST',body:{document:doc(c,electronica?'factura_electronica':'factura_ingreso',electronica?'Factura electrónica':'Factura de ingreso'),
   date:fecha(d.fecha),customer:{identification:id,branch_office:0},...(c.parametros.vendedor?{seller:c.parametros.vendedor}:{}),observations:obs,items,payments,
   ...(electronica?{stamp:{send:true}}:{}),mail:{send:!!cli.email}}});
  if(abonos.length)await db.from('siigo_documentos').update({estado:'enviado',siigo_numero:`Incluido en ${r.name||'la factura'}`,error:null,updated_at:new Date().toISOString()})
   .eq('tipo','recibo_caja').eq('origen','pago').in('origen_id',abonos.map(a=>a.id)).neq('estado','enviado');
  return {siigoId:r.id||null,numero:r.name||String(r.number||''),respuesta:{...r,total,abonos_incluidos:abonos.map(a=>a.id)}};
 }
 if(j.tipo==='recibo_caja'){
  const f=j.factura;if(!f||f.estado!=='enviado'||!f.numero)return {siigoId:null,numero:null,respuesta:{},esperar:true,mensaje:'Esperando que la factura llegue a Siigo.'};
  // A payment made on or before the date of an invoice the store made by hand in Siigo is already in that invoice.
  if((f.respuesta as Value|null)?.hecha_en_siigo&&fecha(d.fecha)<=fecha((f.respuesta as Value).date))return {siigoId:null,numero:`Incluido en ${f.numero}`,respuesta:{omitido:true}};
  const due=split(f.numero);if(!due)throw new SiigoError(`No se reconoce el número de factura ${f.numero}.`);
  const idCli=String((j.cliente||{}).documento||'').replace(/\D/g,'')||String((f.respuesta?.customer as Value)?.identification||'');
  const valor=Number(d.valor),medio=String(d.medio||'');
  const r=await siigo(c,'/v1/vouchers',{method:'POST',body:{document:doc(c,'recibo_caja','Recibo de caja'),date:fecha(d.fecha),type:'DebtPayment',customer:{identification:idCli,branch_office:0},
   items:[{due:{...due,quote:1,date:fecha(f.respuesta?.date||f.datos?.fecha)},value:valor}],payment:{id:formaPago(c,medio,j.cuenta_id),value:valor},observations:`Abono ${obs}${d.recibo?` · recibo ${d.recibo}`:''}`}});
  return {siigoId:r.id||null,numero:r.name||null,respuesta:r};
 }
 if(j.tipo==='anticipo'){
  const id=await ensureThird(c,(j.cliente||d.cliente) as never,'Customer'),valor=Number(d.valor);
  const r=await siigo(c,'/v1/vouchers',{method:'POST',body:{document:doc(c,'recibo_caja','Recibo de caja'),date:fecha(d.fecha),type:'AdvancePayment',customer:{identification:id,branch_office:0},
   payment:{id:formaPago(c,String(d.medio||''),j.cuenta_id),value:valor},observations:`Depósito en garantía ${obs}`}});
  return {siigoId:r.id||null,numero:r.name||null,respuesta:r};
 }
 if(j.tipo==='devolucion_anticipo'){
  const id=await ensureThird(c,(j.cliente||d.cliente) as never,'Customer'),valor=Number(d.valor),k=c.parametros.cuentas||{};
  if(!k.anticipo)throw new SiigoError('Falta la cuenta de anticipos (2805) en Facturación por sede.');
  const cust={identification:id,branch_office:0},desc=`Devolución de depósito ${obs}`;
  // Siigo crosses the 2805 debit with the advance receipt being returned («due»): the receipt the ERP sent for this contract, or else the
  // customer's latest advance receipt in Siigo (deposits received before the store was connected).
  const {data:ant}=await db.from('siigo_documentos').select('siigo_numero,respuesta').eq('contrato_id',j.contrato_id).eq('tipo','anticipo').eq('estado','enviado').order('created_at',{ascending:false}).limit(1).maybeSingle();
  let rc:{name:string;date:string}|null=ant?.siigo_numero?{name:String(ant.siigo_numero),date:String((ant.respuesta as Value|null)?.date||d.fecha)}:null;
  if(!rc){const desde=new Date(Date.now()-400*86400000).toISOString().slice(0,10);
   const vs=(await siigoAll(c,`/v1/vouchers?created_start=${desde}`,15)).filter(v=>v.type==='AdvancePayment'&&String((v.customer as Value)?.identification||'')===String(id)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
   if(vs[0])rc={name:String(vs[0].name),date:String(vs[0].date)};}
  const due=rc&&split(rc.name)?{...split(rc.name),quote:1,date:fecha(rc.date)}:null;
  if(!due)throw new SiigoError('No encontré en Siigo el recibo de anticipo (depósito) de esta clienta para cruzar la devolución.');
  const r=await siigo(c,'/v1/journals',{method:'POST',body:{document:doc(c,'comprobante_devolucion','Devolución de depósitos'),date:fecha(d.fecha),observations:desc,
   items:[{account:{code:k.anticipo,movement:'Debit'},customer:cust,description:desc,value:valor,due},{account:{code:cuentaCaja(c,String(d.medio||''),j.cuenta_id),movement:'Credit'},customer:cust,description:desc,value:valor}]}});
  return {siigoId:r.id||null,numero:r.name||null,respuesta:r};
 }
 if(j.tipo==='nota_credito'){
  const f=j.factura;if(!f||f.estado!=='enviado'&&f.estado!=='anulado'||!f.siigo_id)throw new SiigoError('La factura original no está en Siigo.');
  const fr=(f.respuesta||{}) as Value,items=((fr.items||[]) as Value[]).map(x=>({code:x.code,description:x.description,quantity:Number(x.quantity)||1,price:Number(x.price)||0}));
  const valor=Number(d.valor),parcial=d.tipo==='parcial';
  const lines=parcial?[{code:items[0]?.code,description:`Descuento / devolución parcial · ${d.motivo}`.slice(0,500),quantity:1,price:valor}]:items;
  const credito=c.parametros.formas_pago?.credito;if(!credito)throw new SiigoError('Falta la forma de pago «crédito» en Facturación por sede.');
  // An electronic invoice takes the electronic credit note when the store has one configured.
  const elec=!!c.parametros.documentos?.nota_credito_electronica&&Number((fr.document as Value|undefined)?.id)===Number(c.parametros.documentos?.factura_electronica);
  const r=await siigo(c,'/v1/credit-notes',{method:'POST',body:{document:doc(c,elec?'nota_credito_electronica':'nota_credito',elec?'Nota crédito electrónica':'Nota crédito'),date:fecha(d.fecha),invoice:f.siigo_id,reason:parcial?'3':'2',
   items:lines,payments:[{id:credito,value:lines.reduce((s,x)=>s+Number(x.price)*Number(x.quantity),0)}],observations:`${d.motivo} · ${obs}`.slice(0,500)}});
  return {siigoId:r.id||null,numero:r.name||null,respuesta:r};
 }
 if(j.tipo==='gasto'||j.tipo==='soporte_gasto'||j.tipo==='soporte_producto'){
  const p=d.proveedor as Value,id=await ensureThird(c,{documento:p.documento,nombre:p.nombre||'Proveedor',tipo_documento:String(p.documento||'').length>=9?'NIT':'CC'},'Supplier'),valor=Number(d.valor),k=c.parametros.cuentas||{};
  let items:Value[];
  if(j.tipo==='soporte_producto'){const vs=(d.vestidos||[]) as Value[],each=Math.floor(valor/vs.length);
   items=[];for(const [i,v] of vs.entries())items.push({type:'Product',code:await ensureProduct(c,db,{...v,precio:0},true),description:String(v.descripcion||v.codigo).slice(0,500),quantity:1,price:i===vs.length-1?valor-each*(vs.length-1):each});}
  else{const cuenta=k[`gasto:${String(d.categoria||'').toLowerCase()}`]||k.gasto_defecto;if(!cuenta)throw new SiigoError('Falta la cuenta contable de gastos en Facturación por sede.');
   items=[{type:'Account',code:cuenta,description:String(d.descripcion||d.categoria||'Gasto').slice(0,500),quantity:1,price:valor}];}
  const fe=String(d.factura_numero||''),pf=/^([A-Za-z]+)-?(\d+)$/.exec(fe);
  const r=await siigo(c,'/v1/purchases',{method:'POST',body:{document:doc(c,j.tipo==='gasto'?'gasto':'soporte',j.tipo==='gasto'?'Gasto / compra':'Documento soporte'),date:fecha(d.fecha),
   supplier:{identification:id,branch_office:0},...(j.tipo==='gasto'?{provider_invoice:{prefix:pf?pf[1]:'FE',number:pf?pf[2]:fe.replace(/\D/g,'')||fe}}:{}),
   items,payments:[{id:formaPago(c,String(d.medio||''),j.cuenta_id),value:valor,due_date:fecha(d.fecha)}],observations:`${d.descripcion||d.categoria||'Gasto'} · ERP Ámbar`.slice(0,500)}});
  return {siigoId:r.id||null,numero:r.name||null,respuesta:r};
 }
 if(j.tipo==='compra'){
  // Cierres de caja › egreso › Siigo: «Compra o gasto» (FC, with the supplier's invoice number) or «Documento soporte» (DS); lines of
  // product (raises stock) or ledger account, with their taxes; paid with the chosen purchase payment method of the company.
  const p=d.proveedor as Value,id=await ensureThird(c,{documento:p.documento,nombre:p.nombre||'Proveedor',tipo_documento:String(p.documento||'').length>=9?'NIT':'CC'},'Supplier');
  const items=((d.items||[]) as Value[]).map(it=>({type:it.tipo,code:String(it.codigo),description:String(it.descripcion||'').slice(0,500)||'Gasto',quantity:Number(it.cantidad)||1,price:Number(it.valor),
   ...(((it.impuestos||[]) as number[]).length?{taxes:((it.impuestos||[]) as number[]).map(t=>({id:t}))}:{})}));
  const fc=d.comprobante==='FC',producto=items.some(x=>x.type==='Product');
  const documento=fc?(producto&&c.parametros.documentos?.compra?{id:c.parametros.documentos.compra}:doc(c,'gasto','Compra o gasto')):doc(c,'soporte','Documento soporte');
  const fe=String(d.factura_numero||''),pf=/^([A-Za-z0-9]*?)-?(\d+)$/.exec(fe.replace(/\s+/g,''));
  const r=await siigo(c,'/v1/purchases',{method:'POST',body:{document:documento,date:fecha(d.fecha),supplier:{identification:id,branch_office:0},
   ...(fc?{provider_invoice:{prefix:pf?.[1]||'FE',number:pf?pf[2]:fe.replace(/\D/g,'')||fe}}:{}),items,
   payments:[{id:Number(d.forma_pago),value:Number(d.total),due_date:fecha(d.fecha)}],observations:`${d.descripcion||d.categoria||'Gasto de caja'} · ERP Ámbar`.slice(0,500)}});
  return {siigoId:r.id||null,numero:r.name||null,respuesta:r};
 }
 if(j.tipo==='comprobante'){
  // Internal journal (money between stores, partner loans): accounts from the parameters, caja/banco by the ERP account used.
  const k=c.parametros.cuentas||{},valor=Number(d.valor);
  const tercero=String((d.socio&&c.parametros.socios?.[String(d.socio)])||c.parametros.tercero_defecto||'').replace(/\D/g,'');
  if(!tercero)throw new SiigoError(d.socio?`Falta la cédula del socio «${d.socio}» en Facturación por sede.`:'Falta el NIT de la empresa (tercero de comprobantes internos) en Facturación por sede.');
  const items=((d.lineas||[]) as Value[]).map(l=>{const code=l.cuenta==='caja'?cuentaCaja(c,'Transferencia',l.cuenta_id||null):k[String(l.cuenta)];
   if(!code)throw new SiigoError(`Falta la cuenta contable «${l.cuenta==='entre_sedes'?'Entre sedes':l.cuenta==='socios'?'Préstamos de socios':l.cuenta}» en Facturación por sede.`);
   return {account:{code,movement:l.mov},customer:{identification:tercero,branch_office:0},description:String(d.descripcion||'').slice(0,300),value:valor};});
  const r=await siigo(c,'/v1/journals',{method:'POST',body:{document:doc(c,'comprobante_interno','Comprobante interno (traslados)'),date:fecha(d.fecha),observations:String(d.descripcion||'').slice(0,500),items}});
  return {siigoId:r.id||null,numero:r.name||null,respuesta:r};
 }
 throw new SiigoError(`Tipo de documento no soportado: ${j.tipo}`);
}

/** Sends the queue (cron every 10 minutes). Each document is independent: one failure does not stop the others. */
/** Siigo lists for the purchase form (Cierres de caja › Siigo): purchase payment methods (FC and DS), taxes and products of a company. */
export async function refreshCatalogs(db:SupabaseClient,c:SiigoCred,productos=true){
 const pick=(x:unknown)=>((Array.isArray(x)?x:[]) as Value[]).filter(v=>v.active!==false);
 const [fc,ds,tx]=await Promise.all([siigo(c,'/v1/payment-types?document_type=FC'),siigo(c,'/v1/payment-types?document_type=DS'),siigo(c,'/v1/taxes')]);
 const rows:{tipo:string;datos:Value[]}[]=[{tipo:'formas_pago_fc',datos:pick(fc).map(v=>({id:v.id,name:v.name}))},{tipo:'formas_pago_ds',datos:pick(ds).map(v=>({id:v.id,name:v.name}))},
  {tipo:'impuestos',datos:pick(tx).map(v=>({id:v.id,name:v.name,type:v.type,percentage:Number(v.percentage)||0}))}];
 if(productos)rows.push({tipo:'productos',datos:(await siigoAll(c,'/v1/products',40)).filter(v=>v.active!==false).map(v=>({code:v.code,name:v.name,type:v.type}))});
 const now=new Date().toISOString();
 await db.from('siigo_catalogos').upsert(rows.map(r=>({sede_id:c.sede_id,...r,updated_at:now})),{onConflict:'sede_id,tipo'});
}
export async function processSiigoQueue(db:SupabaseClient,limite=50){
 const [{data:jobs,error},{data:creds,error:e2}]=await Promise.all([db.rpc('siigo_tomar_servidor',{p_limite:limite}),db.rpc('siigo_credenciales_activas_servidor')]);
 if(error||e2)throw Error((error||e2)!.message);
 const bySede=new Map(((creds||[]) as SiigoCred[]).map(c=>[c.sede_id,{...c,parametros:(c.parametros||{}) as Params}]));
 const out={enviados:0,esperando:0,errores:0};
 // Contracts whose invoice was sent in this run: their receipts were taken before it (and some are now included in the invoice), so
 // they are left for the next run, which reads them again.
 const facturados=new Set<string>();
 for(const j of (jobs||[]) as Job[]){
  const c=bySede.get(j.sede_id);
  if(j.tipo==='recibo_caja'&&j.contrato_id&&facturados.has(j.contrato_id))continue;
  try{
   if(!c)throw new SiigoError('La sede no tiene credenciales de Siigo.');
   const r=await sendJob(db,c,j);
   if(j.tipo==='factura'&&!r.esperar&&j.contrato_id)facturados.add(j.contrato_id);
   await db.rpc('siigo_resultado_servidor',{p_id:j.id,p_ok:!r.esperar,p_siigo_id:r.siigoId,p_numero:r.numero,p_error:r.mensaje||null,p_respuesta:r.respuesta,p_esperar:!!r.esperar});
   if(r.esperar)out.esperando++;else out.enviados++;
  }catch(e){
   out.errores++;
   await db.rpc('siigo_resultado_servidor',{p_id:j.id,p_ok:false,p_siigo_id:null,p_numero:null,p_error:e instanceof Error?e.message:'Error al enviar a Siigo',p_respuesta:e instanceof SiigoError&&e.body?{error:e.body}:null,p_esperar:false});
  }
 }
 // One store a run refreshes its Siigo lists when they are older than a day (products included).
 try{const {data:cat}=await db.from('siigo_catalogos').select('sede_id,updated_at').eq('tipo','productos');
  const fresh=new Map(((cat||[]) as {sede_id:string;updated_at:string}[]).map(x=>[x.sede_id,Date.parse(x.updated_at)]));
  const stale=[...bySede.values()].find(c=>!fresh.has(c.sede_id)||Date.now()-(fresh.get(c.sede_id)||0)>20*3600000);
  if(stale)await refreshCatalogs(db,stale);}catch(e){console.error('Catálogos Siigo:',e);}
 return out;
}
