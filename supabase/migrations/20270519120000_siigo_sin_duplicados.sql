-- Duplicated Siigo documents (FV-1-428/429, RC-1-303 «duplicated_document»): two identical cron jobs (siigo-facturacion and
-- siigo-enviar) called the worker in the same minute and both took the same pending documents. Now:
--  · siigo-enviar is paused (cron.alter_job active=false; reversible), leaving one job every 10 minutes;
--  · siigo_tomar_servidor claims what it returns (tomado_at, FOR UPDATE SKIP LOCKED): a second run at the same time takes nothing
--    already claimed in the last 15 minutes; siigo_resultado_servidor releases the claim.
-- Also: a second payment of the same value is no longer blocked as «duplicate» when the receipt number is empty (Siigo assigns it);
-- a double click is still stopped because the same support file cannot be linked twice (private.soportes_validos).
-- Reversible: select cron.alter_job((select jobid from cron.job where jobname='siigo-enviar'),active:=true); restore the three
-- functions from their previous migrations; drop column siigo_documentos.tomado_at.

alter table public.siigo_documentos add column if not exists tomado_at timestamptz;

select cron.alter_job((select jobid from cron.job where jobname='siigo-enviar'),active:=false);

create or replace function public.siigo_tomar_servidor(p_limite integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare ids uuid[];
begin
 with t as (
  select id from public.siigo_documentos
  where (estado='pendiente' or (estado='error' and intentos<5 and updated_at<now()-interval '30 minutes')) and private.siigo_activo(sede_id)
   and (tomado_at is null or tomado_at<now()-interval '15 minutes')
  order by case tipo when 'factura' then 0 when 'anticipo' then 1 else 2 end, created_at
  limit p_limite for update skip locked)
 , u as (update public.siigo_documentos d set tomado_at=now() from t where d.id=t.id returning d.id)
 select array_agg(id) into ids from u;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'sede_id',d.sede_id,'tipo',d.tipo,'datos',d.datos,'intentos',d.intentos,'contrato_id',d.contrato_id,
   'cliente',(select private.siigo_cliente(c) from public.contratos c where c.id=d.contrato_id),
   'contrato',(select jsonb_build_object('numero',c.numero_contrato,'valor_total',coalesce(c.valor_total,0),'total_arreglos',coalesce(c.total_arreglos,0),'descuento',coalesce(c.descuento_plan_ahorro,0),
      'fecha_evento',c.fecha_evento,'vestidos',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'codigo',v.codigo,'nombre',v.nombre,'talla',v.talla,'precio',coalesce(v.precio_sugerido,0),
        'alquiler',sp.codigo_alquiler,'venta',sp.codigo_venta) order by v.codigo)
       from public.vestidos v left join public.siigo_productos sp on sp.vestido_id=v.id and sp.sede_id=d.sede_id
       where v.id in (select i.vestido_id from public.contrato_items_vestidos i where i.contrato_id=c.id and i.vestido_id is not null union select c.vestido_id where c.vestido_id is not null)),'[]'::jsonb))
     from public.contratos c where c.id=d.contrato_id and d.tipo='factura'),
   'factura',(select jsonb_build_object('estado',f.estado,'siigo_id',f.siigo_id,'numero',f.siigo_numero,'datos',f.datos,'respuesta',f.respuesta) from public.siigo_documentos f where f.id=d.factura_id),
   'cuenta_id',(select m.cuenta_id from public.caja_movimientos m where m.origen_id=d.origen_id and m.anulado_at is null order by m.created_at limit 1)) order by d.created_at),'[]'::jsonb)
  from public.siigo_documentos d where d.id=any(coalesce(ids,'{}')));
end $function$;

create or replace function public.siigo_resultado_servidor(p_id uuid, p_ok boolean, p_siigo_id text, p_numero text, p_error text, p_respuesta jsonb, p_esperar boolean default false)
returns void language plpgsql security definer set search_path='' as $function$
declare d public.siigo_documentos;
begin
 update public.siigo_documentos set
  estado=case when p_ok then 'enviado' when p_esperar then 'pendiente' else 'error' end,
  intentos=intentos+case when p_ok or p_esperar then 0 else 1 end,
  siigo_id=coalesce(p_siigo_id,siigo_id),siigo_numero=coalesce(p_numero,siigo_numero),error=case when p_ok then null else left(p_error,1000) end,
  respuesta=coalesce(p_respuesta,respuesta),enviado_at=case when p_ok then now() else enviado_at end,updated_at=now(),tomado_at=null
 where id=p_id returning * into d;
 if p_ok and d.tipo='factura' and d.contrato_id is not null and p_numero is not null then
  update public.contratos set numero_factura=p_numero,factura_registrada_at=now() where id=d.contrato_id
   and (numero_factura is null or lower(numero_factura) like 'siigo%' or coalesce(d.datos->>'reemplaza','')='true');
 end if;
 if p_ok and d.tipo='correccion_factura' and coalesce(p_respuesta->>'editada','')='true' and d.factura_id is not null then
  update public.siigo_documentos set respuesta=p_respuesta-'editada',updated_at=now() where id=d.factura_id;
 end if;
 if d.tipo='factura' and d.origen='venta' then
  update public.ventas_vestidos set siigo_estado=case when p_ok then 'enviada' when p_esperar then 'pendiente' else 'error' end,
   numero_factura=case when p_ok then coalesce(p_numero,numero_factura) else numero_factura end,
   codigo_siigo=case when p_ok then coalesce(p_respuesta#>>'{items,0,code}',codigo_siigo) else codigo_siigo end where id=d.origen_id;
 end if;
end $function$;

create or replace function private.registrar_abono_contrato(p_contrato uuid, p_valor numeric, p_medio text, p_recibo text, p_observaciones text, p_soportes jsonb)
returns uuid language plpgsql security definer set search_path='' as $function$
declare c public.contratos; nuevo uuid;
begin
 select * into c from public.contratos where id=p_contrato for update;
 if c.id is null then raise exception 'Contrato no encontrado.'; end if;
 if coalesce(btrim(p_recibo),'')<>'' and exists(select 1 from public.pagos where contrato_id=p_contrato and anulado_at is null and valor_pagado=p_valor
   and coalesce(btrim(numero_recibo),'')=btrim(p_recibo) and created_at>now()-interval '10 minutes') then
  raise exception 'Este abono ya quedó registrado hace un momento (mismo valor y recibo). Recarga la página para verlo.';
 end if;
 nuevo:=private.registrar_pago_con_soporte(p_contrato,p_valor,p_medio,p_recibo,p_observaciones,p_soportes);
 update public.contratos set anticipo=coalesce(anticipo,0)+p_valor where id=p_contrato;
 return nuevo;
end $function$;

create or replace function private.registrar_abono_contrato_fecha(p_contrato uuid, p_valor numeric, p_medio text, p_recibo text, p_observaciones text, p_soportes jsonb, p_fecha date)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.contratos; files jsonb; nuevo uuid; s jsonb; hoy date:=private.caja_hoy(); f date:=coalesce(p_fecha,private.caja_hoy());
begin
 if not private.prov_es_personal() then raise exception 'No puedes registrar pagos.' using errcode='42501'; end if;
 select * into c from public.contratos where id=p_contrato for update;
 if c.id is null then raise exception 'Contrato no encontrado.'; end if;
 if f>hoy then raise exception 'La fecha del pago no puede ser futura.'; end if;
 if f<hoy-15 then raise exception 'La fecha del pago solo puede ser de los últimos 15 días (desde el %).',to_char(hoy-15,'DD/MM/YYYY'); end if;
 if private.caja_dia_cerrado(c.sede_id,f) then raise exception 'La caja del % ya está cerrada: pide reabrirla en Cierres de caja para registrar el abono en esa fecha.',to_char(f,'DD/MM/YYYY'); end if;
 if p_valor is null or p_valor<=0 or p_valor<>round(p_valor,2) then raise exception 'Revisa el valor del pago.'; end if;
 if length(btrim(coalesce(p_medio,'')))<2 then raise exception 'Indica el medio de pago.'; end if;
 if coalesce(btrim(p_recibo),'')<>'' and exists(select 1 from public.pagos where contrato_id=p_contrato and anulado_at is null and valor_pagado=p_valor
   and coalesce(btrim(numero_recibo),'')=coalesce(btrim(p_recibo),'') and created_at>now()-interval '10 minutes') then
  raise exception 'Este abono ya quedó registrado hace un momento (mismo valor y recibo). Recarga la página para verlo.';
 end if;
 files:=private.soportes_validos(p_soportes);
 insert into public.pagos(contrato_id,valor_pagado,medio_pago,numero_recibo,observaciones,fecha_pago)
 values(p_contrato,p_valor,btrim(p_medio),coalesce(btrim(p_recibo),''),coalesce(p_observaciones,''),f::timestamp at time zone 'UTC')
 returning id into nuevo;
 for s in select * from jsonb_array_elements(files) loop
  insert into public.soportes_pago(pago_id,archivo_path,nombre,tipo,tamano) values(nuevo,s->>'path',s->>'nombre',s->>'tipo',(s->>'tamano')::int);
 end loop;
 update public.contratos set anticipo=coalesce(anticipo,0)+p_valor where id=p_contrato;
 return nuevo;
end $$;
