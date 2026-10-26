// Ally contract text and data validation (shared by the signing page and the server).
/** Version of the clause text; a signed copy keeps the exact text it was signed with. */
export const ALLY_CONTRACT_VERSION='2026-10-14';

export type AllyContractConfig={representante:string|null;representante_cedula:string|null;representante_ciudad_cedula:string|null;nit:string|null;direccion:string|null;ciudad:string|null;correo:string|null;telefono:string|null;deposito_por_vestido:number|null;mora_por_dia:number|null;clausula_penal:number|null;cuenta_redes:string|null};
export type AllyProfile={nombre:string;cedula:string;representante:string;celular:string;correo:string;direccion:string;ciudad:string;banco:string;tipo_cuenta:string;numero_cuenta:string};
export type ContractSection={titulo:string;parrafos:string[];lista?:string[]};

export const CONFIG_FIELDS:[keyof AllyContractConfig,string][]=[
 ['representante','Nombre completo del representante de AMBAR'],['representante_cedula','Cédula del representante'],['representante_ciudad_cedula','Ciudad de expedición de la cédula'],
 ['nit','NIT / RUT de AMBAR'],['direccion','Dirección de AMBAR'],['ciudad','Ciudad de AMBAR'],['correo','Correo de AMBAR'],['telefono','Teléfono de AMBAR'],
 ['deposito_por_vestido','Depósito por vestido (COP)'],['mora_por_dia','Valor por día de retraso (COP)'],['clausula_penal','Cláusula penal (COP)'],['cuenta_redes','Cuenta de redes sociales (sin @)'],
];
/** Fields of the AMBAR configuration still empty; the contract cannot be sent until they are filled. */
export const missingConfig=(c:Partial<AllyContractConfig>|null)=>CONFIG_FIELDS.filter(([k])=>c?.[k]===null||c?.[k]===undefined||String(c[k]).trim()==='').map(([,label])=>label);

const money=(v:number|null)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(v||0));
const longDate=(d:Date)=>d.toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Bogota'});

/** Ley 1581 de 2012: data-processing authorization signed by Aliados Directos. */
export const DATA_AUTHORIZATION:ContractSection={titulo:'Autorización de tratamiento de datos personales',parrafos:['En los términos de la Ley 1581 de 2012 y sus decretos reglamentarios, EL ALIADO autoriza a AMBAR para recolectar, almacenar, usar y actualizar sus datos personales (nombre, cédula, celular, correo, dirección y cuenta bancaria) con la finalidad de gestionar esta alianza, vincularlo a los contratos de clientes, liquidar y pagar sus comisiones y contactarlo sobre ellas. EL ALIADO puede conocer, actualizar, rectificar y suprimir sus datos y revocar esta autorización escribiendo al correo de AMBAR indicado en este contrato.']};

/** Full contract text with AMBAR's data and the ally's profile filled in. */
export function allyContractText(c:AllyContractConfig,a:AllyProfile,signedAt=new Date(),extra:ContractSection[]=[]):ContractSection[]{
 const ally=a.representante&&a.representante!==a.nombre?`, representado por ${a.representante}`:'';
 return [
  {titulo:'Partes',parrafos:['Entre los suscritos, a saber:',
   `AMBAR (en adelante "AMBAR"), representada por ${c.representante}, mayor de edad, identificada con cédula de ciudadanía No. ${c.representante_cedula} de ${c.representante_ciudad_cedula}, con NIT/RUT No. ${c.nit}, domicilio en ${c.direccion}, ${c.ciudad}, correo ${c.correo} y teléfono ${c.telefono}.`,
   `EL ALIADO: ${a.nombre}, identificado con C.C./NIT No. ${a.cedula}${ally}, con domicilio en ${a.direccion}, ${a.ciudad}, correo ${a.correo} y teléfono ${a.celular}.`,
   'Acuerdan celebrar el presente Contrato de Alianza Comercial para el Préstamo de Vestidos, que se regirá por las siguientes consideraciones y cláusulas.']},
  {titulo:'Consideraciones',parrafos:[],lista:['AMBAR es propietaria de una colección de vestidos y desea darlos a conocer mediante alianzas con terceros.',
   'EL ALIADO desea usar vestidos de AMBAR en eventos propios o de sus clientes (desfiles, sesiones de fotos, ferias, concursos, eventos sociales u otros).',
   'AMBAR entrega los vestidos únicamente a título de préstamo para el evento acordado, sin cobrar canon de arrendamiento y sin asumir costo alguno derivado de su uso.',
   'EL ALIADO acepta que todos los costos, riesgos y responsabilidades sobre el vestido, desde su entrega hasta su devolución a satisfacción, corren por su cuenta.']},
  {titulo:'PRIMERA. Objeto',parrafos:['AMBAR presta a EL ALIADO, a título gratuito y temporal, el o los vestidos descritos en el Acta de Entrega (Anexo 1), exclusivamente para el evento allí indicado. Cada préstamo se documenta en un Acta de Entrega independiente que hace parte integral de este contrato.']},
  {titulo:'SEGUNDA. Naturaleza del préstamo',parrafos:['Este contrato es un préstamo de uso (comodato) en los términos de los artículos 2200 y siguientes del Código Civil colombiano. AMBAR conserva en todo momento la propiedad del vestido. EL ALIADO no adquiere ningún derecho de dominio y no puede vender, alquilar, subprestar, ceder ni dar en garantía el vestido.']},
  {titulo:'TERCERA. Obligaciones de AMBAR',parrafos:['AMBAR no asume ningún otro costo, gasto ni responsabilidad relacionada con el uso del vestido.'],lista:['Entregar el vestido limpio, en buen estado y en la fecha acordada.','Dejar constancia de su estado en el Acta de Entrega, con fotografías.','Recibir el vestido en la fecha de devolución y verificar su estado.']},
  {titulo:'CUARTA. Costos a cargo de EL ALIADO',parrafos:['EL ALIADO asume el 100 % de los costos asociados al préstamo, entre ellos:'],lista:['Transporte y envío de ida y vuelta.','Ajustes, si AMBAR los autoriza por escrito.','Lavado, planchado y limpieza especializada (lavandería en seco u otra que AMBAR indique) antes de la devolución.','Seguros, si EL ALIADO decide tomarlos o AMBAR los exige para prendas de alto valor.','Reparación, reposición y penalidades previstas en este contrato.','Cualquier pago a terceros (modelos, maquilladores, fotógrafos, personal del evento).']},
  {titulo:'QUINTA. Depósito en garantía',parrafos:[`Antes de la entrega, EL ALIADO consigna a AMBAR un depósito de ${money(c.deposito_por_vestido)} COP por vestido, o el valor fijado en el Acta de Entrega. El depósito garantiza la devolución completa y en buen estado.`],lista:['Si el vestido se devuelve a tiempo y sin daños, AMBAR reintegra el depósito dentro de los 5 días hábiles siguientes a la verificación.','AMBAR puede descontar del depósito los valores de limpieza no realizada, reparaciones, retrasos o reposición.','Si el depósito no alcanza, EL ALIADO paga la diferencia dentro de los 5 días hábiles siguientes a la cuenta de cobro.','El depósito no genera intereses.']},
  {titulo:'SEXTA. Cuidado y custodia',parrafos:['Desde la entrega hasta la devolución, EL ALIADO es el único responsable del cuidado del vestido. En especial se obliga a:'],lista:['Usarlo solo en el evento acordado y por la persona o modelo indicada.','No hacer cortes, costuras, teñidos ni modificaciones sin autorización escrita de AMBAR.','Protegerlo de manchas de maquillaje, comida, bebidas, humo, perfumes y humedad.','Guardarlo en el forro o empaque entregado por AMBAR.','Informar a AMBAR por escrito, dentro de las 24 horas siguientes, cualquier daño, pérdida o hurto.']},
  {titulo:'SÉPTIMA. Daños, pérdida o hurto',parrafos:['EL ALIADO responde por todo daño, deterioro, pérdida o hurto del vestido mientras esté bajo su tenencia, incluido el caso fortuito, salvo el desgaste normal de un uso cuidadoso.'],lista:['Daño reparable: EL ALIADO paga el costo de reparación definido por AMBAR o por el taller que esta elija.','Daño irreparable, pérdida o hurto: EL ALIADO paga el valor de reposición del vestido fijado en el Acta de Entrega.','En caso de hurto, EL ALIADO entrega copia de la denuncia, sin que esto lo exima del pago.']},
  {titulo:'OCTAVA. Devolución',parrafos:['EL ALIADO devuelve el vestido limpio, completo (con accesorios, forro y empaque) y en el mismo estado en que lo recibió, en la fecha, hora y lugar del Acta de Entrega. AMBAR revisa el vestido al recibirlo y deja constancia en el acta de devolución.']},
  {titulo:'NOVENA. Retraso en la devolución',parrafos:[`Por cada día de retraso, EL ALIADO paga a AMBAR ${money(c.mora_por_dia)} COP por vestido. Si el retraso supera 5 días calendario sin justificación aceptada por AMBAR, el vestido se considera perdido y se aplica la cláusula Séptima.`]},
  {titulo:'DÉCIMA. Uso de marca y créditos',parrafos:[`EL ALIADO se compromete a dar crédito a AMBAR en las publicaciones del evento (por ejemplo, etiqueta @${String(c.cuenta_redes||'').replace(/^@/,'')} en redes sociales). AMBAR puede usar las fotos y videos del evento en sus canales. EL ALIADO no puede usar la marca AMBAR para fines distintos al evento sin autorización escrita.`]},
  {titulo:'UNDÉCIMA. Duración',parrafos:['Este contrato rige por 12 meses desde su firma y se renueva automáticamente por periodos iguales, salvo aviso escrito de cualquiera de las partes con 30 días de anticipación.']},
  {titulo:'DUODÉCIMA. Terminación',parrafos:['AMBAR puede terminar el contrato de inmediato si EL ALIADO incumple cualquiera de sus obligaciones. La terminación no extingue las obligaciones pendientes de devolución, pago o reposición.']},
  {titulo:'DECIMOTERCERA. Independencia de las partes',parrafos:['Este contrato no crea sociedad, relación laboral, agencia ni mandato. Cada parte responde por su propio personal, impuestos y obligaciones con terceros. EL ALIADO mantiene indemne a AMBAR frente a cualquier reclamo de terceros derivado del evento.']},
  {titulo:'DECIMOCUARTA. Cláusula penal',parrafos:[`El incumplimiento de las obligaciones de EL ALIADO genera una pena de ${money(c.clausula_penal)} COP, sin perjuicio del cobro de los daños y de la reposición del vestido.`]},
  {titulo:'DECIMOQUINTA. Mérito ejecutivo',parrafos:['Este contrato, junto con el Acta de Entrega y la cuenta de cobro, presta mérito ejecutivo para el cobro de las sumas a cargo de EL ALIADO.']},
  {titulo:'DECIMOSEXTA. Solución de controversias',parrafos:[`Las diferencias se resolverán primero por arreglo directo en un plazo de 15 días. Si no hay acuerdo, se acudirá a conciliación en un centro de conciliación de ${c.ciudad} y, en su defecto, a la jurisdicción ordinaria.`]},
  {titulo:'DECIMOSÉPTIMA. Notificaciones',parrafos:['Las comunicaciones se enviarán a los correos indicados en el encabezado y se entienden recibidas el día de su envío.']},
  {titulo:'DECIMOCTAVA. Integralidad',parrafos:['Este contrato y sus actas constituyen el acuerdo total entre las partes. Cualquier modificación debe constar por escrito y firmada por ambas.']},
  {titulo:'Anexo 1. Acta de entrega y devolución',parrafos:['Se diligencia una por cada préstamo, con fotografías del vestido al entregarlo y al recibirlo: número de acta, aliado, evento (nombre, lugar y fecha), persona o modelo que usará el vestido, referencia, talla y color, accesorios entregados, estado al entregar, valor de reposición, depósito consignado, fecha y hora de entrega, fecha, hora y lugar de devolución, estado al devolver, descuentos aplicados al depósito y valor reintegrado o a cobrar.']},
  ...extra,
  {titulo:'Firma',parrafos:[`En constancia, EL ALIADO firma digitalmente en ${a.ciudad} el ${longDate(signedAt)}. AMBAR: ${c.representante} · C.C. ${c.representante_cedula} · NIT ${c.nit}. EL ALIADO: ${a.nombre} · C.C./NIT ${a.cedula}.`]},
 ];
}

const clean=(v:unknown,max:number)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max+1);
/** Validates the ally's basic data typed on the signing page. */
export function allyProfile(input:Record<string,unknown>):AllyProfile{
 const p={nombre:clean(input.nombre,140),cedula:clean(input.cedula,20).replace(/[^\d.-]/g,''),representante:clean(input.representante,140),celular:clean(input.celular,20),correo:clean(input.correo,160).toLowerCase(),
  direccion:clean(input.direccion,200),ciudad:clean(input.ciudad,80),banco:clean(input.banco,80),tipo_cuenta:clean(input.tipo_cuenta,30),numero_cuenta:clean(input.numero_cuenta,40)};
 if(p.nombre.length<3||p.nombre.length>140)throw Error('Escribe tu nombre completo o razón social.');
 if(!/^\d[\d.-]{4,18}$/.test(p.cedula))throw Error('Escribe un número de cédula o NIT válido.');
 if(!/^[0-9+\s()-]{7,20}$/.test(p.celular))throw Error('Escribe un celular válido.');
 if(p.correo.length>160||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.correo))throw Error('Escribe un correo válido.');
 if(p.direccion.length<5||p.direccion.length>200)throw Error('Escribe tu dirección.');
 if(p.ciudad.length<3||p.ciudad.length>80)throw Error('Escribe tu ciudad.');
 if(p.banco.length<2||p.banco.length>80||p.numero_cuenta.length<4||p.numero_cuenta.length>40||!['Ahorros','Corriente','Nequi / Daviplata','Otra'].includes(p.tipo_cuenta))throw Error('Completa los datos de la cuenta bancaria.');
 if(p.representante.length>140)throw Error('El nombre del representante es demasiado largo.');
 return p;
}

/** Fills {nombre} {cédula} {tipo} {fecha} of the uploaded Word agreement with the ally's data. */
export function fillAgreement(sections:ContractSection[],v:{nombre:string;cedula:string;tipo:string;fecha:string}):ContractSection[]{
 const f=(s:string)=>s.replace(/\{\s*nombre\s*\}/gi,v.nombre).replace(/\{\s*c[eé]dula\s*\}/gi,v.cedula).replace(/\{\s*tipo\s*\}/gi,v.tipo).replace(/\{\s*fecha\s*\}/gi,v.fecha);
 return sections.map(s=>({titulo:f(s.titulo),parrafos:s.parrafos.map(f),...(s.lista?{lista:s.lista.map(f)}:{})}));
}
export const agreementDate=(d:Date)=>d.toLocaleDateString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'long',year:'numeric'});
