-- Contracts left in «borrador» (never signed) after 24 hours become alerts so they are kept up to date:
--  · Novedades contables «Contrato sin firmar (borrador)», responsable Sede (send the signing link or close it).
--  · Novedades contables «Borrador para revisar», responsable Contabilidad, when it also has no invoice, no payment, the client has
--    another valid contract (possible duplicate) or the event date is impossible.
--  · Cierres de caja › Pendientes de la sede: how many drafts the store has.
-- Both disappear by themselves when the contract leaves «borrador». Text patches over the live functions (same pattern as earlier steps).
-- Reversible: re-apply 20270521120000_novedades_contables.sql and 20270508120000_caja_pendientes.sql.

do $mig$
declare d text; viejo text; nuevo text;
begin
 -- 1. Novedades contables: two new sources after «Cierre de caja con diferencia».
 d:=pg_get_functiondef('public.novedades_contables(uuid)'::regprocedure);
 viejo:='c.diferencia<>0 and c.fecha>=hoy-15;';
 if position(viejo in d)=0 then raise exception 'novedades_contables: no se encontró el punto de inserción'; end if;
 nuevo:=$n$c.diferencia<>0 and c.fecha>=hoy-15
 union all
 select case when b.revisar is null then 'borrador:' else 'borrev:' end||k.id,
  case when b.revisar is null then 'Contrato sin firmar (borrador)' else 'Borrador para revisar' end, s.nombre::text, s.id, k.numero_contrato::text,
  format('%s · evento %s · $%s%s',coalesce(k.cliente_nombre,'Sin clienta'),coalesce(to_char(k.fecha_evento,'DD/MM/YYYY'),'sin fecha'),to_char(coalesce(k.valor_total,0),'FM999G999G999'),
   coalesce(' · '||b.revisar,' · envía el enlace de firma o ciérralo')),
  '/dashboard?contratoId='||k.id, case when b.revisar is null then 'Sede' else 'Contabilidad' end, false, (k.created_at at time zone 'America/Bogota')::date
 from public.contratos k join public.sedes s on s.id=k.sede_id
 cross join lateral (select nullif(concat_ws(' · ',
   case when nullif(btrim(k.numero_factura),'') is null then 'sin factura' end,
   case when not exists(select 1 from public.pagos p where p.contrato_id=k.id and p.anulado_at is null) then 'sin abono' end,
   case when k.cliente_documento is not null and exists(select 1 from public.contratos o where o.id<>k.id and o.cliente_documento=k.cliente_documento
     and lower(coalesce(o.estado,'')) not in ('borrador','anulado','cancelado','cancelada','rechazado')) then 'la clienta tiene otro contrato válido (¿duplicado?)' end,
   case when k.fecha_evento is not null and (k.fecha_evento<date '2000-01-01' or k.fecha_evento<(k.created_at at time zone 'America/Bogota')::date) then 'fecha del evento imposible' end),'') revisar) b
 where k.sede_id=any(sedes) and lower(coalesce(k.estado,''))='borrador' and k.created_at<now()-interval '24 hours';$n$;
 execute replace(d,viejo,nuevo);

 -- 2. Cierres de caja › Pendientes de la sede.
 d:=pg_get_functiondef('public.caja_pendientes(uuid)'::regprocedure);
 viejo:=E' return r;\nend';
 if position(viejo in d)=0 then raise exception 'caja_pendientes: no se encontró el punto de inserción'; end if;
 nuevo:=$n$ select count(*),min((c.created_at at time zone 'America/Bogota')::date) into n,d from public.contratos c where c.sede_id=p_sede and lower(coalesce(c.estado,''))='borrador' and c.created_at<now()-interval '24 hours';
 if n>0 then r:=r||jsonb_build_array(jsonb_build_object('nivel','alta','texto',format('%s contrato(s) en borrador sin firmar (desde el %s): envía el enlace de firma a la clienta o ciérralo. Contabilidad los revisa.',n,to_char(d,'DD/MM')))); end if;
 return r;
end$n$;
 execute replace(d,viejo,nuevo);
end $mig$;
