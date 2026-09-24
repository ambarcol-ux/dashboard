import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { calendarColumns } from '@/lib/contract-calendar';
import { validateCalendarPatch } from '@/lib/calendar-edit';
import { prexvFields } from '@/lib/prexv';
import { generateBlockedRanges } from '@/lib/availability';
export async function PATCH(request:Request){
 const authorization=request.headers.get('authorization');
 if(!authorization?.startsWith('Bearer '))return NextResponse.json({error:'Inicia sesión para editar.'},{status:401});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await db.auth.getUser(authorization.slice(7));
 if(authError||!user)return NextResponse.json({error:'Tu sesión venció. Vuelve a ingresar.'},{status:401});
 try{
  const body=await request.json();
  if(typeof body.id!=='string'||!body.original||typeof body.original!=='object')return NextResponse.json({error:'Contrato inválido.'},{status:400});
  const patch=validateCalendarPatch(body.changes);
  const {data:profile,error:pe}=await db.from('profiles').select('rol,sede_id,nombre,activo').eq('id',user.id).single();
  if(profile)profile.rol=String(profile.rol).toLowerCase();
  if(pe||!profile||profile.activo===false||!['admin','asesora'].includes(profile.rol)||(profile.rol!=='admin'&&!profile.sede_id))return NextResponse.json({error:'No tienes un perfil autorizado para editar.'},{status:403});
  let read=db.from('contratos').select(calendarColumns).eq('id',body.id);
  if(profile.rol!=='admin')read=read.eq('sede_id',profile.sede_id);
  const {data:row,error:re}=await read.single();
  if(re||!row)return NextResponse.json({error:'Contrato no disponible para tu usuario.'},{status:404});
  const current=row as unknown as Record<string,any>;
  const contractIsPacted=!['borrador','pendiente_admin'].includes(String(current.estado||'').toLowerCase());
  if(contractIsPacted&&profile.rol!=='admin')return NextResponse.json({error:'Solo un administrador puede modificar un contrato pactado.'},{status:403});
  const prexvKeys=[...prexvFields,'fecha_pre_xv','fecha_fotografia','fecha_maquillaje'];
  const touchesPrexv=Object.keys(patch).some(k=>prexvKeys.includes(k));
  const touchesSpecial=Object.keys(patch).some(k=>['bloqueo_especial_referencia','bloqueo_especial_fecha'].includes(k));
  const lockKeys=[...new Set([...Object.keys(patch),...(touchesPrexv?prexvKeys:[])])];
  for(const key of lockKeys){
   if(!(key in body.original)||JSON.stringify(current[key]??null)!==JSON.stringify(body.original[key]??null))return NextResponse.json({error:'Este contrato cambió mientras lo editabas. Cierra el panel, actualiza y vuelve a abrirlo.'},{status:409});
  }

  if(touchesSpecial){
   const ref=String(('bloqueo_especial_referencia' in patch?patch.bloqueo_especial_referencia:current.bloqueo_especial_referencia)||'').trim().toUpperCase();
   const date=('bloqueo_especial_fecha' in patch?patch.bloqueo_especial_fecha:current.bloqueo_especial_fecha) as string|null|undefined;

   if(!ref&&!date){
    patch.bloqueo_especial_referencia=null;
    patch.bloqueo_especial_fecha=null;
    patch.bloqueo_especial_vestido_id=null;
   }else{
    if(!ref||!date)return NextResponse.json({error:'En Bloqueo fechas especiales debes indicar la referencia y la fecha por bloquear.'},{status:400});
    const {data:dress,error:dressError}=await db.from('vestidos').select('id,codigo,estado,sede_actual_id').ilike('codigo',ref).limit(1).maybeSingle();
    if(dressError||!dress)return NextResponse.json({error:'La referencia del bloqueo especial no existe en el inventario.'},{status:400});
    if(String(dress.estado||'').toLowerCase()==='de baja')return NextResponse.json({error:'La referencia del bloqueo especial está dada de baja.'},{status:400});
    if(current.sede_id&&dress.sede_actual_id!==current.sede_id)return NextResponse.json({error:'La referencia del bloqueo especial pertenece a otra sede. Realiza primero el traslado logístico.'},{status:409});
    patch.bloqueo_especial_referencia=dress.codigo;
    patch.bloqueo_especial_fecha=date;
    patch.bloqueo_especial_vestido_id=dress.id;
   }
  }

  const changed={...current,...patch};
  const pairs=[['fecha_cita_medidas','fecha_prueba_final'],['fecha_prueba_final','fecha_entrega_envio'],['fecha_entrega_envio','fecha_evento'],['fecha_evento','fecha_retorno_prevista'],['fecha_retorno_prevista','fecha_disponibilidad_real']];
  for(const [a,b] of pairs){if((a in patch||b in patch)&&changed[a]&&changed[b]&&changed[a]>changed[b])return NextResponse.json({error:'Revisa el orden: medidas, prueba final, entrega, evento, retorno y disponibilidad.'},{status:400});}
  if(['fecha_evento','fecha_pre_xv','fechas_bloqueo_especial','bloqueo_especial_fecha','bloqueo_especial_referencia'].some(k=>k in patch)){
   const ids=Array.from(new Set<string>([current.vestido_id,...(current.items||[]).map((i:any)=>i.vestido_id),current.bloqueo_especial_vestido_id,changed.bloqueo_especial_vestido_id].filter(Boolean)));
   for(const id of ids){
    const [{data:items,error:itemError},{data:legacy,error:legacyError},{data:special,error:specialError}]=await Promise.all([
     db.from('contrato_items_vestidos').select('vestido_id,contratos!inner(id,numero_contrato,cliente_nombre,estado,fecha_evento,fecha_pre_xv,fechas_bloqueo_especial)').eq('vestido_id',id).neq('contrato_id',body.id),
     db.from('contratos').select('id,numero_contrato,cliente_nombre,estado,fecha_evento,fecha_pre_xv,fechas_bloqueo_especial').eq('vestido_id',id).neq('id',body.id),
     db.from('contratos').select('id,numero_contrato,cliente_nombre,estado,bloqueo_especial_fecha,bloqueo_especial_vestido_id').eq('bloqueo_especial_vestido_id',id).neq('id',body.id).not('bloqueo_especial_fecha','is',null)
    ]);
    if(itemError||legacyError||specialError)return NextResponse.json({error:'No se pudo verificar la disponibilidad del vestido.'},{status:503});
    const blocks=generateBlockedRanges([...(items||[]),...(legacy||[]),...(special||[])]);
    const proposed=generateBlockedRanges([changed]).filter(b=>!b.id.startsWith('legacy-')||changed.bloqueo_especial_vestido_id===id);
    const previous=generateBlockedRanges([current]).filter(b=>!b.id.startsWith('legacy-')||current.bloqueo_especial_vestido_id===id);
    const overlaps=(a:any,b:any)=>a.start<=b.end&&b.start<=a.end;
    if(proposed.some(a=>blocks.some(b=>overlaps(a,b)&&!previous.some(old=>old.id===a.id&&overlaps(old,b)))))
     return NextResponse.json({error:'El vestido tiene otra reserva en estas fechas. Revisa su disponibilidad antes de reprogramar.'},{status:409});
   }
  }
  let update=db.from('contratos').update(patch).eq('id',body.id);
  if(profile.rol!=='admin')update=update.eq('sede_id',profile.sede_id);
  for(const key of lockKeys)update=current[key]===null||current[key]===undefined?update.is(key,null):update.eq(key,Array.isArray(current[key])?`{${current[key].join(',')}}`:current[key]);
  const {data:saved,error:se}=await update.select(calendarColumns).maybeSingle();
  if(se)return NextResponse.json({error:se.message||'No se pudieron guardar los cambios.'},{status:400});
  if(!saved)return NextResponse.json({error:'El contrato cambió durante el guardado. Actualiza antes de continuar.'},{status:409});
  const savedRow=saved as unknown as Record<string,unknown>;
  const loggedKeys=lockKeys.filter(k=>JSON.stringify(current[k]??null)!==JSON.stringify(savedRow[k]??null));
  const {error:logError}=await db.from('bitacora_contratos').insert({contrato_id:body.id,accion:'Edición desde calendario',detalle:JSON.stringify(Object.fromEntries(loggedKeys.map(k=>[k,{antes:current[k],despues:savedRow[k]}]))),usuario:profile.nombre||user.id});
  return NextResponse.json({contract:saved,warning:logError?'Los cambios se guardaron, pero no se pudo registrar la bitácora.':null});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'No se pudo procesar la edición.'},{status:400});}
}

