-- Plan Ahorro XV › electronic signature: the family signs the contract from a private link (/plan-ahorro-firma) before its
-- first cuota; the signed text, the signature, the PDF and the signer's data are kept on the plan. Cuotas are refused until signed.
-- Reversión: alter table public.planes_ahorro drop column contrato_version, drop column contrato_texto, drop column firma_base64,
--  drop column firmado_at, drop column firma_hash, drop column firma_ip, drop column firma_user_agent, drop column contrato_pdf_path,
--  drop column firmante; delete from storage.buckets where id='planes_ahorro'; and re-run public.plan_ahorro_pagar from 20270318120000.
alter table public.planes_ahorro
 add column if not exists contrato_version text,
 add column if not exists contrato_texto jsonb,
 add column if not exists firma_base64 text,
 add column if not exists firmado_at timestamptz,
 add column if not exists firma_hash text,
 add column if not exists firma_ip text,
 add column if not exists firma_user_agent text,
 add column if not exists contrato_pdf_path text,
 add column if not exists firmante jsonb;

insert into storage.buckets(id,name,public) values('planes_ahorro','planes_ahorro',false) on conflict (id) do nothing;

create or replace function public.plan_ahorro_pagar(p_plan uuid,p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare pl public.planes_ahorro; pid uuid:=gen_random_uuid(); mov uuid;
begin
 select * into pl from public.planes_ahorro where id=p_plan for update;
 if pl.id is null or not (public.es_admin() or private.caja_operar(pl.sede_id)) then raise exception 'Plan no encontrado.' using errcode='42501'; end if;
 if pl.estado<>'activo' then raise exception 'Este plan ya no está activo.'; end if;
 if pl.firmado_at is null then raise exception 'La familia aún no ha firmado el contrato del plan. Envíale el enlace de firma desde su tarjeta.'; end if;
 insert into public.planes_ahorro_pagos(id,plan_id,fecha,valor,medio,nota,registrado_por)
 values(pid,p_plan,(p->>'fecha')::date,(p->>'valor')::numeric,p->>'medio',nullif(btrim(coalesce(p->>'nota','')),''),auth.uid());
 mov:=private.registrar_movimiento_caja(jsonb_build_object('sede_id',pl.sede_id,'fecha',p->>'fecha','tipo','ingreso','categoria','Plan Ahorro XV','medio',p->>'medio',
  'valor',p->>'valor','descripcion',left('Plan Ahorro XV n.º '||pl.numero||' · '||pl.titular_nombre||coalesce(' · '||pl.quinceanera_nombre,''),500),
  'origen','plan_ahorro','origen_id',pid,'comprobante_path',p->>'comprobante_path','cuenta_id',p->>'cuenta_id'));
 update public.planes_ahorro_pagos set caja_movimiento_id=mov where id=pid;
 update public.planes_ahorro set updated_at=now() where id=p_plan;
 return pid;
end $$;

