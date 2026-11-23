-- Abonos sin soporte: a payment whose invoice or receipt is in Siigo (same contract, same number and the same value among that
-- document's payments, or an «Ajuste:» payment brought from that Siigo document) has the Siigo document as its support: it no longer counts in the alert nor blocks the cash close.
-- New payments without that match keep asking for their photo. Reversible: re-apply the three functions from their previous
-- migrations and remove private.pago_en_siigo.
create or replace function private.pago_en_siigo(p_pago uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.pagos p join public.siigo_historico h on h.contrato_id=p.contrato_id
  where p.id=p_pago and coalesce(btrim(p.numero_recibo),'')<>''
   and upper(replace(h.numero,' ',''))=upper(replace(p.numero_recibo,' ',''))
   and (abs(coalesce(h.total,0)-p.valor_pagado)<1 or coalesce(p.observaciones,'') like 'Ajuste:%'
    or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(h.datos->'payments')='array' then h.datos->'payments' else '[]'::jsonb end) x
     where abs(coalesce((x->>'value')::numeric,0)-p.valor_pagado)<1)
    or abs(coalesce((h.datos->'payment'->>'value')::numeric,0)-p.valor_pagado)<1));
$$;
revoke all on function private.pago_en_siigo(uuid) from public, anon;
grant execute on function private.pago_en_siigo(uuid) to authenticated;

do $mig$
declare f text; d text; a text:='not exists(select 1 from public.soportes_pago s where s.pago_id=p.id and s.activo)';
begin
 foreach f in array array['private.alertas_inicio()','private.alertas_inicio_sede(uuid)','private.pagos_sin_soporte(uuid,date)'] loop
  d:=pg_get_functiondef(f::regprocedure);
  if position(a in d)=0 then raise exception '%: punto', f; end if;
  execute replace(d,a,'('||a||' and not private.pago_en_siigo(p.id))');
 end loop;
end $mig$;
