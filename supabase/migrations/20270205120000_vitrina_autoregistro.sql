-- QR de la entrada, clienta sin cita: se registra ella misma como vitrina (queda «llegó por QR» y la sede recibe el aviso).
-- Si ese celular o cédula tiene cita hoy en la sede, se registra la llegada a esa cita en vez de crear otra.
-- Sin resultado registrado en 48 h y sin contrato: pasa a seguimiento de vitrina.
-- Reversión: drop function public.vitrina_autoregistro(uuid,text,text,text,text,date,text);
--   volver a aplicar private.citas_asistencia_automatica y public.citas_proximas_sede de 20270204120000_asistencia_automatica.sql.
create or replace function public.vitrina_autoregistro(p_sede uuid,p_nombre text,p_telefono text,p_documento text,p_tipo text,p_evento date,p_entero text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare nombre text:=btrim(coalesce(p_nombre,'')); tel text:=regexp_replace(coalesce(p_telefono,''),'\D','','g');
 doc text:=nullif(regexp_replace(coalesce(p_documento,''),'\D','','g'),''); entero text:=nullif(btrim(coalesce(p_entero,'')),'');
 ahora timestamp:=now() at time zone 'America/Bogota'; x record; new_id uuid;
begin
 if not exists(select 1 from public.sedes where id=p_sede and activo) then raise exception 'Escanea el QR de la entrada de la sede.'; end if;
 if length(nombre) not between 2 and 120 then raise exception 'Escribe tu nombre completo.'; end if;
 if tel !~ '^[0-9]{10,15}$' then raise exception 'Revisa tu celular: entre 10 y 15 números.'; end if;
 if doc is not null and doc !~ '^[0-9]{5,15}$' then raise exception 'Revisa la cédula: solo números, entre 5 y 15.'; end if;
 if not private.lista_activa('pv_tipos_evento_vitrina',coalesce(p_tipo,'')) then raise exception 'Elige el tipo de evento.'; end if;
 if entero is not null and not private.lista_activa('pv_como_se_entero',entero) then raise exception 'Elige cómo te enteraste.'; end if;
 if p_evento is not null and (p_evento<ahora::date or p_evento>ahora::date+1825) then raise exception 'Revisa la fecha del evento.'; end if;
 -- She had an appointment today: register the arrival instead of a new visit.
 for x in select * from public.cita_llegada_buscar(p_sede,tel) union all select * from public.cita_llegada_buscar(p_sede,coalesce(doc,'')) loop
  perform public.cita_llegada_marcar(x.id,p_sede,'qr');
  return jsonb_build_object('cita',true,'nombre',x.nombre,'hora',to_char(x.hora,'HH24:MI'));
 end loop;
 -- Same phone already registered today in this store: no duplicate.
 select id into new_id from public.primeras_citas where sede_id=p_sede and origen='vitrina' and fecha=ahora::date and right(telefono,10)=right(tel,10) limit 1;
 if new_id is not null then return jsonb_build_object('cita',false,'id',new_id,'nombre',split_part(nombre,' ',1)); end if;
 if (select count(*) from public.primeras_citas where sede_id=p_sede and origen='vitrina' and llegada_via='qr' and created_at>now()-interval '10 minutes')>=8 then
  raise exception 'Hay muchos registros seguidos. Pídele ayuda a la asesora.'; end if;
 insert into public.primeras_citas(id,origen,modalidad,sede_id,fecha,hora,cliente_nombre,telefono,email,estado,motivo,consentimiento_at,fecha_evento,tipo_vestido,cliente_documento,como_se_entero,
  origen_enlace,llegada_at,llegada_via)
 values(gen_random_uuid(),'vitrina','presencial',p_sede,ahora::date,date_trunc('minute',ahora)::time,nombre,tel,'','asistio','',now(),p_evento,p_tipo,doc,entero,'qr-tienda',now(),'qr')
 returning id into new_id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(new_id,null,'Vitrina registrada por la clienta',
  'Se registró con el QR de la entrada'||case when entero is not null then ' · Se enteró por '||entero else '' end||'. Falta que la asesora registre el resultado.');
 return jsonb_build_object('cita',false,'id',new_id,'nombre',split_part(nombre,' ',1));
end $$;
revoke all on function public.vitrina_autoregistro(uuid,text,text,text,text,date,text) from public, anon, authenticated;
grant execute on function public.vitrina_autoregistro(uuid,text,text,text,text,date,text) to service_role;

create or replace function private.citas_asistencia_automatica() returns jsonb
language plpgsql security definer set search_path='' as $$
declare x record; llegadas int:=0; no_asist int:=0; sin_res int:=0; vitrinas int:=0;
begin
 for x in select id from public.primeras_citas where origen='cita' and llegada_at is null and respuesta_asistencia is true and estado<>'cancelada' and fecha>=date '2026-11-11' loop
  perform public.cita_llegada_marcar(x.id,null,'whatsapp'); llegadas:=llegadas+1;
 end loop;
 for x in select c.id,c.llegada_at from public.primeras_citas c
  where c.origen='cita' and c.estado in ('agendada','confirmada') and (c.fecha+c.hora)<(now() at time zone 'America/Bogota')-interval '48 hours'
   and c.fecha>=date '2026-11-11'
   and not exists(select 1 from public.contratos k where k.primera_cita_id=c.id and lower(k.estado) not in ('anulado','cancelado','borrador'))
 loop
  if x.llegada_at is null then
   update public.primeras_citas set estado='no_asistio',alquilo=false,posible_seguimiento=true,resultado_comercial='EN SEGUIMIENTO',tipo_seguimiento='no_asistida',
    cierre_seguimiento=null,updated_at=clock_timestamp() where id=x.id;
   insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(x.id,null,'Resultado de la cita','No asistió · Automático: sin llegada por QR, videollamada, WhatsApp ni contrato en 48 horas.');
   no_asist:=no_asist+1;
  else
   update public.primeras_citas set estado='seguimiento',alquilo=false,posible_seguimiento=true,resultado_comercial='EN SEGUIMIENTO',tipo_seguimiento='asistida',
    cierre_seguimiento=null,updated_at=clock_timestamp() where id=x.id;
   insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(x.id,null,'Resultado de la cita','Asistió · No alquiló · Automático: llegó y no hay contrato ni resultado registrado en 48 horas.');
   sin_res:=sin_res+1;
  end if;
  perform private.replanificar_seguimientos(x.id);
 end loop;
 -- Self-registered window visits nobody closed in 48 h: window follow-up.
 for x in select c.id from public.primeras_citas c
  where c.origen='vitrina' and c.llegada_via='qr' and c.resultado_visita is null and c.created_at<now()-interval '48 hours'
   and not exists(select 1 from public.contratos k where k.primera_cita_id=c.id and lower(k.estado) not in ('anulado','cancelado','borrador'))
 loop
  update public.primeras_citas set resultado_visita='En seguimiento',estado='seguimiento',resultado_comercial='EN SEGUIMIENTO',tipo_seguimiento='vitrina',
   cierre_seguimiento=null,updated_at=clock_timestamp() where id=x.id;
  insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(x.id,null,'Resultado de la visita','En seguimiento · Automático: se registró por QR y nadie registró el resultado en 48 horas.');
  perform private.replanificar_seguimientos(x.id);
  vitrinas:=vitrinas+1;
 end loop;
 return jsonb_build_object('llegadas',llegadas,'no_asistio',no_asist,'sin_resultado',sin_res,'vitrinas',vitrinas);
end $$;

-- Alerts also show window customers who registered themselves and are waiting (modalidad «vitrina»).
create or replace function public.citas_proximas_sede() returns table(id uuid, nombre text, fecha date, hora time, modalidad text, sede text, enlace_virtual text, llegada_at timestamptz, codigo text)
language sql stable security invoker set search_path='' as $$
 select * from (
 select c.id,c.cliente_nombre,c.fecha,c.hora,c.modalidad,s.nombre,c.enlace_virtual,c.llegada_at,c.codigo
 from public.primeras_citas c left join public.sedes s on s.id=c.sede_id
 where c.origen='cita' and c.estado in ('agendada','confirmada')
  and c.fecha=(now() at time zone 'America/Bogota')::date
  and (c.fecha+c.hora) between (now() at time zone 'America/Bogota')-interval '30 minutes' and (now() at time zone 'America/Bogota')+interval '90 minutes'
 union all
 select c.id,c.cliente_nombre||coalesce(' · '||nullif(c.tipo_vestido,''),'')||coalesce(' · evento '||to_char(c.fecha_evento,'DD/MM/YYYY'),''),c.fecha,c.hora,'vitrina',s.nombre,'',c.llegada_at,c.codigo
 from public.primeras_citas c left join public.sedes s on s.id=c.sede_id
 where c.origen='vitrina' and c.llegada_via='qr' and c.resultado_visita is null and c.created_at>now()-interval '3 hours'
 ) t order by hora
$$;
