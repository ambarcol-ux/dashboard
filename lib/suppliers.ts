export const SERVICE_TYPES=['Maquillaje y peinado','Fotografía','Video','Caballos','Locación','Hospedaje','Decoración','Lavandería','Mensajería','Transporte','Otro'] as const;
export const DOC_TYPES=['Condiciones','Portafolio','Contrato interno','RUT','Certificación bancaria','Acuerdo de precios','Otro'] as const;
export const INTERNAL_DOC_TYPES:readonly string[]=['Contrato interno','RUT','Certificación bancaria'];
export const SUPPLIER_PAYMENT_METHODS=['Transferencia','Efectivo','Nequi','Daviplata','Otro'] as const;
export const SUPPLIER_FILE_TYPES:Record<string,string>={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};

export type Supplier={id:string;codigo:string;nombre:string;tipo_servicio:string;celular:string|null;celular_2?:string|null;correo:string|null;documento?:string|null;
 banco?:string|null;tipo_cuenta?:string|null;numero_cuenta?:string|null;estado:'Activo'|'Inactivo';usuario_id?:string|null;notas?:string|null};
export type SupplierSummary=Pick<Supplier,'id'|'codigo'|'nombre'|'tipo_servicio'|'celular'|'correo'|'estado'>&{tiene_usuario:boolean;sedes:string[];servicios_mes:number;por_pagar:number};
export type Tariff={id:string;codigo:string;proveedor_id:string;sede_id:string;servicio:string;descripcion:string;recurso:string|null;valor_empresa:number;valor_cliente:number;
 adicional_valor:number;adicional_detalle:string|null;adicional_opcional:string|null;vigente_desde:string;vigente_hasta:string|null;activa:boolean};
export type CatalogItem={tarifa_id:string;codigo:string;servicio:string;descripcion:string;recurso:string|null;valor_cliente:number;adicional_opcional:string|null;
 proveedor_id:string;proveedor:string;celular:string|null;tiene_condiciones:boolean;valor_empresa?:number;adicional_valor?:number;adicional_detalle?:string|null};
export type ContractService={id:string;servicio:string;descripcion:string;recurso:string|null;fecha_servicio:string;valor_cliente:number;estado:string;estado_pago:string;
 notas:string|null;proveedor_id:string;proveedor:string;celular:string|null;asignado_por:string|null;motivo_cancelacion:string|null;valor_empresa?:number;adicional_valor?:number};

const cents=(v:unknown)=>Math.round(Number(v||0)*100);
/** Margin is never stored: client price − cost to the company − mandatory extra. */
export const tariffMargin=(t:{valor_cliente:unknown;valor_empresa:unknown;adicional_valor?:unknown})=>(cents(t.valor_cliente)-cents(t.valor_empresa)-cents(t.adicional_valor))/100;
export const isLossTariff=(t:{valor_cliente:unknown;valor_empresa:unknown;adicional_valor?:unknown})=>tariffMargin(t)<0;

/** Colombian mobile as 10 digits (drops spaces, dashes and a +57 prefix); '' → null; anything else → undefined (invalid). */
export function normalizePhone(raw:unknown){
 const digits=String(raw??'').replace(/[\s().-]/g,'').replace(/^\+?57(?=\d{10}$)/,'');
 if(!digits)return null;
 return /^\d{10}$/.test(digits)?digits:undefined;
}

/** Next sequential code with the same prefix: P001…, T001…, K001… */
export function nextCode(prefix:string,existing:string[]){
 const max=existing.reduce((m,c)=>{const n=c.startsWith(prefix)?Number(c.slice(prefix.length)):NaN;return Number.isInteger(n)&&n>m?n:m;},0);
 return prefix+String(max+1).padStart(3,'0');
}

export const defaultVisibility=(tipo:string)=>INTERNAL_DOC_TYPES.includes(tipo)?'Interno':'Asesora';

export function supplierFilePath(proveedorId:string,type:string){
 const ext=SUPPLIER_FILE_TYPES[type];
 if(!ext)throw Error('Adjunta un PDF, JPG, PNG o WebP.');
 return `${proveedorId}/${crypto.randomUUID()}.${ext}`;
}

/** Actions the store staff may take on an assigned service. */
export function serviceActions(estado:string,estadoPago:string){
 const actions:('Confirmado'|'Realizado'|'Cancelado')[]=[];
 if(estado==='Asignado')actions.push('Confirmado');
 if(estado==='Asignado'||estado==='Confirmado')actions.push('Realizado');
 if(estado!=='Cancelado'&&estadoPago!=='Pagado')actions.push('Cancelado');
 return actions;
}

/** "2026-12-01" + "15:30" in Bogotá → ISO instant; Colombia has no DST. */
export const bogotaInstant=(fecha:string,hora:string)=>/^\d{4}-\d{2}-\d{2}$/.test(fecha)&&/^\d{2}:\d{2}$/.test(hora)?new Date(`${fecha}T${hora}:00-05:00`).toISOString():null;
export const bogotaDateTime=(iso:string)=>new Date(iso).toLocaleString('es-CO',{timeZone:'America/Bogota',weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'});

export const daysUntil=(date:string,today:string)=>Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
export const sumMoney=(values:unknown[])=>values.reduce((t:number,v)=>t+cents(v),0)/100;
export const errorText=(e:unknown,fallback:string)=>e&&typeof e==='object'&&'message' in e&&typeof (e as {message:unknown}).message==='string'?(e as {message:string}).message:fallback;
