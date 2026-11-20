'use client';
import {useEffect,useState} from 'react';
import {Trophy,MessageCircle,Sparkles,FileSignature,Ruler,PackageCheck,RotateCcw,Wallet,Shirt,HeartHandshake} from 'lucide-react';
import {supabase} from '@/lib/supabase';

/** Ámbar Exitoso · Manual Ámbar (Manuales › Protocolos): how each moment of the service is done in every store, its checklist and
 *  the indicator the ERP measures (public.manual_indicadores, last 30 days). Version 1: to be adjusted with the best advisers. */
type Row=Record<string,number|string|null>;
type Ind={titulo:string;meta:number;inverso?:boolean;unidad?:string;valor:(r:Row)=>number|null};
const n=(r:Row,k:string)=>Number(r[k]||0);
const pc=(a:number,b:number)=>b>0?Math.round(a/b*100):null;
export const INDICADORES:Record<string,Ind[]>={
 atencion:[{titulo:'Chats respondidos en 15 minutos o menos',meta:95,unidad:'%',valor:r=>r.respuesta_15==null?null:n(r,'respuesta_15')}],
 primera_cita:[{titulo:'Citas que asistieron',meta:70,unidad:'%',valor:r=>pc(n(r,'asistieron'),n(r,'citas'))},{titulo:'De las que asistieron, contrataron',meta:40,unidad:'%',valor:r=>pc(n(r,'contrataron'),n(r,'asistieron'))},
  {titulo:'Citas sin origen registrado',meta:0,inverso:true,unidad:'%',valor:r=>pc(n(r,'citas_sin_origen'),n(r,'citas'))}],
 contrato:[{titulo:'Contratos firmados en el ERP',meta:100,unidad:'%',valor:r=>pc(n(r,'firmados_erp'),n(r,'contratos'))},{titulo:'Contratos con correo de la clienta',meta:100,unidad:'%',valor:r=>pc(n(r,'con_correo'),n(r,'contratos'))}],
 entrega:[{titulo:'Vestidos entregados con saldo pendiente',meta:0,inverso:true,valor:r=>n(r,'entregas_con_saldo')}],
 devolucion:[{titulo:'Depósitos sin devolver 8 días después del evento',meta:0,inverso:true,valor:r=>n(r,'depositos_atrasados')}],
 caja:[{titulo:'Días con caja cerrada (lunes a sábado)',meta:100,unidad:'%',valor:r=>pc(n(r,'dias_cerrados'),n(r,'dias_habiles'))}],
 inventario:[{titulo:'Vestidos con costo registrado',meta:100,unidad:'%',valor:r=>pc(n(r,'vestidos_con_costo'),n(r,'vestidos'))},{titulo:'Vestidos con foto',meta:100,unidad:'%',valor:r=>pc(n(r,'vestidos_con_foto'),n(r,'vestidos'))}],
};

type Puntaje={id:string;nombre:string;puntaje:number;componentes:{nombre:string;puntos:number;max:number}[]};
/** Puntaje Ámbar por sede (0–100, public.puntaje_ambar): Tablero CEO and Manual Ámbar. */
export function PuntajeAmbar(){
 const [rows,setRows]=useState<Puntaje[]|null>(null),[abierta,setAbierta]=useState('');
 useEffect(()=>{let live=true;void supabase.rpc('puntaje_ambar').then(({data})=>{if(live)setRows((data||[]) as Puntaje[]);});return()=>{live=false;};},[]);
 if(!rows)return <p className="text-sm text-gray-400">Calculando Puntaje Ámbar…</p>;
 const color=(p:number)=>p>=85?'text-emerald-700 bg-emerald-50 border-emerald-100':p>=70?'text-amber-700 bg-amber-50 border-amber-100':'text-rose-700 bg-rose-50 border-rose-100';
 return <div className="space-y-3">
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[...rows].sort((a,b)=>b.puntaje-a.puntaje).map((r,i)=><button type="button" key={r.id} onClick={()=>setAbierta(v=>v===r.id?'':r.id)} className={`text-left rounded-2xl border p-4 ${color(r.puntaje)}`}>
   <p className="text-[11px] font-black uppercase tracking-wider">{i===0?'🏆 ':''}{r.nombre}</p><p className="text-4xl font-black mt-1">{r.puntaje}<span className="text-base font-bold">/100</span></p><p className="text-[11px] mt-1 underline">{abierta===r.id?'Ocultar detalle':'Ver de dónde sale'}</p></button>)}</div>
  {rows.filter(r=>r.id===abierta).map(r=><div key={r.id} className="bg-white rounded-2xl border p-4"><p className="font-black mb-2">{r.nombre}: cómo se calcula (últimos 30 días)</p>
   {r.componentes.map(c=><div key={c.nombre} className="flex items-center gap-3 text-sm py-1 border-b last:border-0"><span className="flex-1">{c.nombre}</span>
    {c.max>0?<><div className="w-28 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500" style={{width:`${Math.max(0,Math.min(100,c.puntos/c.max*100))}%`}}/></div><b className="w-16 text-right">{c.puntos}/{c.max}</b></>:<b className={`w-16 text-right ${c.puntos<0?'text-rose-700':''}`}>{c.puntos}</b>}</div>)}
   <p className="text-[11px] text-gray-500 mt-2">Para subir: lo que está más lejos de su máximo. Cada punto sale de los indicadores de los protocolos del Manual Ámbar.</p></div>)}
  <p className="text-[11px] text-gray-500">🟢 85 o más · 🟡 70 a 84 · 🔴 menos de 70. Pesos: ventas 25, conversión 20, caja 15, asistencia 10, atención 10, contratos completos 10, inventario 5, datos limpios 5, menos penalizaciones.</p>
 </div>;
}

export function IndicadorAmbar({clave}:{clave:string}){
 const [rows,setRows]=useState<Row[]|null>(null);
 useEffect(()=>{let live=true;void supabase.rpc('manual_indicadores').then(({data})=>{if(live)setRows((data||[]) as Row[]);});return()=>{live=false;};},[]);
 const inds=INDICADORES[clave];if(!inds)return null;
 return <div className="mb-8 p-5 rounded-2xl border border-indigo-100 bg-indigo-50/40">
  <h3 className="text-lg font-black text-indigo-900 mb-3">📊 Cómo vamos (últimos 30 días, medido en el ERP)</h3>
  {!rows?<p className="text-sm text-gray-500">Cargando…</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase text-gray-500"><th className="py-2 pr-3">Indicador</th><th className="py-2 pr-3">Meta</th>{rows.map(r=><th key={String(r.id)} className="py-2 pr-3">{String(r.nombre)}</th>)}</tr></thead>
   <tbody>{inds.map(i=><tr key={i.titulo} className="border-t border-indigo-100"><td className="py-2 pr-3 font-bold text-gray-800">{i.titulo}</td><td className="py-2 pr-3 text-gray-500">{i.meta}{i.unidad||''}</td>
    {rows.map(r=>{const v=i.valor(r);const ok=v===null?null:i.inverso?v<=i.meta:v>=i.meta;const cerca=v!==null&&!ok&&(i.inverso?v<=Math.max(2,i.meta*1.5):v>=i.meta*0.8);
     return <td key={String(r.id)} className={`py-2 pr-3 font-black ${ok===null?'text-gray-400':ok?'text-emerald-700':cerca?'text-amber-700':'text-rose-700'}`}>{v===null?'—':`${v}${i.unidad||''}`} {ok===null?'':ok?'✅':cerca?'🟡':'🔴'}</td>;})}</tr>)}</tbody></table></div>}
 </div>;
}

const P=(id:string,title:string,description:string,icon:React.ReactNode,indicador:string|null,sections:object[])=>({id,title,description,icon,indicador,grupo:'ambar',sections});
export const PROTOCOLOS=[
 P('pa-puntaje','🏆 Puntaje Ámbar por sede','Un número de 0 a 100 que dice qué tan bien funciona cada sede según el Manual Ámbar.',<Trophy className="w-5 h-5"/>,'puntaje',[
  {type:'intro',title:'🎯 Para qué',content:'El Puntaje Ámbar junta en un solo número lo que mide cada protocolo: ventas, conversión, caja, asistencia, atención, contratos completos, inventario y datos limpios. Es la forma de saber qué sede cumple el estándar Ámbar y qué debe mejorar primero. Es la base para auditorías, premios y franquicias.'},
  {type:'steps',title:'📝 Cómo usarlo',items:['Revísalo cada lunes en la reunión de sede.','Toca la sede para ver de dónde sale cada punto.','Trabaja primero lo que está más lejos de su máximo (suele ser la caja o la conversión).','Meta: **85 o más** en todas las sedes.']}]),
 P('pa-atencion','💬 Protocolo 1 · Atención de mensajes','WhatsApp, Instagram y Messenger: responder rápido, con calidez, y llevar a la cita.',<MessageCircle className="w-5 h-5"/>,'atencion',[
  {type:'intro',title:'🎯 Para qué',content:'Cada mensaje es una clienta que quiere su vestido. La IA contesta al instante y la asesora entra cuando el chat queda marcado «Atender persona». La meta es que ningún chat se enfríe y que cada conversación termine con una cita agendada.'},
  {type:'steps',title:'📝 Cómo se hace',items:['Revisa **WhatsApp 304** al llegar, a mediodía y antes de cerrar: filtro **Atender persona** de tu sede primero.','Lee el resumen de la IA antes de escribir: no vuelvas a preguntar lo que la clienta ya dijo.','Saluda con su nombre y responde **exactamente** lo que preguntó; luego invita a la cita: «¿Te muestro los horarios para que vengas a medírtelos?».','Si pide precios, da el rango de su categoría y explica que en la cita se eligen con calma.','Agenda dentro del chat (lista de horarios) y pide su **correo** para enviarle la confirmación.','Cuando lo resuelvas por fuera (celular, llamada), toca **✓ Marcar resuelto**.']},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Respondí en menos de 15 minutos','Usé su nombre','Respondí lo que preguntó','Ofrecí la cita con horarios','Pedí el correo','Marqué resuelto si lo atendí por fuera']},
  {type:'warning',title:'⚠️ Nunca',content:'**Nunca** dejes un chat «Atender persona» para el día siguiente. **Nunca** prometas un vestido o un descuento sin confirmarlo en el ERP.'}]),
 P('pa-primera-cita','✨ Protocolo 2 · Primera cita','La experiencia en tienda que convierte una visita en contrato.',<Sparkles className="w-5 h-5"/>,'primera_cita',[
  {type:'intro',title:'🎯 Para qué',content:'La primera cita es el momento de la verdad: la clienta viene a enamorarse de su vestido. Una cita bien preparada y bien cerrada es la diferencia entre 2 y 6 contratos de cada 10.'},
  {type:'steps',title:'📝 Antes de que llegue',items:['Abre **Primeras visitas** y lee su ficha: tipo de vestido, fecha del evento, de dónde llegó y lo que habló en el chat.','Separa **3 a 5 vestidos** de su talla y estilo en **Agenda de vestidos** (disponibles para su fecha).','Ten listos el espejo, el probador y una bebida.']},
  {type:'steps',title:'📝 Durante la cita',items:['**Bienvenida (2 min):** preséntate, felicítala por su evento y pregúntale cómo lo imagina.','**Descubrir (5 min):** fecha, lugar, colores, presupuesto, quién decide (mamá, papá, la quinceañera).','**Probar (máx. 5 vestidos):** empieza por el que más se acerca a lo que describió; observa su cara.','**Elegir:** cuando diga «este», confirma disponibilidad para su fecha y explica qué incluye.','**Cerrar:** «¿Lo separamos hoy?». Separa con el **50 %** o, si el evento es en 6 meses o más, ofrece el **Plan Ahorro XV**.','Registra el resultado en la ficha (**contrató, en seguimiento o no cerró y por qué**) y el **origen de la cita** si no lo tiene.']},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Leí la ficha y el chat antes','Tenía 3–5 vestidos separados','Pregunté fecha, presupuesto y quién decide','Pidió máximo 5 vestidos','Pregunté «¿lo separamos hoy?»','Ofrecí Plan Ahorro si el evento es en 6+ meses','Registré el resultado y el origen']},
  {type:'example',title:'💡 Frase de cierre',content:'«Este vestido es tuyo, te ves divina. Para que nadie más lo aparte para tu fecha, lo dejamos separado hoy con el 50 % y el resto lo vas abonando. ¿Te parece?»'}]),
 P('pa-contrato','✍️ Protocolo 3 · Contrato, firma y factura','Datos completos, firma el mismo día y todo en el ERP.',<FileSignature className="w-5 h-5"/>,'contrato',[
  {type:'intro',title:'🎯 Para qué',content:'El contrato protege a la clienta y a Ámbar. Si está completo y firmado en el ERP, todo lo demás funciona solo: factura en Siigo, recordatorios, agenda del vestido, caja y Tablero CEO.'},
  {type:'steps',title:'📝 Cómo se hace',items:['Crea el contrato desde la cita (**Crear contrato**) para que quede ligado a su origen.','Completa **cédula, celular y correo** de la clienta (sin correo no le llega su contrato ni su factura).','Carga los vestidos por **código**, las fechas (medidas, prueba, entrega, evento) y el valor.','Registra el abono con la **foto del soporte**.','Envía el enlace de firma y que firme **ese mismo día**; al firmar le llega su copia al correo.','En sedes con Siigo activo, elige el tipo de factura: el número llega solo.']},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Contrato creado desde la cita','Cédula, celular y correo completos','Vestidos por código y fechas completas','Abono con soporte','Firmado en el ERP el mismo día','Factura generada']},
  {type:'warning',title:'⚠️ Nunca',content:'**Nunca** firmes en papel sin pasarlo al ERP. **Nunca** dejes un contrato en borrador con plata recibida.'}]),
 P('pa-medidas','📏 Protocolo 4 · Medidas, arreglos y prueba final','Que el vestido le quede perfecto y a tiempo.',<Ruler className="w-5 h-5"/>,null,[
  {type:'steps',title:'📝 Cómo se hace',items:['En la **cita de medidas**, toma las medidas con la guía y anótalas en el contrato.','Si necesita arreglo, regístralo en **Adaptaciones y confección** con fotos y fecha de entrega del proveedor.','Recibe el arreglo, revísalo y márcalo recibido.','En la **prueba final**, verifica talla, largo y detalles; registra el resultado en el contrato.']},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Medidas registradas','Arreglo con fotos y fecha','Arreglo recibido y revisado','Prueba final registrada']}]),
 P('pa-entrega','📦 Protocolo 5 · Entrega y depósito','El vestido sale paz y salvo, revisado y con depósito.',<PackageCheck className="w-5 h-5"/>,'entrega',[
  {type:'steps',title:'📝 Cómo se hace',items:['Verifica que el contrato esté **paz y salvo** (saldo y multas en cero).','Recibe el **depósito** y regístralo con su soporte.','Revisa el vestido con la clienta y toma **fotos** del estado y los accesorios.','Registra la entrega en el ERP y recuérdale la fecha de devolución.']},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Saldo en cero','Depósito registrado con soporte','Fotos del estado del vestido','Entrega registrada','Fecha de devolución recordada']},
  {type:'warning',title:'⚠️ Nunca',content:'**Nunca** entregues un vestido con saldo pendiente.'}]),
 P('pa-devolucion','🔄 Protocolo 6 · Devolución, lavandería y depósito','Recibir, revisar y devolver el depósito a tiempo.',<RotateCcw className="w-5 h-5"/>,'devolucion',[
  {type:'steps',title:'📝 Cómo se hace',items:['Recibe el vestido y revísalo frente a las fotos de la entrega.','Si hay daño, registra el triage con fotos; si llegó tarde, la multa se calcula sola.','Envíalo a lavandería o arreglo en **Adaptaciones y confección**.','Devuelve el depósito (menos descuentos justificados) en máximo **8 días** y regístralo con su soporte.','Finaliza el contrato.']},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Revisado contra las fotos de entrega','Daños o multa registrados','Enviado a lavandería/arreglo','Depósito devuelto en 8 días con soporte','Contrato finalizado']}]),
 P('pa-caja','💵 Protocolo 7 · Caja del día','Todo lo que entra y sale, registrado y cerrado cada día.',<Wallet className="w-5 h-5"/>,'caja',[
  {type:'steps',title:'📝 Cómo se hace',items:['Pasa a la caja **todos** los abonos del día (sugerencias de Cierres de caja).','Registra cada gasto con su soporte en **Gastos, sedes y socios**.','Al final del día cuenta el efectivo y **cierra la caja**.','Revisa el renglón **Siigo al día**: si hay errores, avísale a administración.']},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Abonos del día pasados a caja','Gastos con soporte','Efectivo contado','Caja cerrada','Siigo al día']},
  {type:'warning',title:'⚠️ Por qué importa',content:'Si la caja no se cierra, el **Tablero CEO** no sabe dónde está la plata ni cuánto se ganó la sede.'}]),
 P('pa-inventario','👗 Protocolo 8 · Inventario','Cada vestido con código, talla, foto y costo.',<Shirt className="w-5 h-5"/>,'inventario',[
  {type:'steps',title:'📝 Cómo se hace',items:['Código = **referencia-talla** (ej.: 1046-S, 1046-M) cuando hay varias tallas del mismo modelo.','Sube las **fotos** (frente, espalda, detalle).','Registra el **costo** del vestido (lo que costó).','Si cambia de sede usa **Traslados**; si se daña o se vende, actualiza su estado.']},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Código con talla','Fotos completas','Costo registrado','Estado y sede al día']}]),
 P('pa-seguimiento','💛 Protocolo 9 · Seguimiento, reseñas y aliados','Las que no cerraron vuelven; las felices nos recomiendan.',<HeartHandshake className="w-5 h-5"/>,null,[
  {type:'steps',title:'📝 Cómo se hace',items:['Haz los seguimientos que te muestra **Primeras visitas** el día que corresponden (máximo 5 toques).','Después del evento, pide la **reseña** en Google cuando la clienta califica «Excelente».','Invita a fotógrafos, maquilladoras y organizadores a ser **aliados**: ellos traen clientas sin pagar publicidad.']},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Seguimientos del día hechos','Reseña pedida a las clientas felices','Un aliado nuevo contactado esta semana']}]),
];
