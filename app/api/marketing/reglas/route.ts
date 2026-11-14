import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {publicServerClient} from '@/lib/public-db';
import {createPiece,type Formato,type Red} from '@/lib/content-studio';
import {isPublicCatalogDress,type CatalogDress} from '@/lib/catalog-public';
import {mainPhoto} from '@/lib/dress-photo-match';
export const dynamic='force-dynamic';
export const maxDuration=60;

type Regla={id:string;nombre:string;disparador:'calendario'|'vestido_nuevo';dias:number[];hora:string;cantidad:number;formato:Formato;redes:Red[];sede_id:string|null;orden:string;ultimo_revisado:string|null;created_at:string};
const POR_CORRIDA=3;

/** Supabase cron, 5:00–8:40 a. m. Bogotá every 20 minutes: creates the day's pieces of the active rules (a few per run).
 *  Calendar rules: «cantidad» pieces on the chosen weekdays, scheduled at the rule's time. New dress: one piece per dress
 *  added to the inventory (visible in the catalog, with photo). Every piece waits for approval. */
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return Response.json({error:'No autorizado'},{status:401});
 const db=publicServerClient();
 const now=new Date(),hoy=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(now),dow=new Date(`${hoy}T12:00:00Z`).getUTCDay();
 const at=(hora:string)=>{const t=new Date(`${hoy}T${hora.slice(0,5)}:00-05:00`);return t.getTime()>now.getTime()+15*60000?t.toISOString():null;};
 const {data:rs}=await db.from('contenido_reglas').select('id,nombre,disparador,dias,hora,cantidad,formato,redes,sede_id,orden,ultimo_revisado,created_at').eq('activa',true);
 const reglas=(rs||[]) as Regla[];if(!reglas.length)return Response.json({creadas:0});
 // Dresses shown in the last 14 days, so the rules do not repeat them.
 const {data:recientes}=await db.from('contenido_piezas').select('medios').gte('created_at',new Date(Date.now()-14*86400000).toISOString()).neq('estado','descartada');
 const excluir=[...new Set(((recientes||[]) as {medios:{fuente:string;ref:string}[]}[]).flatMap(p=>p.medios.filter(m=>m.fuente==='vestido').map(m=>m.ref)))];
 let creadas=0;const errores:string[]=[];
 for(const r of reglas){
  if(creadas>=POR_CORRIDA)break;
  try{
   if(r.disparador==='calendario'){
    if(!r.dias.includes(dow))continue;
    const {count}=await db.from('contenido_piezas').select('id',{count:'exact',head:true}).eq('regla_id',r.id).eq('regla_fecha',hoy);
    for(let i=count||0;i<r.cantidad&&creadas<POR_CORRIDA;i++){
     await createPiece(db,{orden:`${r.orden}${r.cantidad>1?` (pieza ${i+1} de ${r.cantidad} de hoy: que sea distinta a las demás)`:''}`,formato:r.formato,redes:r.redes,sede_id:r.sede_id,programada_at:at(r.hora),regla_id:r.id,regla_fecha:hoy,excluir},null);
     creadas++;
    }
   }else{
    const desde=r.ultimo_revisado||r.created_at;
    const {data:ds}=await db.from('vestidos').select('id,codigo,created_at,sede_actual_id,foto_frente,foto_espalda,foto_detalle,imagen_url,precio_sugerido,para_alquiler,estado').eq('archivado',false).gt('created_at',desde).order('created_at').limit(10);
    let ultimo=desde;
    for(const d of (ds||[]) as (CatalogDress&{id:string;codigo:string;created_at:string;sede_actual_id:string|null})[]){
     if(creadas>=POR_CORRIDA)break;
     ultimo=d.created_at;
     if(!isPublicCatalogDress(d)||!mainPhoto(d)||(r.sede_id&&d.sede_actual_id!==r.sede_id))continue;
     await createPiece(db,{orden:`${r.orden} Vestido nuevo en inventario: código ${String(d.codigo).trim()}.`,formato:r.formato,redes:r.redes,sede_id:r.sede_id,programada_at:at(r.hora),regla_id:r.id,regla_fecha:hoy,vestido_id:d.id},null);
     creadas++;
    }
    if(ultimo!==desde)await db.from('contenido_reglas').update({ultimo_revisado:ultimo}).eq('id',r.id);
   }
  }catch(e){errores.push(`${r.nombre}: ${e instanceof Error?e.message:'error'}`);}
 }
 if(errores.length)console.error('Estudio de contenido: reglas',errores);
 return Response.json({creadas,errores});
}
