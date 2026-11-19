/* eslint-disable @typescript-eslint/no-explicit-any */
/** Siigo Nube API (server only): auth per site, catalogs for the settings page and sending queued invoices (public.siigo_documentos). */
const BASE='https://api.siigo.com';
export type SiigoCred={usuario_api:string;access_key:string;partner_id:string;producto_codigo:string;producto_nombre:string};
export type SiigoParams={documento_electronica?:number;documento_ingreso?:number;vendedor?:number;pagos?:Record<string,number>;pago_credito?:number;
 impuesto?:number|null;factura_ventas?:'electronica'|'ingreso';impuesto_pct?:number;precios_con_iva?:boolean;ciudad?:{state_code:string;city_code:string}};
type Doc={id:string;datos:Record<string,any>};
const tokens=new Map<string,{token:string;exp:number}>();

/** Siigo's error body ({Errors:[{Code,Message}]}) as one readable line. */
const siigoError=(status:number,body:any)=>{const e=body?.Errors||body?.errors;
 return Array.isArray(e)&&e.length?e.map((x:any)=>[x.Message||x.message,x.Params?.length?`(${x.Params.join(', ')})`:''].filter(Boolean).join(' ')).join(' · '):`Siigo respondió ${status}.`;};

/** Keys copied from Siigo often lose the trailing «=» of their base64; Siigo rejects them without it. */
const padKey=(k:string)=>{const t=k.trim();return /^[A-Za-z0-9+/]+$/.test(t)&&t.length%4?t+'='.repeat(4-t.length%4):t;};
export async function siigoToken(c:SiigoCred,renew=false){
 const k=c.usuario_api+'|'+c.partner_id,hit=tokens.get(k);
 if(!renew&&hit&&hit.exp>Date.now())return hit.token;
 const r=await fetch(`${BASE}/auth`,{method:'POST',headers:{'Content-Type':'application/json','Partner-Id':c.partner_id},body:JSON.stringify({username:c.usuario_api.trim(),access_key:padKey(c.access_key)}),signal:AbortSignal.timeout(20000)});
 const b=await r.json().catch(()=>null);
 if(!r.ok||!b?.access_token)throw Error('Siigo no aceptó las credenciales: '+siigoError(r.status,b));
 tokens.set(k,{token:b.access_token,exp:Date.now()+Math.max(60,Number(b.expires_in||86400)-600)*1000});
 return b.access_token as string;
}

export async function siigo(c:SiigoCred,path:string,body?:unknown,retry=true):Promise<any>{
 const r=await fetch(BASE+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','Partner-Id':c.partner_id,Authorization:'Bearer '+await siigoToken(c,!retry)},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
 if(r.status===401&&retry)return siigo(c,path,body,false);
 const b=await r.json().catch(()=>null);
 if(!r.ok)throw Error(siigoError(r.status,b));
 return b;
}
const list=(b:any)=>Array.isArray(b)?b:Array.isArray(b?.results)?b.results:[];

/** Choices for the settings page: invoice document types, sellers, payment methods and taxes. */
export async function siigoCatalogos(c:SiigoCred){
 const [docs,users,pagos,taxes]=await Promise.all([siigo(c,'/v1/document-types?type=FV'),siigo(c,'/v1/users'),siigo(c,'/v1/payment-types?document_type=FV'),siigo(c,'/v1/taxes')]);
 return {documentos:list(docs).filter((d:any)=>d.active!==false).map((d:any)=>({id:d.id,nombre:`${d.code??''} ${d.name??''}`.trim(),electronica:!!d.electronic_type||/electr/i.test(String(d.name))})),
  vendedores:list(users).filter((u:any)=>u.active!==false).map((u:any)=>({id:u.id,nombre:[u.first_name,u.last_name].filter(Boolean).join(' ')||u.username})),
  pagos:list(pagos).filter((p:any)=>p.active!==false).map((p:any)=>({id:p.id,nombre:p.name,credito:!!p.due_date||/cr[eé]dito/i.test(String(p.name))})),
  impuestos:list(taxes).filter((t:any)=>t.active!==false).map((t:any)=>({id:t.id,nombre:t.name,pct:Number(t.percentage)||0}))};
}

const ID_TYPES:Record<string,string>={CC:'13',NIT:'31',CE:'22',TI:'12',PA:'41',PP:'41',PASAPORTE:'41',PEP:'47',PPT:'47',DIE:'42'};
/** Makes sure the customer exists in Siigo (natural person by default). */
async function asegurarCliente(c:SiigoCred,p:SiigoParams,cli:Record<string,any>){
 const doc=String(cli.documento||'').replace(/\D/g,'');
 if(doc.length<5)throw Error('El cliente no tiene documento válido.');
 if(list(await siigo(c,`/v1/customers?identification=${doc}`)).length)return doc;
 if(!p.ciudad?.state_code||!p.ciudad?.city_code)throw Error('Configura la ciudad de la sede en Facturación por sede para crear clientes nuevos.');
 const tipo=String(cli.tipo_documento||'CC').toUpperCase(),nit=tipo==='NIT';
 const words=String(cli.nombre||'').trim().split(/\s+/).filter(Boolean),cut=words.length>=3?2:1;
 const nombres=words.slice(0,cut).join(' ')||'Cliente',apellidos=words.slice(cut).join(' ')||'.';
 const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(cli.email||''))?String(cli.email):undefined;
 await siigo(c,'/v1/customers',{type:'Customer',person_type:nit?'Company':'Person',id_type:ID_TYPES[tipo]||'13',identification:doc,
  name:nit?[String(cli.nombre)]:[nombres,apellidos],vat_responsible:false,fiscal_responsibilities:[{code:'R-99-PN'}],
  address:{address:String(cli.direccion||'').trim()||'Sin dirección',city:{country_code:'Co',state_code:p.ciudad.state_code,city_code:p.ciudad.city_code}},
  phones:[{number:String(cli.telefono||'').replace(/\D/g,'').slice(-10)||'0000000'}],
  contacts:[{first_name:nombres,last_name:apellidos,email,phone:{number:String(cli.telefono||'').replace(/\D/g,'').slice(-10)||undefined}}]});
 return doc;
}

/** Item code: the dress's own Siigo product when it exists (sales «código+V»), otherwise the site's generic product. */
async function codigoProducto(c:SiigoCred,codigo?:string){
 if(codigo&&list(await siigo(c,`/v1/products?code=${encodeURIComponent(codigo)}`)).some((x:any)=>String(x.code)===codigo))return codigo;
 return c.producto_codigo;
}

const r2=(n:number)=>Math.round(n*100)/100;
/** Sends one queued invoice; returns Siigo's id and number. */
export async function siigoEnviarFactura(c:SiigoCred,p:SiigoParams,d:Doc){
 // Dress sales follow the site's choice (e.g. Barranquilla bills with its non-electronic «Documento» FV-1).
 const x=d.datos,electronica=(x.tipo_venta==='venta'&&p.factura_ventas?p.factura_ventas:x.tipo_factura)!=='ingreso';
 const documento=electronica?p.documento_electronica:p.documento_ingreso;
 if(!documento)throw Error(`Configura el tipo de comprobante de factura ${electronica?'electrónica':'de ingreso'} de esta sede.`);
 if(!p.vendedor)throw Error('Configura el vendedor de Siigo de esta sede.');
 const contado=p.pagos?.[String(x.forma_pago)]||p.pagos?.Otro;
 if(Number(x.pagado)>0&&!contado)throw Error(`Configura la forma de pago «${x.forma_pago}» de esta sede.`);
 if(Number(x.saldo)>0&&!p.pago_credito)throw Error('Configura la forma de pago a crédito (saldo pendiente) de esta sede.');
 const identification=await asegurarCliente(c,p,x.cliente||{});
 const pct=p.impuesto?Number(p.impuesto_pct)||0:0,incl=p.impuesto&&p.precios_con_iva!==false;
 const items=[];let total=0;
 for(const it of (x.items||[]) as any[]){
  const qty=Number(it.cantidad)||1,bruto=Number(it.precio)||0,price=incl?r2(bruto/(1+pct/100)):bruto;
  total+=r2(price*qty*(1+pct/100));
  items.push({code:it.generico?c.producto_codigo:await codigoProducto(c,it.codigo),description:String(it.descripcion||c.producto_nombre).slice(0,200),quantity:qty,price,
   ...(p.impuesto?{taxes:[{id:p.impuesto}]}:{})});
 }
 if(!items.length||total<=0)throw Error('La factura no tiene valor.');
 total=r2(total);
 const saldo=Number(x.saldo)>0?Math.min(total,r2(Number(x.saldo))):0,pagado=r2(total-saldo);
 const payments=[...(pagado>0?[{id:contado,value:pagado,due_date:x.fecha}]:[]),...(saldo>0?[{id:p.pago_credito,value:saldo,due_date:x.vence||x.fecha}]:[])];
 const obs=[x.numero_contrato?`Contrato ${x.numero_contrato}`:'',x.venta?`Venta VTA-${String(x.venta).padStart(6,'0')}`:'',`Ref ERP ${d.id.slice(0,8)}`].filter(Boolean).join(' · ');
 const r=await siigo(c,'/v1/invoices',{document:{id:documento},date:x.fecha,customer:{identification,branch_office:0},seller:p.vendedor,observations:obs,items,payments,
  ...(electronica?{stamp:{send:true},mail:{send:!!x.cliente?.email}}:{})});
 return {id:String(r?.id||''),numero:String(r?.name||r?.number||''),respuesta:r};
}
