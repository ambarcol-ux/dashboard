-- A transfer registered without an account goes to the only active bank account of its store (if there is exactly one).
-- Same function as before plus that branch; revert by restoring the previous body (without the «Transferencia» branch).
create or replace function private.caja_cuenta_movimiento() returns trigger
language plpgsql security definer set search_path to '' as $function$
declare k public.cuentas_dinero;
begin
 if new.medio='Efectivo' then
  if new.cuenta_id is null or not exists(select 1 from public.cuentas_dinero where id=new.cuenta_id and tipo='efectivo' and sede_id=new.sede_id) then
   select id into new.cuenta_id from public.cuentas_dinero where sede_id=new.sede_id and tipo='efectivo' and activo order by created_at limit 1;
  end if;
 elsif new.cuenta_id is not null then
  select * into k from public.cuentas_dinero where id=new.cuenta_id;
  if k.id is null or k.tipo='efectivo' or (k.sede_id is not null and k.sede_id<>new.sede_id) then
   raise exception 'La cuenta elegida no corresponde a un pago por %.', lower(new.medio);
  end if;
  if tg_op='INSERT' and not k.activo then raise exception 'La cuenta % está inactiva.', k.nombre; end if;
 elsif new.medio='Transferencia' and (select count(*) from public.cuentas_dinero where sede_id=new.sede_id and tipo='banco' and activo)=1 then
  select id into new.cuenta_id from public.cuentas_dinero where sede_id=new.sede_id and tipo='banco' and activo;
 end if;
 return new;
end $function$;
