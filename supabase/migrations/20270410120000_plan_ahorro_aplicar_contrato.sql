-- Plan Ahorro XV › usar el plan en un contrato. Before, closing a plan as «usado» only linked the contract: what the family saved was not
-- applied, the contract kept its full balance and registering that money again as an abono would enter the cash register twice.
-- Now, when the plan is closed as «usado» with its contract:
--  · what was saved (payments not annulled) is applied to the contract as paid, WITHOUT a new cash movement (each cuota already entered
--    Cierres de caja as «Plan Ahorro XV»);
--  · the extra (10 %, 12 % in Corona) is applied as the plan's discount: it lowers the balance, it is not money.
--  Both are kept on the contract (plan_ahorro_aplicado, descuento_plan_ahorro) for the accountant and its invoice, and in its history.
-- The contract's value is not changed. Only plans closed as «usado» from now on.
-- Reversible: drop plan_ahorro_usar and plan_ahorro_contratos; restore plan_ahorro_estado from 20270318120000; drop the three contratos columns
--   (and subtract plan_ahorro_aplicado + descuento_plan_ahorro from the anticipo of the contracts where they were applied).

alter table public.contratos
 add column if not exists plan_ahorro_id uuid references public.planes_ahorro(id),
 add column if not exists plan_ahorro_aplicado numeric(14,2) not null default 0,
 add column if not exists descuento_plan_ahorro numeric(14,2) not null default 0;

-- Contracts of the plan's store where it can be used (same family first: same phone or document), newest first.
create or replace function public.plan_ahorro_contratos(p_plan uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'numero',c.numero_contrato,'cliente',c.cliente_nombre,'fecha_evento',c.fecha_evento,'valor',c.valor_total,
   'saldo',coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0)-coalesce(c.anticipo,0),'misma_familia',f.misma) order by f.misma desc,c.created_at desc),'[]'::jsonb)
 from public.planes_ahorro p join public.contratos c on c.sede_id=p.sede_id
 cross join lateral (select (right(regexp_replace(coalesce(c.cliente_whatsapp,c.whatsapp,''),'\D','','g'),10)=right(regexp_replace(p.telefono,'\D','','g'),10)
   or (nullif(btrim(c.cliente_documento),'') is not null and btrim(c.cliente_documento)=btrim(coalesce(p.titular_documento,'')))) misma) f
 where p.id=p_plan and (public.es_admin() or private.caja_operar(p.sede_id)) and c.plan_ahorro_id is null
  and lower(coalesce(c.estado,'')) not in ('cancelado','cancelada','anulado','anulada','rechazado','finalizado')
  and c.created_at>p.created_at-interval '1 day'
 limit 30;
$$;

create or replace function public.plan_ahorro_usar(p_id uuid,p_contrato uuid,p_nota text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pl public.planes_ahorro; c public.contratos; ah numeric; pct numeric; extra numeric; nota text:=btrim(coalesce(p_nota,''));
begin
 select * into pl from public.planes_ahorro where id=p_id for update;
 if pl.id is null or not (public.es_admin() or private.caja_operar(pl.sede_id)) then raise exception 'Plan no encontrado.' using errcode='42501'; end if;
 if pl.estado<>'activo' then raise exception 'Este plan ya está cerrado.'; end if;
 if length(nota)<5 then raise exception 'Escribe una nota (mínimo 5 caracteres).'; end if;
 select * into c from public.contratos where id=p_contrato for update;
 if c.id is null or c.sede_id<>pl.sede_id then raise exception 'Elige un contrato de la sede del plan.'; end if;
 if c.plan_ahorro_id is not null then raise exception 'Ese contrato ya tiene un Plan Ahorro aplicado.'; end if;
 if lower(coalesce(c.estado,'')) in ('cancelado','cancelada','anulado','anulada','rechazado','finalizado') then raise exception 'Ese contrato no está vigente.'; end if;
 select coalesce(sum(valor),0) into ah from public.planes_ahorro_pagos where plan_id=pl.id and anulado_at is null;
 pct:=coalesce(((private.plan_ahorro_premio(ah))->>'pct')::numeric,0);
 extra:=round(ah*pct/100);
 update public.planes_ahorro set estado='usado',contrato_id=c.id,cerrado_at=now(),cerrado_nota=nota,updated_at=now() where id=pl.id;
 update public.contratos set anticipo=coalesce(anticipo,0)+ah+extra,plan_ahorro_id=pl.id,plan_ahorro_aplicado=ah,descuento_plan_ahorro=extra where id=c.id;
 insert into public.historial_cambios_contrato(contrato_id,usuario_id,motivo,campo,valor_anterior,valor_nuevo)
 values(c.id,auth.uid(),left(format('Plan Ahorro XV n.º %s: ahorro %s + extra %s (%s %%) aplicados al contrato. %s',pl.numero,ah,extra,pct,nota),500),'Plan Ahorro XV aplicado',coalesce(c.anticipo,0),coalesce(c.anticipo,0)+ah+extra);
 return jsonb_build_object('ahorro',ah,'extra',extra,'saldo',coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0)-(coalesce(c.anticipo,0)+ah+extra));
end $$;
revoke all on function public.plan_ahorro_contratos(uuid), public.plan_ahorro_usar(uuid,uuid,text) from public, anon;
grant execute on function public.plan_ahorro_contratos(uuid), public.plan_ahorro_usar(uuid,uuid,text) to authenticated;

-- «usado» always goes through plan_ahorro_usar (it needs the contract); the other states stay as they were.
create or replace function public.plan_ahorro_estado(p_id uuid, p_estado text, p_nota text, p_contrato uuid default null::uuid) returns void
language plpgsql security definer set search_path to '' as $function$
declare pl public.planes_ahorro;
begin
 if p_estado='usado' then
  if p_contrato is null then raise exception 'Elige el contrato donde la familia usa su plan.'; end if;
  perform public.plan_ahorro_usar(p_id,p_contrato,p_nota);
  return;
 end if;
 select * into pl from public.planes_ahorro where id=p_id for update;
 if pl.id is null or not (public.es_admin() or private.caja_operar(pl.sede_id)) then raise exception 'Plan no encontrado.' using errcode='42501'; end if;
 if p_estado not in ('activo','usado','desistido','terminado') then raise exception 'Estado no válido.'; end if;
 if p_estado='activo' and not public.es_admin() then raise exception 'Solo administración reactiva un plan.'; end if;
 if p_estado='activo' and pl.estado='usado' then raise exception 'Este plan ya se aplicó a un contrato; para reversarlo pide ayuda a administración.'; end if;
 if p_estado<>'activo' and length(btrim(coalesce(p_nota,'')))<5 then raise exception 'Escribe una nota (mínimo 5 caracteres).'; end if;
 if p_contrato is not null and not exists(select 1 from public.contratos where id=p_contrato and sede_id=pl.sede_id) then raise exception 'El contrato no es de esta sede.'; end if;
 update public.planes_ahorro set estado=p_estado,contrato_id=coalesce(p_contrato,contrato_id),cerrado_at=case when p_estado='activo' then null else now() end,
  cerrado_nota=case when p_estado='activo' then null else btrim(p_nota) end,updated_at=now() where id=p_id;
end $function$;
