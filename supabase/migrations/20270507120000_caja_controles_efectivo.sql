-- Controles de efectivo (cash kept far from the owners):
-- 1) Tope de efectivo por sede (caja_config.tope_efectivo, default $500.000): if a day closes with more cash than the cap, the next day
--    cannot be closed until a «Consignación a banco» (with its receipt) covers the excess.
-- 2) Foto del conteo: a closing with a difference needs the photo of the bills (caja_cierres.foto_conteo, bucket comprobantes_caja).
-- 3) Depósitos en efectivo hasta un tope por sede (caja_config.tope_deposito_efectivo, default $300.000; null = no cap): above it the
--    deposit is received or returned by transfer or card (contract, delivery and Depósitos).
-- Reversible: drop the columns and the functions/triggers created here; restore public.cerrar_caja_billetes(4 args) and
-- private.caja_auto_deposito_entrega from 20270504120000 / 20270501120000.

alter table public.caja_config add column if not exists tope_efectivo numeric(14,2) default 500000 check (tope_efectivo is null or tope_efectivo>=0);
alter table public.caja_config add column if not exists tope_deposito_efectivo numeric(14,2) default 300000 check (tope_deposito_efectivo is null or tope_deposito_efectivo>=0);
update public.caja_config set tope_efectivo=500000 where tope_efectivo is null;
update public.caja_config set tope_deposito_efectivo=300000 where tope_deposito_efectivo is null;
alter table public.caja_cierres add column if not exists foto_conteo text;
create or replace trigger caja_config_historial_general after insert or update or delete on public.caja_config for each row execute function private.config_historial();

create or replace function public.caja_topes() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(k.sede_id,jsonb_build_object('tope_efectivo',k.tope_efectivo,'tope_deposito_efectivo',k.tope_deposito_efectivo)),'{}'::jsonb)
 from public.caja_config k where private.caja_ver(k.sede_id);
$$;
create or replace function public.caja_topes_guardar(p_sede uuid, p_tope numeric, p_tope_deposito numeric) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not (public.es_admin() or private.es_finanzas()) then raise exception 'Solo administración o contabilidad.' using errcode='42501'; end if;
 if coalesce(p_tope,0)<0 or coalesce(p_tope_deposito,0)<0 then raise exception 'Los topes no pueden ser negativos.'; end if;
 insert into public.caja_config(sede_id,tope_efectivo,tope_deposito_efectivo) values(p_sede,p_tope,p_tope_deposito)
 on conflict (sede_id) do update set tope_efectivo=excluded.tope_efectivo,tope_deposito_efectivo=excluded.tope_deposito_efectivo,updated_at=now();
end $$;

-- Excess of the last closing over the cap that no bank deposit has covered yet (0 = nothing pending).
create or replace function private.caja_exceso_sin_consignar(p_sede uuid, p_fecha date) returns numeric
language sql stable security definer set search_path='' as $$
 select coalesce((select greatest(0,k.contado-c.tope_efectivo
   -coalesce((select sum(m.valor) from public.caja_movimientos m where m.sede_id=p_sede and m.anulado_at is null and m.tipo='egreso' and m.categoria='Consignación a banco'
     and m.fecha>k.fecha and m.fecha<=p_fecha),0))
  from public.caja_cierres k join public.caja_config c on c.sede_id=k.sede_id
  -- Only closings from the day the rule started (older days being closed late do not block).
  where k.sede_id=p_sede and k.fecha<p_fecha and k.fecha>=date '2026-11-21' and k.reabierto_at is null and c.tope_efectivo is not null
  order by k.fecha desc limit 1),0);
$$;

create or replace function private.cerrar_caja_billetes(p_sede uuid, p_fecha date, p_billetes jsonb, p_observaciones text, p_foto text) returns uuid
language plpgsql security definer set search_path='' as $$
declare exceso numeric:=private.caja_exceso_sin_consignar(p_sede,p_fecha); nid uuid;
begin
 if exceso>0 then raise exception 'El último cierre dejó en el cajón % más del tope de efectivo de la sede. Registra la «Consignación a banco» con su comprobante y luego cierra.', '$'||to_char(exceso,'FM999G999G999'); end if;
 nid:=private.cerrar_caja_billetes(p_sede,p_fecha,p_billetes,p_observaciones);
 if exists(select 1 from public.caja_cierres where id=nid and diferencia<>0) then
  if p_foto is null or split_part(p_foto,'/',1)<>p_sede::text or not exists(select 1 from storage.objects where bucket_id='comprobantes_caja' and name=p_foto) then
   raise exception 'Hay diferencia: adjunta la foto de los billetes contados.'; end if;
 end if;
 update public.caja_cierres set foto_conteo=p_foto where id=nid;
 return nid;
end $$;
create or replace function public.cerrar_caja_billetes(p_sede uuid, p_fecha date, p_billetes jsonb, p_observaciones text, p_foto text) returns uuid
language sql set search_path='' as $$ select private.cerrar_caja_billetes(p_sede,p_fecha,p_billetes,p_observaciones,p_foto); $$;
-- The 4-argument call goes through the same checks (without photo).
create or replace function public.cerrar_caja_billetes(p_sede uuid, p_fecha date, p_billetes jsonb, p_observaciones text) returns uuid
language sql set search_path='' as $$ select private.cerrar_caja_billetes(p_sede,p_fecha,p_billetes,p_observaciones,null::text); $$;
revoke all on function public.cerrar_caja_billetes(uuid,date,jsonb,text,text), public.caja_topes_guardar(uuid,numeric,numeric) from public, anon;
grant execute on function public.cerrar_caja_billetes(uuid,date,jsonb,text,text), public.caja_topes(), public.caja_topes_guardar(uuid,numeric,numeric) to authenticated;
revoke all on function private.cerrar_caja_billetes(uuid,date,jsonb,text,text), private.caja_exceso_sin_consignar(uuid,date) from public, anon, authenticated;

-- 3) Cash deposits up to the store's cap.
create or replace function private.deposito_efectivo_permitido(p_sede uuid, p_valor numeric, p_medio text) returns void
language plpgsql stable security definer set search_path='' as $$
declare tope numeric;
begin
 if coalesce(p_medio,'') not ilike 'efectivo%' or coalesce(p_valor,0)<=0 then return; end if;
 select tope_deposito_efectivo into tope from public.caja_config where sede_id=p_sede;
 if tope is not null and p_valor>tope then
  raise exception 'Los depósitos en efectivo van hasta % en esta sede. Por encima, recíbelo o devuélvelo por transferencia o datáfono.', '$'||to_char(tope,'FM999G999G999'); end if;
end $$;

create or replace function private.deposito_efectivo_contrato() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.medio_deposito is distinct from old.medio_deposito then perform private.deposito_efectivo_permitido(new.sede_id,new.valor_deposito,new.medio_deposito); end if;
 return new;
end $$;
create or replace trigger deposito_efectivo_contrato before insert or update of medio_deposito on public.contratos for each row execute function private.deposito_efectivo_contrato();

create or replace function private.deposito_efectivo_movimiento() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.deposito_efectivo_permitido((select sede_id from public.contratos where id=new.contrato_id),new.monto,new.metodo);
 return new;
end $$;
create or replace trigger deposito_efectivo_movimiento before insert on public.movimientos_depositos for each row execute function private.deposito_efectivo_movimiento();

create or replace function private.deposito_efectivo_entrega() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.contratos;
begin
 if lower(coalesce(new.tipo_entrega,''))='reversion' or new.metodo_deposito is null then return new; end if;
 select * into c from public.contratos where id=new.contrato_id;
 -- Only when the deposit is collected at delivery (not paid at signing nor registered in Depósitos).
 if c.id is null or coalesce(c.medio_deposito,'') in ('Efectivo','Transferencia','Tarjeta') or exists(select 1 from public.movimientos_depositos where contrato_id=c.id and tipo='ingreso') then return new; end if;
 perform private.deposito_efectivo_permitido(c.sede_id,c.valor_deposito,new.metodo_deposito);
 return new;
end $$;
create or replace trigger deposito_efectivo_entrega before insert on public.entregas_bitacora for each row execute function private.deposito_efectivo_entrega();
