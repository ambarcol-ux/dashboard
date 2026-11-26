-- A payment (abono) cannot reuse the exact same support file (same content) of another active payment with the same value:
-- that is a duplicate registration. A transfer split into several payments of different values can still share its support.
-- Reversible: remove trigger soportes_pago_duplicado.
create or replace function private.soporte_pago_duplicado() returns trigger language plpgsql security definer set search_path='' as $$
declare tag text; v numeric; dup record;
begin
 if not coalesce(new.activo,true) then return new; end if;
 select o.metadata->>'eTag' into tag from storage.objects o where o.bucket_id='soportes_pagos' and o.name=new.archivo_path;
 if tag is null then return new; end if;
 select valor_pagado into v from public.pagos where id=new.pago_id;
 select k.numero_contrato,p.valor_pagado,p.fecha_pago into dup
 from public.soportes_pago s join storage.objects o on o.bucket_id='soportes_pagos' and o.name=s.archivo_path
  join public.pagos p on p.id=s.pago_id join public.contratos k on k.id=p.contrato_id
 where s.activo and s.pago_id<>new.pago_id and o.metadata->>'eTag'=tag and p.anulado_at is null and p.valor_pagado=v limit 1;
 if found then
  raise exception 'Este soporte ya está registrado en un abono de $% del % (contrato %). Si es el mismo pago, no lo registres otra vez; si es otro pago, adjunta su propio comprobante.',
   replace(to_char(dup.valor_pagado,'FM999G999G999'),',','.'),to_char(dup.fecha_pago at time zone 'UTC','DD/MM/YYYY'),dup.numero_contrato;
 end if;
 return new;
end $$;
create or replace trigger soportes_pago_duplicado before insert on public.soportes_pago for each row execute function private.soporte_pago_duplicado();
