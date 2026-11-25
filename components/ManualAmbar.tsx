'use client';
import {useEffect,useState} from 'react';
import {Trophy,ClipboardCheck,MessageCircle,Sparkles,FileSignature,Ruler,PackageCheck,RotateCcw,Wallet,Shirt,HeartHandshake,GraduationCap} from 'lucide-react';
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
 inventario:[{titulo:'Vestidos con foto',meta:100,unidad:'%',valor:r=>pc(n(r,'vestidos_con_foto'),n(r,'vestidos'))}],
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
  <p className="text-[11px] text-gray-500">🟢 85 o más · 🟡 70 a 84 · 🔴 menos de 70. La operación vale 90 puntos (ventas, conversión, caja, asistencia, atención, contratos completos, inventario y datos limpios) y la auditoría mensual cerrada 10, menos penalizaciones.</p>
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
  {type:'steps',title:'📝 Cómo usarlo',items:[
   '**Paso 1 · Abrir:** entra a **Puntaje Ámbar** y ubica tu sede (número de 0 a 100).',
   '**Paso 2 · Ver el detalle:** toca la sede para ver de dónde sale cada punto (ventas, conversión, caja, asistencia, atención, contratos, inventario y datos).',
   '**Paso 3 · Elegir qué mejorar:** trabaja primero lo que está más lejos de su máximo (suele ser la caja o la conversión).',
   '**Paso 4 · Revisión semanal:** revísalo **cada lunes** en la reunión de sede y acuerda una acción para la semana.',
   '**Paso 5 · Auditoría:** la **auditoría mensual** cerrada suma hasta **10 puntos** durante 45 días.',
   '**Meta:** **85 o más** en todas las sedes.']}]),
 P('pa-auditoria','🔎 Auditoría mensual por sede','Lo que el ERP no ve: la tienda, la atención y una muestra de contratos, caja y vestidos.',<ClipboardCheck className="w-5 h-5"/>,'auditoria',[
  {type:'intro',title:'🎯 Para qué',content:'Una vez al mes, administración o contabilidad revisa cada sede con esta lista. Cada punto es «cumple» o «no cumple» con su nota. Al cerrarla, el resultado vale 10 puntos del Puntaje Ámbar por 45 días y queda en el historial.'},
  {type:'steps',title:'📝 Cómo hacerla',items:[
   '**Paso 1 · Abrir:** entra a **Auditoría mensual** y elige la **sede** y el **mes**.',
   '**Paso 2 · Recorrer la tienda:** revisa orden, exhibición y atención.',
   '**Paso 3 · Tomar la muestra:** revisa **5 contratos** del mes y **10 vestidos** del inventario.',
   '**Paso 4 · Calificar:** marca cada punto como «cumple» o «no cumple». Si no cumple, escribe qué encontraste y qué se debe corregir.',
   '**Paso 5 · Conclusiones:** escribe las conclusiones y los compromisos acordados con la líder de la sede.',
   '**Paso 6 · Guardar o cerrar:** usa **Guardar borrador** si te falta algo; cuando estén todos los puntos, toca **Cerrar la auditoría**. El resultado queda en el historial y suma al Puntaje Ámbar.']}]),
 P('pa-academia','🎓 Academia Ámbar','Capacitación del equipo: cada protocolo termina con una evaluación; con todos aprobados, «Certificada Ámbar».',<GraduationCap className="w-5 h-5"/>,'academia',[
  {type:'intro',title:'🎯 Para qué',content:'Que todas atiendan, vendan y operen igual en cada sede. Cada persona lee el protocolo, presenta su evaluación al final y se aprueba con 80 % o más. Quien aprueba los 9 protocolos queda «Certificada Ámbar».'},
  {type:'steps',title:'📝 Cómo se hace',items:[
   '**Paso 1 · Primera semana:** toda persona nueva presenta los **9 protocolos** en su primera semana.',
   '**Paso 2 · Leer:** abre cada protocolo y léelo completo.',
   '**Paso 3 · Evaluación:** al final del protocolo responde la **evaluación**. Se aprueba con **80 % o más** y puedes repetirla.',
   '**Paso 4 · Certificación:** con los 9 protocolos aprobados quedas **«Certificada Ámbar»**.',
   '**Paso 5 · Seguimiento de la líder:** cada lunes la líder revisa aquí el avance de su equipo.',
   '**Paso 6 · Cambios:** cuando se ajusta un protocolo, todas vuelven a presentar esa evaluación.']}]),
 P('pa-atencion','💬 Protocolo 1 · Atención de mensajes','WhatsApp, Instagram y Messenger: responder rápido, con calidez, y llevar a la cita.',<MessageCircle className="w-5 h-5"/>,'atencion',[
  {type:'intro',title:'🎯 Para qué',content:'Cada mensaje es una clienta que quiere su vestido. La IA contesta al instante y la asesora entra cuando el chat queda marcado «Atender persona». La meta es que ningún chat se enfríe y que cada conversación termine con una cita agendada.'},
  {type:'steps',title:'📝 Cómo se hace',items:[
   '**Paso 1 · Abrir los chats:** entra a **WhatsApp 304** al llegar, a mediodía y antes de cerrar.',
   '**Paso 2 · Filtrar:** elige el filtro **Atender persona** de tu sede y atiende esos primero.',
   '**Paso 3 · Leer antes de escribir:** lee el resumen de la IA y el chat; no vuelvas a preguntar lo que la clienta ya dijo.',
   '**Paso 4 · Saludar y responder:** salúdala con su nombre y responde **exactamente** lo que preguntó.',
   '**Paso 5 · Precios:** si pide precios, da el rango de su categoría y explica que en la cita se eligen con calma.',
   '**Paso 6 · Invitar a la cita:** «¿Te muestro los horarios para que vengas a medírtelos?».',
   '**Paso 7 · Agendar:** agenda dentro del chat con la lista de horarios y pídele su **correo** para enviarle la confirmación.',
   '**Paso 8 · Cerrar el chat:** si lo resolviste por fuera (celular o llamada), toca **✓ Marcar resuelto**.']},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Respondí en menos de 15 minutos','Usé su nombre','Respondí lo que preguntó','Ofrecí la cita con horarios','Pedí el correo','Marqué resuelto si lo atendí por fuera']},
  {type:'warning',title:'⚠️ Nunca',content:'**Nunca** dejes un chat «Atender persona» para el día siguiente. **Nunca** prometas un vestido o un descuento sin confirmarlo en el ERP.'}]),
 P('pa-primera-cita','✨ Protocolo 2 · Primera cita','La experiencia en tienda que convierte una visita en contrato.',<Sparkles className="w-5 h-5"/>,'primera_cita',[
  {type:'intro',title:'🎯 Para qué',content:'La primera cita es el momento de la verdad: la clienta viene a enamorarse de su vestido. Una cita bien preparada y bien cerrada es la diferencia entre 2 y 6 contratos de cada 10.'},
  {type:'steps',title:'📝 Antes de que llegue',items:[
   '**Paso 1 · Leer la ficha:** abre **Primeras visitas** y lee su ficha: tipo de vestido, fecha del evento, de dónde llegó y lo que habló en el chat.',
   '**Paso 2 · Separar vestidos:** en **Agenda de vestidos** separa **3 a 5 vestidos** de su talla y estilo, disponibles para su fecha.',
   '**Paso 3 · Preparar el espacio:** ten listos el espejo, el probador y una bebida.']},
  {type:'steps',title:'📝 Durante la cita',items:[
   '**Paso 4 · Bienvenida (2 min):** preséntate, felicítala por su evento y pregúntale cómo lo imagina.',
   '**Paso 5 · Descubrir (5 min):** pregunta fecha, lugar, colores, presupuesto y quién decide (mamá, papá o la quinceañera).',
   '**Paso 6 · Probar (máximo 5 vestidos):** empieza por el que más se acerca a lo que describió y observa su reacción.',
   '**Paso 7 · Elegir:** cuando diga «este», confirma la disponibilidad para su fecha y explica qué incluye.',
   '**Paso 8 · Cerrar:** pregunta «¿Lo separamos hoy?». Separa con el **50 %** o, si el evento es en 6 meses o más, ofrece el **Plan Ahorro XV**.',
   '**Paso 9 · Registrar el resultado (el mismo día):** en **Primeras visitas** marca si vino y si alquiló (**contrató, en seguimiento o no cerró y por qué**). Así quedas como la asesora de esa visita.',
   '**Paso 10 · Origen:** si la ficha no tiene el **origen de la cita**, regístralo.',
   '**Ojo:** si no registras el resultado, a las 48 horas queda como «no asistió» y sale en **Pendientes de la sede**.']},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Leí la ficha y el chat antes','Tenía 3–5 vestidos separados','Pregunté fecha, presupuesto y quién decide','Pidió máximo 5 vestidos','Pregunté «¿lo separamos hoy?»','Ofrecí Plan Ahorro si el evento es en 6+ meses','Registré el resultado y el origen']},
  {type:'example',title:'💡 Frase de cierre',content:'«Este vestido es tuyo, te ves divina. Para que nadie más lo aparte para tu fecha, lo dejamos separado hoy con el 50 % y el resto lo vas abonando. ¿Te parece?»'}]),
 P('pa-contrato','✍️ Protocolo 3 · Contrato, firma y factura','Datos completos, firma el mismo día y todo en el ERP.',<FileSignature className="w-5 h-5"/>,'contrato',[
  {type:'intro',title:'🎯 Para qué',content:'El contrato protege a la clienta y a Ámbar. Si está completo y firmado en el ERP, todo lo demás funciona solo: factura en Siigo, recordatorios, agenda del vestido, caja y Tablero CEO.'},
  {type:'steps',title:'📝 Cómo se hace',items:[
   '**Paso 1 · Crear el contrato:** desde la cita en **Primeras visitas**, toca **Crear contrato** para que quede ligado a su origen.',
   '**Paso 2 · Datos de la clienta:** completa **cédula, celular y correo**. Sin correo no le llega su contrato ni su factura.',
   '**Paso 3 · Vestidos:** cárgalos por **código**.',
   '**Paso 4 · Fechas:** escribe las fechas de **medidas, prueba final, entrega y evento**.',
   '**Paso 5 · Valor:** escribe el valor del alquiler.',
   '**Paso 6 · Adicionales:** en **Qué incluye además del vestido** agrega cada adicional con su valor (Pre XV, lavandería, moños, accesorios, vestido de cambio…). Cada uno sale en la factura.',
   '**Paso 7 · Depósito:** en **Depósito** escribe solo el valor **pactado**; no se da por pagado. Cuando la clienta lo pague, regístralo en **Depósitos › Pago de depósito** (Protocolo 5).',
   '**Paso 8 · Abono:** registra el abono con la **foto del soporte** (Protocolo 7). Si aún no tienes el comprobante, marca **«El soporte lo adjunto después»** y adjúntalo desde el contrato o desde Cierres de caja **antes de cerrar la caja de hoy**.',
   '**Paso 9 · Factura:** en sedes con Siigo activo, elige el tipo de factura. El **número de factura lo pone Siigo**: no se escribe.',
   '**Paso 9b · Antes de guardar:** escoge la **fecha de elaboración** en el calendario y revisa la **Verificación final**: clienta, vestidos, fechas, valores y depósito. Solo guarda cuando todo esté correcto.',
   '**Paso 10 · Firma:** al guardar, el ERP le envía **solo** el contrato a su **correo** para firmar (por eso el correo debe estar bien escrito). Logra que firme **ese mismo día**: en tu equipo, desde su correo o con el enlace que le mandas por WhatsApp. Si no firma, el ERP le recuerda por correo a las 24 horas, a los 3 días y a los 7 días. Al firmar le llega su copia al correo.',
   '**Si después cambias el valor o agregas un adicional:** el ERP **corrige la misma factura** en Siigo (o hace factura adicional o nota crédito si ya tiene recibos). Nunca hagas otra factura a mano.',
   '**Borradores sin firmar:** no se borran solos. Si hay que eliminar un contrato, solo lo hace la **líder o el franquiciado de la sede, contabilidad o administración** (Gestionar › Eliminar), con motivo. **Un contrato con abonos, depósito o movimientos de caja no se puede eliminar:** primero se anulan los abonos o se devuelve el dinero, o se deja como cancelado.',
   '**Si hay que corregir la fecha de elaboración:** en el detalle del contrato › **Fechas del contrato**, con motivo; puede ser cualquier fecha pasada (nunca futura). Si la caja de ese día ya está cerrada, primero hay que reabrirla.']},
  {type:'steps',title:'📝 Si la clienta desiste',items:[
   '**Paso 1 · Por escrito:** pide el desistimiento **por escrito** por los canales oficiales.',
   '**Paso 2 · Desistir:** en el contrato toca **Desistir** y escribe el motivo.',
   '**Paso 3 · Citas y arreglos:** confirma las **citas usadas** (primera vez, medidas, prueba final) y el valor de los **arreglos** ya hechos.',
   '**Paso 4 · Liquidación:** el ERP calcula **pagado − ($100.000 por cita usada + arreglos) = a devolver**. El valor por cita está en Configuración › Parámetros.',
   '**Paso 5 · Devolver:** devuelve el dinero y regístralo en **Depósitos y devoluciones › Desistimientos › Registrar devolución**, con medio, cuenta y **comprobante**. Sale de la caja como «Devolución por desistimiento» (no es gasto: baja el ingreso).',
   '**Paso 6 · Siigo (Contabilidad):** hace la **nota crédito** por lo devuelto; la factura queda por lo retenido. Lo pendiente sale en **Novedades contables**.']},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Contrato creado desde la cita','Cédula, celular y correo completos','Vestidos por código y fechas completas','Abono con soporte','Firmado en el ERP el mismo día','Factura generada']},
  {type:'warning',title:'⚠️ Nunca',content:'**Nunca** firmes en papel sin pasarlo al ERP. **Nunca** dejes un contrato en borrador con plata recibida: después de 24 horas sale como alerta en **Pendientes de la sede** y en **Novedades contables** hasta que se firme o se cierre.'}]),
 P('pa-medidas','📏 Protocolo 4 · Medidas, arreglos y prueba final','Que el vestido le quede perfecto y a tiempo.',<Ruler className="w-5 h-5"/>,null,[
  {type:'steps',title:'📝 Cómo se hace',items:[
   '**Paso 1 · Medidas:** en la **cita de medidas** toma las medidas con la guía y anótalas en el contrato.',
   '**Paso 2 · Registrar el arreglo:** si necesita arreglo, regístralo en **Operaciones › Adaptaciones y confección** con el vestido, el contrato, fotos, **quién lo hace**, **cuánto cuesta** y la fecha de entrega del proveedor.',
   '**Paso 3 · Recibir el arreglo:** cuando vuelva, revísalo y márcalo **recibido**. El costo es obligatorio (0 si lo hizo la sede) y queda pendiente en **Pagos a proveedores**.',
   '**Paso 4 · Prueba final:** verifica talla, largo y detalles, y registra el resultado en el contrato.',
   '**Ojo:** no se paga sastrería por la caja sin registrarla en Adaptaciones y confección; si se hace, sale en Novedades contables.']},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Medidas registradas','Arreglo con fotos y fecha','Arreglo recibido y revisado','Prueba final registrada']}]),
 P('pa-entrega','📦 Protocolo 5 · Entrega y depósito','El vestido sale paz y salvo, revisado y con depósito.',<PackageCheck className="w-5 h-5"/>,'entrega',[
  {type:'steps',title:'📝 Cómo se hace',items:[
   '**Paso 1 · Paz y salvo:** verifica que el contrato tenga **saldo y multas en cero**.',
   '**Paso 2 · Depósito:** registra cada pago del depósito en **Depósitos › Pago de depósito** (paso a paso abajo). El ERP **solo deja entregar** con el depósito **pagado completo** (estado «Pagado – pendiente de devolución»).',
   '**Paso 3 · Revisar con la clienta:** revisa el vestido con ella y toma **fotos** del estado y de los accesorios.',
   '**Paso 4 · Registrar la entrega:** registra la entrega en el ERP.',
   '**Paso 5 · Fecha de devolución:** recuérdale a la clienta la fecha en que debe devolverlo.']},
  {type:'steps',title:'💰 Paso a paso: registrar un depósito recibido',items:[
   '**Paso 1 · Menú:** en el menú de la izquierda (☰ en el celular) toca **DEPÓSITOS Y DEVOLUCIONES**. Se abre la pantalla **«Depósitos y devoluciones»**.',
   '**Paso 2 · Buscar el contrato:** baja hasta la tabla de contratos. En el buscador **«Cliente, documento o contrato»** escribe el nombre de la clienta, su cédula o el número del contrato (ej.: VILL-2026-0245).',
   '**Paso 3 · Filtrar (opcional):** usa la lista **«Todas las sedes disponibles»** para ver solo tu sede y la lista **«Todos los depósitos»** para ver, por ejemplo, solo los que están en «Pendiente de pago».',
   '**Paso 4 · Abrir el registro:** en la fila del contrato, columna **Gestión**, toca **«+ Pago de depósito»**. Se abre la ventana **«Pago de depósito · falta $…»**.',
   '**Si el botón dice «Adjuntar comprobante»:** el contrato tiene un depósito anterior sin soporte. Súbelo primero; después aparece «Pago de depósito».',
   '**Si el botón está gris:** el depósito pactado ya está completo o está en $0. Para subir el valor pactado toca **«Modificar valor»** (solo si tienes ese permiso) o pídeselo a administración. Si se olvidó al crear el contrato, la líder o el franquiciado lo ponen en **Editar contrato** aunque la caja de ese día ya esté cerrada (el pactado no mueve la caja); nunca puede quedar por debajo de lo ya pagado.',
   '**Paso 5 · Monto recibido (COP):** escribe lo que la clienta te pagó **en este momento**. El sistema no deja poner más de lo que falta.',
   '**Paso 6 · Fecha de recepción:** elige el día en que **realmente** recibiste el dinero (no el día en que lo registras).',
   '**Paso 7 · Método:** elige **Efectivo**, **Transferencia**, **Tarjeta** u **Otro**.',
   '**Paso 8 · Cuenta o caja:** en **«Cuenta o caja de la sede donde se movió el dinero»** elige la cuenta bancaria, Nequi, datáfono o la caja de la sede donde entró. Es obligatoria.',
   '**Paso 9 · Observaciones (opcional):** escribe algo útil, por ejemplo «primer pago» o «pago completo».',
   '**Paso 10 · Comprobante:** en **«Comprobante obligatorio»** toca y sube el pantallazo de la transferencia, el voucher del datáfono o la foto del recibo firmado (PDF, JPG o PNG, máximo 10 MB).',
   '**Paso 11 · Guardar:** toca **«Registrar depósito recibido»**. Espera a que deje de decir «Registrando…» y salga el mensaje de confirmación arriba. No cierres antes.',
   '**Paso 12 · Pagos por partes:** si la clienta paga en varias partes, repite los pasos 4 a 11 **por cada pago**, cada uno con su fecha, método, cuenta y comprobante. También puedes tocar **«Historial»** y abajo **«Registrar dinero adicional»**. Cada pago queda guardado y saca su propio recibo; no se borra el anterior.',
   '**Paso 13 · Consultar cuánto ha pagado:** en la tabla mira **Depósito pactado / pagado** (abajo dice «Pagado: $… · falta $…»), **Devuelto / descuento**, **Disponible** (lo que queda por devolver) y **Estado** (Pendiente de pago, Pago parcial, Pagado – pendiente de devolución o Devuelto).',
   '**Paso 14 · Ver el detalle:** toca **«Historial»** en la fila del contrato. Abajo sale **«Historial de depósitos y devoluciones»** con cada pago (fecha, valor, método) y el botón **«Ver comprobante»**, más los totales **Pactado, Pagado, Estado y Disponible**.',
   '**Paso 15 · Verificar en Siigo (Contabilidad):** entra a **CIERRES DE CAJA**, pestaña **«Cuadre con Siigo»**. Elige la **Sede** y las fechas **Desde / Hasta** del día del pago y busca el contrato: la columna **Siigo** debe mostrar el depósito. El recibo se envía unos 10 a 15 minutos después de guardar. Si sale algo en **Novedad**, también aparece en **Novedades contables** para resolverlo.']},
  {type:'steps',title:'📝 Depósito que ya se devolvió (registrar después)',items:[
   '**Paso 1 · Abrir el contrato:** menú **DEPÓSITOS Y DEVOLUCIONES** y busca el contrato por número o nombre de la clienta. El vestido debe figurar **devuelto**.',
   '**Paso 2 · Primero el ingreso:** si en **Depósito pactado / pagado** ya dice pagado completo, pasa al paso 3. Si falta, toca **Pago de depósito** con valor, medio, cuenta, la **fecha real** en que pagó (hoy o una fecha pasada) y el comprobante.',
   '**Paso 3 · Aprobar la devolución:** toca **Aprobar devolución del depósito** y, si hubo daños, escribe el descuento y su motivo.',
   '**Paso 4 · Si fue en efectivo:** toca **Registrar devolución en efectivo**, pon la **fecha real** de la devolución y adjunta el **recibo firmado** por la clienta.',
   '**Paso 5 · Si fue por transferencia:** llena los datos del titular y guarda; luego, en la solicitud, toca **Pagar** con la **fecha real** de la transferencia y su comprobante.',
   '**Paso 6 · Confirmar:** marca que el vestido se recibió y guarda. Queda **Devuelto** y la salida entra en la caja de ese día.',
   '**Paso 7 · Si la caja de ese día ya está cerrada:** la líder la reabre, registra la devolución y la vuelve a cerrar con su conteo.',
   '**Paso 8 · Si el depósito figura pagado pero nunca entró a la caja:** envía a administración el contrato, la fecha, el medio y el comprobante; administración lo registra.']},
  {type:'warning',title:'⚠️ Depósitos',content:'El depósito **nunca** se registra en Caja como movimiento suelto ni como abono del contrato: **siempre** por **Depósitos y devoluciones › Pago de depósito**, para que quede en la caja con su cuenta y salga su recibo en Siigo.'},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Saldo en cero','Depósito pagado completo en «Pago de depósito»','Fotos del estado del vestido','Entrega registrada','Fecha de devolución recordada']},
  {type:'warning',title:'⚠️ Nunca',content:'**Nunca** entregues un vestido con saldo pendiente.'}]),
 P('pa-devolucion','🔄 Protocolo 6 · Devolución, lavandería y depósito','Recibir, revisar y devolver el depósito a tiempo.',<RotateCcw className="w-5 h-5"/>,'devolucion',[
  {type:'steps',title:'📝 Cómo se hace',items:[
   '**Paso 1 · Recibir:** recibe el vestido y revísalo frente a las fotos de la entrega.',
   '**Paso 2 · Daños o retraso:** si hay daño, registra el triage con fotos; si llegó tarde, la multa se calcula sola.',
   '**Paso 3 · Lavandería o arreglo:** envíalo a lavandería o arreglo en **Adaptaciones y confección**.',
   '**Paso 4 · Aprobar la devolución:** con el vestido en la tienda, entra a **DEPÓSITOS Y DEVOLUCIONES**, busca el contrato y toca **Aprobar devolución**.',
   '**Paso 5 · Descuento:** si hay daños o faltantes, escribe el **descuento (retención)** y su motivo. Lo retenido no se devuelve: va a Siigo como **Ingreso por daños**.',
   '**Paso 6 · Cómo se devuelve:** elige el método y **desde qué cuenta** se devuelve, y completa los datos bancarios de la clienta si es por transferencia.',
   '**Paso 7 · Pagar:** devuelve el depósito en máximo **8 días** con su soporte. Pon la **fecha real** en que salió el dinero (hoy o una fecha pasada); si ese día de caja ya está cerrado, el ERP te pide reabrirlo con administración. El estado pasa a **Devuelto**.',
   '**Paso 8 · Finalizar:** finaliza el contrato.']},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Revisado contra las fotos de entrega','Daños o multa registrados','Enviado a lavandería/arreglo','Depósito devuelto en 8 días con soporte','Contrato finalizado']}]),
 P('pa-caja','💵 Protocolo 7 · Caja del día','Todo lo que entra y sale, registrado y cerrado cada día.',<Wallet className="w-5 h-5"/>,'caja',[
  {type:'intro',title:'🎯 Para qué',content:'Que cada peso que entra o sale de la tienda quede registrado el mismo día, con su soporte, y que administración pueda saber desde lejos cuánto hay en cada caja.'},
  {type:'steps',title:'📝 Registrar un abono',items:[
   '**Paso 1 · Cuándo:** registra el abono **en el momento en que lo recibes**, nunca después.',
   '**Paso 2 · Abrir el contrato:** búscalo en **Inicio** y toca **Registrar Abono**.',
   '**Paso 3 · Monto y medio:** escribe el **monto** y elige el **medio de pago**.',
   '**Paso 4 · Fecha del pago:** elige el día en que la clienta pagó (hoy o una fecha pasada; si esa caja ya está cerrada, primero se reabre). El **número de recibo lo pone Siigo**: no se escribe.',
   '**Paso 5 · Soporte:** sube el pantallazo de la transferencia, el voucher del datáfono o la foto del recibo firmado. Sin soporte no deja guardar.',
   '**Paso 6 · Guardar:** el abono **entra solo a la caja del día**, se envía solo a Siigo y a la clienta le llega su recibo por WhatsApp. **No lo vuelvas a escribir en Cierres de caja.**',
   '**Nota:** los abonos que administración trae desde **Siigo** (con su factura o recibo) ya tienen soporte y no salen en «Abonos sin soporte».']},
  {type:'steps',title:'📝 Depósitos, correcciones y gastos',items:[
   '**Depósito:** entra a la caja **solo** con **Depósitos › Pago de depósito**, con la cuenta o caja donde llegó (Protocolo 5). Nada se registra solo al firmar ni al entregar. En efectivo va **hasta $300.000**; por encima, por transferencia o datáfono.',
   '**Corregir el medio de pago de un abono:** en **Cierres de caja**, con la caja del día abierta, **edita el movimiento** (medio y cuenta). El ERP lo corrige también en Siigo. El campo «Métodos de pago» del contrato es solo informativo.',
   '**Gasto · Paso 1:** en **Cierres de caja** registra el gasto como **egreso** con su comprobante.',
   '**Gasto · Paso 2:** toca el botón **Siigo** del gasto y elige tipo de documento, NIT del proveedor y **cuenta contable** (buscar o «Ver todas»). Llega a Siigo al cerrar la caja.',
   '**Otro ingreso:** debe decir de dónde viene el dinero.']},
  {type:'warning',title:'⏳ Hasta el 10 de diciembre: la líder hace lo contable de su sede',content:'Mientras nos ponemos al día, la **asesora líder** puede, **solo en su sede**: registrar gastos y pagos fijos, pasar gastos a Siigo, resolver las **Novedades contables** («Ya lo hice en Siigo»), corregir abonos y depósitos en días ya cerrados, **cambiar el valor o la categoría** de un movimiento de caja, **condonar multas**, registrar **devoluciones históricas por desistimiento** y **aprobar anulaciones de abonos que pidió otra persona** (nunca las suyas). Todo queda con su nombre y lo revisa administración cada noche. El 11 de diciembre vuelve solo a contabilidad.'},
  {type:'warning',title:'📍 Pereira: aprueba el franquiciado',content:'En **Pereira** todo lo contable de la sede (anulaciones de abonos, novedades contables, correcciones en días cerrados, valor o categoría de movimientos de caja, multas, desistimientos y devoluciones de depósito por transferencia) lo aprueba el **franquiciado**, no contabilidad general.'},
  {type:'steps',title:'📝 Novedades contables (administración, contabilidad y franquiciado)',items:[
   '**Paso 1 · Abrir:** en **Inicio** o en **Cierres de caja** abre el recuadro **Novedades contables**.',
   '**Paso 2 · Elegir el grupo:** toca el tipo de novedad: contratos sin factura en Siigo, facturas con valor distinto, **facturas de Siigo por corregir**, documentos con error, acciones pendientes en Siigo, abonos sin medio o cuenta, cajas sin cerrar, cierres con diferencia o **contratos en borrador**.',
   '**Paso 3 · Ver quién resuelve:** cada novedad dice si la resuelve la Sede, Contabilidad o Administración.',
   '**Paso 4 · Resolver:** toca **Ir a resolver**: te lleva al contrato o a la caja exacta.',
   '**Paso 5 · Facturas de Siigo por corregir:** el contrato cambió de valor, vestido, fechas o forma de pago después de facturar y Siigo no dejó editarla. Corrígela a mano en Siigo, verifica el saldo y toca **Ya lo hice en Siigo**.',
   '**Paso 6 · Lo hecho en Siigo:** cuando Contabilidad anula o ajusta algo directamente en Siigo, toca **Ya lo hice en Siigo** para que salga de la lista.',
   '**Borradores:** la sede los firma o los cierra; los que están sin factura, sin abono, duplicados o con fecha imposible los revisa Contabilidad.']},
  {type:'steps',title:'🏦 Conciliación bancaria (contabilidad, cada mes)',items:[
   '**Paso 1 · Abrir:** entra a **Finanzas › Bancos y conciliación** y elige la cuenta.',
   '**Paso 2 · Extracto:** descarga el extracto del mes en la banca en línea en **CSV** y súbelo.',
   '**Paso 3 · Columnas:** confirma cuáles son las columnas de fecha, descripción y valor.',
   '**Paso 4 · Cruce automático:** el ERP cruza solo cada movimiento del banco con el del ERP (mismo valor, hasta 4 días de diferencia).',
   '**Paso 5 · Movimientos del banco sin cruzar:** crúzalos a mano o ignóralos con el motivo (ej.: comisión bancaria). Lo que quede sin cruzar más de 3 días sale en **Novedades contables**.',
   '**Paso 6 · Del ERP sin respaldo en el banco:** revisa la plata que el ERP dice que entró o salió y el banco no muestra.',
   '**Paso 7 · Cuenta de depósitos:** compara su saldo con **Depósitos que deberían estar en custodia**.']},
  {type:'steps',title:'📊 Estado de resultados (administración, contabilidad y sedes)',items:[
   '**Paso 1 · Abrir:** entra a **Finanzas › Gastos, entre sedes y socios › Estado de resultados**.',
   '**Paso 2 · Fechas:** elige el periodo (por defecto, el mes en curso).',
   '**Paso 3 · Leer por sede:** mira **Ingresos**, **Gastos**, **Utilidad** y **Margen**. Toca una sede para ver el detalle por concepto.',
   '**Paso 4 · Punto de equilibrio:** abajo ves cuánto debe recibir cada sede para cubrir sus gastos fijos, si lo **supera** o cuánto le **falta**, y cuántos contratos necesita.',
   '**Paso 5 · Fuente Siigo (administración y contabilidad):** cambia la **Fuente** a **Siigo (facturas y compras)** para ver lo facturado y las compras de Siigo desde abril.',
   '**Paso 6 · Trazabilidad de ventas:** con la fuente Siigo, abajo ves por sede lo vendido, los abonos del ERP, lo facturado y cobrado en Siigo y lo **sin rastro**. Toca la sede para revisar los contratos uno por uno.',
   '**Qué no cuenta:** depósitos en garantía, base de caja, consignaciones, dinero entre sedes o socios ni retiros de utilidades. Lo retenido de un depósito por daños sí cuenta como ingreso.',
   '**Para que la utilidad sea real:** toda sede registra **todos sus gastos** (arriendo, nómina, servicios, insumos) en Gastos o en Cierres de caja con su comprobante.']},
  {type:'steps',title:'📝 Cerrar la caja (todos los días)',items:[
   '**Paso 1 · Pendientes:** revisa el recuadro **Pendientes de la sede** y resuelve lo que diga.',
   '**Paso 2 · Contar:** cuenta el cajón y escribe **cuántos billetes hay de cada valor** y el valor de las monedas; el sistema suma.',
   '**Paso 3 · Diferencia:** si hay diferencia, escribe el motivo y sube la **foto de los billetes**.',
   '**Paso 4 · Cerrar:** toca **Cerrar caja**.',
   '**Paso 5 · Consignar:** hoy **no hay tope de efectivo** en el cajón. Cuando consignes efectivo al banco, regístralo como **Consignación a banco**, eligiendo **el banco donde se consignó** y con el comprobante, para que el cajón cuadre.']},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Abonos registrados en el contrato con soporte, en el momento','No escribí abonos a mano en la caja','Gastos con comprobante y su cuenta contable','Conteo por billetes al cerrar','Diferencias explicadas con foto','Consignación si pasé el tope de efectivo','Pendientes de la sede en cero']},
  {type:'warning',title:'⚠️ Nunca',content:'**Nunca** recibas dinero sin registrarlo en el contrato. **Nunca** anules un abono para corregirlo sin motivo: la anulación la aprueba administración. **Nunca** dejes la caja sin cerrar: la revisión de cada noche le avisa a administración.'}]),
 P('pa-inventario','👗 Protocolo 8 · Inventario','Cada vestido con código, talla, fotos y estilo.',<Shirt className="w-5 h-5"/>,'inventario',[
  {type:'steps',title:'📝 Cómo se hace',items:[
   '**Paso 1 · Código:** usa **referencia-talla** (ej.: 1046-S, 1046-M) cuando hay varias tallas del mismo modelo.',
   '**Paso 2 · Datos:** escribe talla, color, tipo y precio de alquiler.',
   '**Paso 3 · Fotos:** sube las **3 fotos**: frente, espalda y detalle.',
   '**Paso 4 · Estilo y tela:** la IA los llena desde la foto de frente (silueta, corpiño, escote, mangas, detalles y tela). Revísalos y corrígelos si no coinciden: con eso la IA de WhatsApp recomienda vestidos.',
   '**Paso 5 · Cambio de sede:** usa **Traslados**.',
   '**Paso 6 · Daño o venta:** actualiza su estado.',
   '**Paso 7 · Rotación:** en **Inventario › Rotación** ves cuánto ha producido cada vestido; filtra por sede y por tipo.',
   '**Paso 8 · Toma física (cada mes):** en **Inventario › Toma física** inicia la toma, marca cada vestido por su código y ciérrala. Los que no aparecen quedan como faltantes en Novedades contables hasta encontrarlos.']},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Código con talla','Fotos completas','Estilo revisado','Estado y sede al día']}]),
 P('pa-seguimiento','💛 Protocolo 9 · Seguimiento, reseñas y aliados','Las que no cerraron vuelven; las felices nos recomiendan.',<HeartHandshake className="w-5 h-5"/>,null,[
  {type:'steps',title:'📝 Cómo se hace',items:[
   '**Paso 1 · Seguimientos del día:** en **Primeras visitas › Seguimientos** haz los que corresponden a hoy (máximo 5 toques por clienta).',
   '**Paso 2 · Registrar el resultado:** anota qué pasó en cada uno (agendó, pidió precios, no contestó, desistió…).',
   '**Paso 3 · No llamar a las cerradas:** cada mañana el ERP cierra solo las clientas cuyo **evento ya pasó** o que **ya firmaron contrato**.',
   '**Paso 4 · Reseña:** después del evento, cuando la clienta califica «Excelente», pídele la **reseña** en Google.',
   '**Paso 5 · Aliados:** invita a fotógrafos, maquilladoras y organizadores a ser **aliados**: traen clientas sin pagar publicidad.']},
  {type:'checklist',title:'✅ Lista de chequeo',items:['Seguimientos del día hechos','Reseña pedida a las clientas felices','Un aliado nuevo contactado esta semana']}]),
];
