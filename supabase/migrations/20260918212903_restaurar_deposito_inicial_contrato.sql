-- Allow the initial received guarantee on contract creation; later changes still use the deposit ledger.
create or replace function private.proteger_valor_deposito() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('anon','authenticated') then
  if tg_op='INSERT' and coalesce(new.valor_deposito,0)<>0 then
   if current_user<>'authenticated' or not exists (
    select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true)
    and lower(trim(p.rol)) in ('asesora','admin')
   ) then raise exception 'Solo personal autorizado puede registrar el depósito inicial.' using errcode='42501'; end if;
   if new.valor_deposito<0 or new.valor_deposito::text in ('NaN','Infinity','-Infinity') then
    raise exception 'El depósito debe ser un valor válido mayor o igual a cero.' using errcode='23514';
   end if;
  elsif tg_op='UPDATE' and new.valor_deposito is distinct from old.valor_deposito then
   raise exception 'Registra el depósito con su comprobante desde Depósitos y devoluciones.';
  end if;
 end if;
 return new;
end $$;
