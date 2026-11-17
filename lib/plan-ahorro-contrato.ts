import {createHmac,timingSafeEqual} from 'node:crypto';
import {jsPDF} from 'jspdf';
import type {ContractSection} from './ally-contract-text';
import {ownerAgreement} from './contract-owner';

/** Plan Ahorro XV contract (draft reviewed by the owner on 17/11/2026, pending the lawyer): the family signs it from a private link
 *  before its first cuota. Placeholders {…} are filled with the plan and the signer's data; the store's owner replaces the
 *  Villavicencio owner (same as the ally agreement). Change the text here and raise PLAN_CONTRACT_VERSION. */
export const PLAN_CONTRACT_VERSION='2026-11-17';
const TEXTO:ContractSection[]=[
 {titulo:'CONTRATO DE PLAN AHORRO XV',parrafos:[]},
 {titulo:'Partes',parrafos:[
  'Entre los suscritos, a saber:',
  'AMBAR COUTURE (en adelante «AMBAR COUTURE»), representada legalmente por JORGE ANDRÉS ROMERO DÍAZ, identificado con cédula de ciudadanía No. 80.031.674, con domicilio principal en Calle 15 # 42-21, Casa 7, Bugambiles, barrio El Buque, Villavicencio, Meta, correo ambarcouturedresses@gmail.com y teléfono 301 730 7411.',
  'EL AHORRADOR: {nombre}, identificado con cédula No. {cedula}, domiciliado en {direccion}, celular {celular} y correo {correo}, quien actúa como madre, padre o acudiente de la quinceañera {quinceanera}, identificada con T.I. No. {ti}.',
  'Acuerdan celebrar el presente Contrato de Plan Ahorro XV, que se regirá por las siguientes consideraciones y cláusulas.']},
 {titulo:'Consideraciones',parrafos:[
  '1. AMBAR COUTURE alquila y vende vestidos de XV años, gala y novia, y presta servicios como la sesión Pre XV, en sus sedes de Barranquilla, Bogotá, Pereira y Villavicencio, con envíos a todo Colombia.',
  '2. EL AHORRADOR desea ahorrar mes a mes, con anticipación, para pagar el vestido y los servicios de la fiesta de XV años de la quinceañera.',
  '3. Los pagos de este plan son anticipos de EL AHORRADOR por productos y servicios futuros de AMBAR COUTURE. No constituyen un depósito de dinero ni una inversión y no generan intereses.']},
 {titulo:'Cláusulas',parrafos:[
  'PRIMERA. Objeto. Establecer las condiciones en que EL AHORRADOR hace pagos mensuales anticipados a AMBAR COUTURE para usarlos, cerca de la fecha del evento, en el alquiler o la compra de vestidos y en los servicios de AMBAR COUTURE para la fiesta de XV años de la quinceañera.',
  'SEGUNDA. Requisitos. Solo pueden vincularse familias cuya fecha estimada del evento esté al menos seis (6) meses después de la firma de este contrato y no más de dos (2) años después. No se exige un valor mínimo total del plan.',
  'TERCERA. Cuotas. EL AHORRADOR paga una cuota mensual de {cuota}, que no puede ser inferior a ciento cincuenta mil pesos ($150.000), a más tardar el día {dia} de cada mes. La primera cuota se paga al firmar. EL AHORRADOR puede abonar más de la cuota o adelantar cuotas en cualquier momento. Las cuotas no generan intereses a favor ni en contra de ninguna de las partes.',
  'CUARTA. Forma de pago. Los pagos se hacen en pesos colombianos, en efectivo en la sede de vinculación, por transferencia a las cuentas de AMBAR COUTURE o con tarjeta. AMBAR COUTURE registra cada pago y confirma a EL AHORRADOR, por WhatsApp o correo, el valor recibido y el total ahorrado. Los costos de la transferencia corren por cuenta de EL AHORRADOR.',
  'QUINTA. Extra del plan. Al usar el plan, AMBAR COUTURE suma al total efectivamente pagado un extra del diez por ciento (10 %), o del doce por ciento (12 %) si el total pagado supera tres millones de pesos ($3.000.000). El extra solo se usa en productos y servicios de AMBAR COUTURE: no se entrega en dinero, no se transfiere a terceros y se pierde si el plan termina por desistimiento o por mora.',
  'SEXTA. Niveles y premios. Según el total efectivamente pagado al usar el plan, EL AHORRADOR recibe en préstamo, sin costo, para el mismo evento:']},
 {titulo:'',parrafos:[],lista:[
  'Nivel Rosa (hasta $1.499.999): extra del 10 % y tiara.',
  'Nivel Diamante (de $1.500.000 a $3.000.000): extra del 10 %, tiara, cojines y un (1) vestido de gala de la categoría Gala Clásica.',
  'Nivel Corona (más de $3.000.000): extra del 12 %, tiara, cojines, dos (2) vestidos de gala de cualquier categoría y prioridad para escoger el vestido.']},
 {titulo:'',parrafos:[
  'Los artículos en préstamo están sujetos a disponibilidad para la fecha del evento. Se entregan y devuelven en las mismas fechas que el vestido de la quinceañera, con las condiciones de cuidado, devolución, daños y pérdida del Contrato de Arrendamiento. Los vestidos de gala incluyen lavado y arreglo de talla; los cambios de diseño se pagan aparte. Los premios no se cambian por dinero.',
  'SÉPTIMA. Uso del ahorro. El plan se usa desde tres (3) meses antes de la fecha del evento. EL AHORRADOR agenda una cita de selección, en la que escoge el vestido y los servicios según la disponibilidad de ese día. Lo escogido se formaliza con el Contrato de Arrendamiento y Prestación de Servicios de AMBAR COUTURE, cuyas cláusulas aplican plenamente. Si lo escogido cuesta más que lo ahorrado más el extra, EL AHORRADOR paga la diferencia en los plazos de ese contrato. Si cuesta menos, el saldo a favor se usa en otros productos o servicios de AMBAR COUTURE para el mismo evento; no se devuelve en dinero.',
  'OCTAVA. Promociones. El extra y los premios de este plan no se acumulan con otras promociones de AMBAR COUTURE, salvo que AMBAR COUTURE lo indique por escrito.',
  'NOVENA. Desistimiento. EL AHORRADOR puede desistir del plan en cualquier momento, por escrito. AMBAR COUTURE devuelve lo efectivamente pagado menos el diez por ciento (10 %) por gastos administrativos, sin el extra ni los premios, dentro de los quince (15) días hábiles siguientes a la solicitud, a la cuenta que indique EL AHORRADOR.',
  'DÉCIMA. Mora y terminación. AMBAR COUTURE recuerda cada cuota por WhatsApp antes de su vencimiento y avisa si no se recibió. Si EL AHORRADOR deja de pagar dos (2) cuotas consecutivas, AMBAR COUTURE puede terminar el plan desde el vencimiento de la segunda cuota y devolver lo pagado con las condiciones de la cláusula novena.',
  'UNDÉCIMA. Vigencia. El plan rige desde su firma hasta que se use, hasta que EL AHORRADOR desista o hasta que termine por mora. Si llega la fecha del evento sin que el plan se haya usado, se aplica la cláusula novena. Si la fecha del evento cambia, las partes pueden ajustarla por escrito.',
  'DUODÉCIMA. Comunicaciones. EL AHORRADOR autoriza que AMBAR COUTURE le escriba por WhatsApp, SMS, correo o llamada para confirmar pagos, recordar cuotas, avisar cuándo puede usar el plan y agendar la cita de selección. La autorización para recibir promociones es aparte y opcional.',
  'DECIMOTERCERA. Datos personales. Las partes cumplen la Ley 1581 de 2012. EL AHORRADOR autoriza el tratamiento de sus datos y los de la quinceañera, como su representante legal, según la Política de Tratamiento de Datos Personales de AMBAR COUTURE, solo para gestionar este plan y los contratos que de él se deriven.',
  'DECIMOCUARTA. Disposiciones finales. Las diferencias se resuelven por arreglo directo en quince (15) días y, en su defecto, por conciliación en Villavicencio o ante la jurisdicción ordinaria. EL AHORRADOR acepta este contrato con firma electrónica en la plataforma de AMBAR COUTURE, válida según la Ley 527 de 1999, y recibe una copia.',
  'En constancia, se firma el {fecha}.',
  'AMBAR COUTURE · Representante legal: Jorge Andrés Romero Díaz · C.C. 80.031.674',
  'EL AHORRADOR · Nombre: {nombre} · C.C. {cedula}']},
 {titulo:'ANEXO 1. Datos del plan',parrafos:[],lista:[
  'Número del plan: {numero}','Sede de vinculación: {sede}','Fecha estimada del evento: {evento}','Cuota mensual: {cuota}','Día de pago: {dia} de cada mes',
  'Primera cuota: {fecha}','Uso del plan desde: {usar}','Cuotas estimadas hasta esa fecha: {cuotas}','Ahorro estimado: {ahorro}','Extra estimado: {extra}','Total estimado para usar: {total}',
  'Los valores estimados suponen que se pagan todas las cuotas a tiempo. Lo que vale al usar el plan es el total efectivamente pagado, con el extra y el nivel que le correspondan según las cláusulas quinta y sexta.']},
];

export type PlanFirma={id:string;numero:number;sede:string;titular_nombre:string;telefono:string;email:string|null;quinceanera_nombre:string|null;fecha_evento:string;cuota_mensual:number;dia_pago:number};
export type DatosFirmante={cedula:string;direccion:string;correo:string;quinceanera:string;ti:string};
const cop=(n:number)=>`$${Math.round(n).toLocaleString('es-CO')}`;
const fechaLarga=(d:Date|string)=>new Date(typeof d==='string'?d+'T12:00:00-05:00':d).toLocaleDateString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'long',year:'numeric'});

/** The contract with the plan and the signer's data (and the store owner as the counterparty). */
export function planContractText(p:PlanFirma,d:DatosFirmante,at:Date):ContractSection[]{
 const usar=new Date(p.fecha_evento+'T12:00:00-05:00');usar.setMonth(usar.getMonth()-3);
 const hoy=new Date(at.toLocaleDateString('en-CA',{timeZone:'America/Bogota'})+'T12:00:00-05:00');
 const cuotas=Math.max(1,(usar.getFullYear()-hoy.getFullYear())*12+usar.getMonth()-hoy.getMonth()+1),ahorro=cuotas*p.cuota_mensual,pct=ahorro>3000000?12:10,extra=Math.round(ahorro*pct/100);
 const v:Record<string,string>={nombre:p.titular_nombre,cedula:d.cedula||'—',direccion:d.direccion||'—',celular:p.telefono,correo:d.correo||p.email||'—',quinceanera:d.quinceanera||p.quinceanera_nombre||'—',ti:d.ti||'—',
  cuota:cop(p.cuota_mensual),dia:String(p.dia_pago),fecha:fechaLarga(at),numero:String(p.numero),sede:p.sede,evento:fechaLarga(p.fecha_evento),usar:fechaLarga(usar),
  cuotas:String(cuotas),ahorro:cop(ahorro),extra:`${cop(extra)} (${pct} %)`,total:cop(ahorro+extra)};
 const f=(s:string)=>s.replace(/\{(\w+)\}/g,(_,k:string)=>v[k]??`{${k}}`);
 return ownerAgreement(TEXTO.map(s=>({titulo:f(s.titulo),parrafos:s.parrafos.map(f),...(s.lista?{lista:s.lista.map(f)}:{})})),p.sede);
}

const purpose='plan-ahorro-firma';
const sign=(id:string,expires:number,key:string)=>createHmac('sha256',key).update(`${purpose}:${id}.${expires}`).digest('base64url');
/** Private signing link valid 30 days (no database token). */
export function planSigningToken(id:string,key:string,days=30){
 if(!key)throw Error('Enlaces no configurados');
 const expires=Date.now()+days*86400000;return `${id}.${expires}.${sign(id,expires,key)}`;
}
export function verifyPlanSigningToken(token:string,key:string,now=Date.now()){
 const p=token.split('.');
 if(!key||p.length!==3||!/^[0-9a-f-]{36}$/i.test(p[0])||!/^\d{10,13}$/.test(p[1])||Number(p[1])<=now)return null;
 const a=Buffer.from(p[2]),b=Buffer.from(sign(p[0],Number(p[1]),key));
 return a.length===b.length&&timingSafeEqual(a,b)?p[0]:null;
}

/** Signed contract as PDF: text, the signer's signature and the verification line. */
export function planContractPdf(sections:ContractSection[],firma:string,pie:string){
 const doc=new jsPDF({unit:'pt',format:'letter'}),W=532,H=792,M=40;let y=M;
 const write=(text:string,size:number,bold=false)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);
  for(const line of doc.splitTextToSize(text,W) as string[]){if(y>H-M){doc.addPage();y=M;}doc.text(line,M,y);y+=size*1.35;}y+=4;};
 for(const s of sections){if(s.titulo)write(s.titulo,11,true);s.parrafos.forEach(p=>write(p,9.5));(s.lista||[]).forEach(l=>write('• '+l,9.5));}
 if(y>H-M-110){doc.addPage();y=M;}
 write('Firma de EL AHORRADOR',10,true);doc.addImage(firma,'PNG',M,y,160,70);y+=80;write(pie,8);
 return Buffer.from(doc.output('arraybuffer'));
}
