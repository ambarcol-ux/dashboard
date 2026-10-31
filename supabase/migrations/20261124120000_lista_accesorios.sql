-- Accesorios incluidos del contrato como lista editable en Configuración (cantidad por accesorio en el contrato).
-- Cancán y Aro/Gitana quedan como «Cancán / Aro»; corbata, corbatín y pañuelo ya no se ofrecen.
-- Revert: remove the 'accesorios' rows from public.listas_contrato and re-apply private.valor_lista_usado without the 'accesorios' case.
insert into public.listas_contrato(lista,valor,orden) select 'accesorios',v,i from unnest(array['Tiara','Caja de tiara','Cancán / Aro','Ganchos','Velo/Mantilla','Cojines']) with ordinality u(v,i) on conflict do nothing;

create or replace function private.valor_lista_usado(p_lista text,p_valor text) returns boolean language sql stable security definer set search_path='' as $$
 select case p_lista
  when 'pv_canales' then exists(select 1 from public.primeras_citas_seguimientos where canal=p_valor)
  when 'pv_resultados_seguimiento' then exists(select 1 from public.primeras_citas_seguimientos where resultado=p_valor)
  when 'pv_motivos_cierre' then exists(select 1 from public.primeras_citas where cierre_seguimiento=p_valor or cierre_seguimiento like p_valor||':%')
  when 'pv_motivos_no_asistencia' then exists(select 1 from public.primeras_citas where motivo like p_valor||'%')
  when 'pv_motivos_eliminar' then exists(select 1 from private.primeras_citas_eliminadas where motivo like p_valor||'%')
  when 'banco' then exists(select 1 from public.contratos where banco_deposito=p_valor)
  when 'tipo_cuenta' then exists(select 1 from public.contratos where tipo_cuenta_deposito=p_valor)
  when 'accesorios' then exists(select 1 from public.contratos k, unnest(k.accesorios) a where a=p_valor or a like p_valor||':%')
  else false end
$$;
