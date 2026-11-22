'use client';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

/** Ámbar Exitoso · Academia Ámbar (Manuales › Manual Ámbar): a short evaluation at the end of each protocol (80 % passes) and the team's
 *  progress. Passing every protocol certifies the person. Results in public.academia_resultados. */
type Q={id:string;p:string;o:string[];ok:number};
const q=(id:string,p:string,o:string[],ok:number):Q=>({id,p,o,ok});
export const EVALUACIONES:Record<string,{titulo:string;preguntas:Q[]}>={
 'pa-atencion':{titulo:'Atención de mensajes',preguntas:[
  q('a1','¿En cuánto tiempo máximo se debe responder un chat?',['1 hora','15 minutos','Al día siguiente'],1),
  q('a2','¿Qué filtro revisas primero en WhatsApp 304?',['Todos los chats','Atender persona de mi sede','Los más antiguos'],1),
  q('a3','Antes de escribirle a la clienta debes…',['Preguntarle de nuevo qué necesita','Leer el resumen de la IA','Enviarle el catálogo completo'],1),
  q('a4','Si pide precios, ¿qué haces?',['Le doy el rango de su categoría e invito a la cita','Le envío todos los precios','No le respondo hasta la cita'],0),
  q('a5','Si la atendiste por llamada o por tu celular…',['No hago nada','Toco «✓ Marcar resuelto»','Borro el chat'],1)]},
 'pa-primera-cita':{titulo:'Primera cita',preguntas:[
  q('b1','¿Cuántos vestidos se separan antes de que llegue?',['1','3 a 5','10 o más'],1),
  q('b2','¿Cuántos vestidos como máximo se prueba?',['5','8','Los que quiera'],0),
  q('b3','¿Qué preguntas en el «descubrir»?',['Solo la talla','Fecha, lugar, colores, presupuesto y quién decide','Su dirección'],1),
  q('b4','Si el evento es en 6 meses o más, ofreces…',['Un descuento sin autorización','El Plan Ahorro XV','Volver otro día'],1),
  q('b5','Al terminar la cita debes registrar…',['Nada','El resultado y el origen de la cita','Solo si contrató'],1)]},
 'pa-contrato':{titulo:'Contrato, firma y factura',preguntas:[
  q('c1','¿Qué datos de la clienta son obligatorios?',['Solo el nombre','Cédula, celular y correo','Solo el celular'],1),
  q('c2','¿Cuándo debe firmar el contrato?',['El mismo día, en el ERP','Cuando recoja el vestido','En papel y luego se ve'],0),
  q('c3','Cada abono se registra…',['Sin soporte','Con la foto del soporte','Solo en el cuaderno'],1),
  q('c4','¿Desde dónde se crea el contrato?',['Desde la cita (Crear contrato)','Desde WhatsApp','Desde Excel'],0),
  q('c5','Un contrato con plata recibida nunca debe quedar…',['Firmado','En borrador','Con correo'],1),
  q('c6','Una clienta pagó $1.500.000, usó 3 citas y no hubo arreglos; desiste. ¿Cuánto se le devuelve?',['$1.500.000','$1.200.000 (se retienen $100.000 por cita usada)','Nada'],1)]},
 'pa-medidas':{titulo:'Medidas, arreglos y prueba final',preguntas:[
  q('d1','¿Dónde se anotan las medidas?',['En el contrato','En un papel','En el chat'],0),
  q('d2','Un arreglo se registra en…',['Adaptaciones y confección, con fotos y fecha','Gastos','No se registra'],0),
  q('d3','Cuando llega el arreglo del proveedor…',['Se entrega directo','Se revisa y se marca recibido','Se guarda sin revisar'],1),
  q('d4','En la prueba final se verifica…',['Talla, largo y detalles','Solo el color','Nada'],0)]},
 'pa-entrega':{titulo:'Entrega y depósito',preguntas:[
  q('e1','¿Se puede entregar un vestido con saldo pendiente?',['Sí, si promete pagar','Nunca','Solo a clientas conocidas'],1),
  q('e2','Para poder entregar el vestido, el depósito debe estar…',['Pagado completo y registrado en «Pago de depósito»','Solo escrito en el contrato','Pendiente: se cobra después'],0),
  q('e3','¿Para qué se toman fotos en la entrega?',['Para redes','Para comparar el estado en la devolución','No se toman'],1),
  q('e4','Al final de la entrega se le recuerda…',['La fecha de devolución','El precio de otros vestidos','Nada'],0)]},
 'pa-devolucion':{titulo:'Devolución, lavandería y depósito',preguntas:[
  q('f1','El vestido devuelto se revisa contra…',['Las fotos de la entrega','La memoria de la asesora','Nada'],0),
  q('f2','¿En cuántos días máximo se devuelve el depósito?',['8 días','30 días','Cuando la clienta lo pida'],0),
  q('f5','Si el vestido vuelve con daños, el valor retenido del depósito…',['Se registra como descuento en «Aprobar devolución» con su motivo','Se devuelve igual y se cobra después','No se registra'],0),
  q('f3','Si llegó tarde, la multa…',['Se calcula sola en el ERP','Se inventa','No se cobra nunca'],0),
  q('f4','Después de lavandería y depósito se…',['Deja abierto el contrato','Finaliza el contrato','Borra el contrato'],1)]},
 'pa-caja':{titulo:'Caja del día',preguntas:[
  q('g1','¿Cada cuánto se cierra la caja?',['Cada semana','Todos los días','Cada mes'],1),
  q('g2','Una clienta te pagó un abono. ¿Dónde lo registras?',['En el contrato, con Registrar Abono y su soporte','Escribiéndolo a mano en Cierres de caja','En un cuaderno y luego en el ERP'],0),
  q('g3','El número del recibo de caja de un abono…',['Lo escribo yo del talonario','Lo asigna Siigo automáticamente','Es el número del contrato'],1),
  q('g4','Después de registrar el abono en el contrato…',['Lo vuelvo a escribir en la caja','Entra solo a la caja, a Siigo y le llega el recibo a la clienta','Le aviso a la contadora para que lo pase'],1),
  q('g5','¿Cómo se cuenta el efectivo al cerrar?',['Escribiendo el total','Escribiendo cuántos billetes hay de cada valor y las monedas','No se cuenta'],1),
  q('g6','El cajón quedó con $900.000 y el tope es $500.000. ¿Qué haces?',['Nada','Al día siguiente consigno al menos $400.000 y lo registro como Consignación a banco con el comprobante','Me llevo el dinero a la casa'],1),
  q('g7','Te equivocaste en el valor de un abono. ¿Qué haces?',['Lo borro','Oprimo Anular con el motivo; administración lo aprueba y registro el correcto','Lo dejo así'],1),
  q('g8','Una clienta quiere dejar $500.000 de depósito en efectivo (tope $300.000)…',['Lo recibo en efectivo','Le pido transferencia o datáfono','No le recibo depósito'],1)]},
 'pa-inventario':{titulo:'Inventario',preguntas:[
  q('h1','Si hay varias tallas del mismo modelo, el código es…',['El mismo para todas','Referencia-talla (ej.: 1046-S)','Un número al azar'],1),
  q('h2','Cada vestido debe tener…',['Fotos y costo','Solo nombre','Nada más'],0),
  q('h3','Si el vestido cambia de sede se usa…',['Traslados','WhatsApp','Nada'],0),
  q('h4','Si se daña o se vende…',['Se actualiza su estado','Se deja igual','Se archiva sin motivo'],0)]},
 'pa-seguimiento':{titulo:'Seguimiento, reseñas y aliados',preguntas:[
  q('i1','¿Cuántos toques de seguimiento como máximo?',['2','5','Ilimitados'],1),
  q('i2','¿Cuándo se pide la reseña en Google?',['Cuando la clienta califica «Excelente»','A todas antes del evento','Nunca'],0),
  q('i3','¿Por qué invitar aliados?',['Traen clientas sin pagar publicidad','Para regalarles vestidos','No sirven'],0)]},
};
const CLAVES=Object.keys(EVALUACIONES);

export function EvaluacionAmbar({clave}:{clave:string}){
 const ev=EVALUACIONES[clave];
 const [resp,setResp]=useState<Record<string,number>>({}),[res,setRes]=useState<{resultado:number;aprobado:boolean}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!ev)return null;
 const enviar=async()=>{setBusy(true);setError('');
  const correctas=ev.preguntas.filter(x=>resp[x.id]===x.ok).length;
  const {data,error:e}=await supabase.rpc('academia_guardar',{p_protocolo:clave,p_correctas:correctas,p_total:ev.preguntas.length,p_respuestas:resp});
  setBusy(false);if(e)setError(e.message);else setRes(data as {resultado:number;aprobado:boolean});};
 const listo=ev.preguntas.every(x=>resp[x.id]!==undefined);
 return <div className="mb-8 p-6 rounded-2xl border border-rose-100 bg-rose-50/40">
  <h3 className="text-lg font-black text-rose-900 mb-1">🎓 Academia Ámbar · Evaluación</h3>
  <p className="text-sm text-gray-600 mb-4">Responde después de leer el protocolo. Se aprueba con 80 % o más; puedes repetirla.</p>
  {ev.preguntas.map((x,i)=><div key={x.id} className="mb-4"><p className="font-bold text-gray-900 text-sm mb-2">{i+1}. {x.p}</p>
   <div className="space-y-1">{x.o.map((o,j)=>{const marcada=resp[x.id]===j;const color=res?(j===x.ok?'border-emerald-500 bg-emerald-50':marcada?'border-rose-500 bg-rose-50':''):marcada?'border-indigo-500 bg-indigo-50':'';
    return <button type="button" key={j} disabled={!!res} onClick={()=>setResp(r=>({...r,[x.id]:j}))} className={`w-full text-left px-3 py-2 rounded-lg border text-sm bg-white ${color}`}>{o}</button>;})}</div></div>)}
  {error&&<p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
  {res?<div className={`p-4 rounded-xl font-black ${res.aprobado?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-800'}`}>{res.aprobado?`✅ Aprobado con ${res.resultado} %`:`Obtuviste ${res.resultado} %. Repasa el protocolo y vuelve a intentarlo.`}
   <button type="button" onClick={()=>{setRes(null);setResp({});}} className="ml-3 underline text-xs">Hacerla de nuevo</button></div>
   :<button type="button" disabled={!listo||busy} onClick={()=>void enviar()} className="px-5 py-2 rounded-xl bg-rose-600 text-white text-sm font-black disabled:opacity-50">{busy?'Guardando…':'Calificar'}</button>}
 </div>;
}

type Persona={id:string;nombre:string;rol:string;sede:string|null;protocolos:Record<string,{mejor:number;aprobado:boolean;intentos:number}>};
export function AcademiaAvance(){
 const [rows,setRows]=useState<Persona[]|null>(null),[sede,setSede]=useState('');
 const load=useCallback(async()=>{const {data}=await supabase.rpc('academia_avance');setRows((data||[]) as Persona[]);},[]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 if(!rows)return <p className="text-sm text-gray-400">Cargando avance…</p>;
 const sedes=[...new Set(rows.map(r=>r.sede||'Sin sede'))];
 const vis=rows.filter(r=>!sede||(r.sede||'Sin sede')===sede);
 return <div className="mb-8 space-y-3">
  {sedes.length>1&&<select className="border rounded-xl px-3 py-2 text-sm bg-white" value={sede} onChange={e=>setSede(e.target.value)}><option value="">Todas las sedes</option>{sedes.map(s=><option key={s}>{s}</option>)}</select>}
  <div className="overflow-x-auto bg-white rounded-2xl border"><table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase text-gray-500"><th className="p-2">Persona</th><th className="p-2">Avance</th>
   {CLAVES.map(k=><th key={k} className="p-2 whitespace-nowrap">{EVALUACIONES[k].titulo}</th>)}</tr></thead>
   <tbody>{vis.map(r=>{const ok=CLAVES.filter(k=>r.protocolos[k]?.aprobado).length;return <tr key={r.id} className="border-t">
    <td className="p-2 font-bold whitespace-nowrap">{r.nombre}<span className="block text-[11px] text-gray-500 font-medium">{r.sede||'Sin sede'} · {r.rol}</span></td>
    <td className="p-2 font-black whitespace-nowrap">{ok===CLAVES.length?'🎓 Certificada':`${ok}/${CLAVES.length}`}</td>
    {CLAVES.map(k=>{const p=r.protocolos[k];return <td key={k} className={`p-2 font-black ${!p?'text-gray-300':p.aprobado?'text-emerald-700':'text-amber-700'}`}>{!p?'—':p.aprobado?`✅ ${p.mejor}%`:`${p.mejor}%`}</td>;})}</tr>;})}</tbody></table></div>
  <p className="text-[11px] text-gray-500">✅ aprobado (80 % o más) · número en amarillo: mejor intento sin aprobar · — sin presentar. Con los {CLAVES.length} protocolos aprobados queda «Certificada Ámbar».</p>
 </div>;
}
