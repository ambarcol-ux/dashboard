create or replace function private.registrar_salida_vestidos() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if lower(coalesce(new.tipo_entrega,''))<>'reversion' then
  insert into public.vestidos_fuera_tienda(contrato_id,vestido_id,entrega_id,salida_at)
  select new.contrato_id,i.vestido_id,new.id,coalesce(new.fecha_entrega_real,new.created_at,now()) from public.contrato_items_vestidos i where i.contrato_id=new.contrato_id
  on conflict(contrato_id,vestido_id) where regreso_at is null do nothing;
 end if; return new;
end $$;
