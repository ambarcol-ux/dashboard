-- Se aplica cuando el front que adjunta soportes ya está publicado: desde aquí un pago sin soporte
-- no se puede guardar (ni desde la pantalla ni llamando la API directamente).
-- ── Validación en la base de datos ───────────────────────────────────────────────────────────────
create function private.verificar_soporte_pago() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return null; end if; -- procesos del servidor
 if not exists(select 1 from public.pagos where id=new.id) then return null; end if;
 if not exists(select 1 from public.soportes_pago where pago_id=new.id and activo) then
  raise exception 'Falta el soporte del pago: adjunta el comprobante para poder guardarlo.' using errcode='P0001'; end if;
 return null;
end $$;
create constraint trigger pagos_exige_soporte after insert on public.pagos deferrable initially deferred
 for each row execute function private.verificar_soporte_pago();

revoke all on function private.verificar_soporte_pago() from public,anon;

-- Desde este momento los pagos nuevos dejan de ser históricos.
do $$ begin
 execute format('create or replace function private.soportes_desde() returns timestamptz language sql stable set search_path='''' as %L',
  'select '||quote_literal(now()::text)||'::timestamptz');
end $$;
