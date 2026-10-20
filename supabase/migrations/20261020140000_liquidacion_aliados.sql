-- Liquidación de comisiones de aliados: la tabla no tenía política permisiva (nadie podía guardar) y el
-- front usaba columnas que no existen. Ahora se liquida con una función que descuenta el saldo, guarda el
-- comprobante y registra el egreso en el cierre de caja de la sede que paga.
alter table public.cierres_mensuales_aliados
 add column if not exists sede_id uuid references public.sedes(id),
 add column if not exists medio text,
 add column if not exists comprobante_path text,
 add column if not exists caja_movimiento_id uuid references public.caja_movimientos(id),
 add column if not exists liquidado_por uuid references public.profiles(id);
create policy cierres_aliados_admin_leer on public.cierres_mensuales_aliados for select to authenticated using ((select public.es_admin()));

create function private.liquidar_aliado(p_referidor uuid,p_datos jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare r public.referidores; s uuid:=nullif(p_datos->>'sede_id','')::uuid; med text:=coalesce(nullif(p_datos->>'medio',''),'Transferencia');
 ref text:=btrim(coalesce(p_datos->>'referencia','')); path text:=nullif(btrim(coalesce(p_datos->>'comprobante_path','')),'');
 hoy date:=private.caja_hoy(); mov uuid; new_id bigint;
begin
 if not public.es_admin() then raise exception 'Solo administración puede liquidar comisiones.' using errcode='42501'; end if;
 select * into r from public.referidores where id=p_referidor for update;
 if r.id is null then raise exception 'Aliado no encontrado.'; end if;
 if coalesce(r.saldo_comisiones,0)<=0 then raise exception 'Este aliado no tiene saldo pendiente.'; end if;
 if s is null then raise exception 'Elige la sede desde cuya caja sale el pago.'; end if;
 if path is null then raise exception 'Adjunta el comprobante del pago.'; end if;
 if length(ref)>120 then raise exception 'La referencia es demasiado larga.'; end if;
 mov:=private.registrar_movimiento_caja(jsonb_build_object('sede_id',s,'fecha',hoy,'tipo','egreso','categoria','Comisiones aliados','medio',med,'valor',r.saldo_comisiones,
  'descripcion',left('Liquidación de comisiones · '||coalesce(r.nombre_aliado,r.contacto_nombre,'aliado')||case when ref<>'' then ' · '||ref else '' end,500),'comprobante_path',path));
 insert into public.cierres_mensuales_aliados(referidor_id,mes_liquidado,monto_pagado,estado_pago,comprobante_bancario,fecha_corte,fecha_desembolso,sede_id,medio,comprobante_path,caja_movimiento_id,liquidado_por)
 values(r.id,to_char(hoy,'YYYY-MM'),r.saldo_comisiones,'PAGADO',nullif(ref,''),now(),now(),s,med,path,mov,auth.uid()) returning id into new_id;
 update public.referidores set saldo_comisiones=0 where id=r.id;
 return new_id;
end $$;
create function public.liquidar_aliado(p_referidor uuid,p_datos jsonb) returns bigint language sql security invoker set search_path='' as $$ select private.liquidar_aliado(p_referidor,p_datos); $$;
revoke all on function private.liquidar_aliado(uuid,jsonb),public.liquidar_aliado(uuid,jsonb) from public,anon;
grant execute on function private.liquidar_aliado(uuid,jsonb),public.liquidar_aliado(uuid,jsonb) to authenticated;
