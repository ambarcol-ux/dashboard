-- Novedades contables › «Factura de Siigo por corregir»: an invoice the ERP created in Siigo whose contract changed afterwards and that
-- the ERP could not edit (Siigo does not edit an invoice that already has receipts). It lists what to fix by hand in Siigo:
--  · value: the original invoice (as imported from Siigo every night) differs from the contract;
--  · dress: a dress code of the contract is not in the invoice;
--  · dates, dress reference or payment method changed in the contract after the invoice (or after the last «Ya lo hice»).
-- «Ya lo hice» reuses novedad_resolver (key doc:<invoice>); value and dress are checked again with the next nightly import.
-- Contract changes of those fields are kept in config_historial (private.config_historial) from now on.
-- Reversible: remove the trigger contratos_historial_factura and re-apply novedades_contables from its previous migration.
create trigger contratos_historial_factura after update on public.contratos for each row
 when (old.fecha_evento is distinct from new.fecha_evento or old.fecha_cita_medidas is distinct from new.fecha_cita_medidas
  or old.fecha_prueba_final is distinct from new.fecha_prueba_final or old.fecha_entrega_envio is distinct from new.fecha_entrega_envio
  or old.fecha_pre_xv is distinct from new.fecha_pre_xv or old.referencia_vestido is distinct from new.referencia_vestido
  or old.metodo_pago is distinct from new.metodo_pago or old.valor_total is distinct from new.valor_total)
 execute function private.config_historial();

do $mig$
declare d text; a text:='and v.sede_actual_id=t.sede_id and not coalesce(v.archivado,false);';
begin
 d:=pg_get_functiondef('public.novedades_contables(uuid)'::regprocedure);
 if position(a in d)=0 then raise exception 'novedades_contables: punto'; end if;
 d:=replace(d,a,left(a,length(a)-1)||$n$
 union all
 select 'doc:'||f.id, 'Factura de Siigo por corregir', s.nombre::text, s.id, k.numero_contrato::text||' · '||coalesce(f.siigo_numero,''),
  left(concat_ws(' · ',
   case when x.valor_dif then format('valor en Siigo $%s y en el contrato $%s',to_char(b.fact,'FM999G999G999'),to_char(b.contrato,'FM999G999G999')) end,
   case when x.faltan<>'' then 'vestido del contrato que no está en la factura: '||x.faltan end,
   case when x.cambios<>'' then 'cambió en el contrato: '||x.cambios end,
   'corrígela a mano en Siigo y verifica el saldo'),500),
  '/dashboard?contratoId='||k.id, 'Contabilidad', true, coalesce(x.ultimo,f.created_at)::date
 from public.siigo_documentos f join public.contratos k on k.id=f.contrato_id join public.sedes s on s.id=k.sede_id
  join public.siigo_historico h on h.siigo_id=f.siigo_id and h.tipo='factura'
  cross join lateral (select greatest(0,coalesce(k.valor_total,0)-coalesce(k.descuento_plan_ahorro,0))+coalesce(k.total_arreglos,0) contrato,
   coalesce(h.total,0) fact, (f.datos->>'resuelto_at')::timestamptz res, coalesce((f.datos->>'resuelto_at')::timestamptz,f.created_at) desde) b
  cross join lateral (select
   abs(b.contrato-b.fact)>1 and (b.res is null or h.importado_at>b.res) valor_dif,
   case when b.res is null or h.importado_at>b.res then coalesce((select string_agg(distinct btrim(v.codigo),', ') from public.contrato_items_vestidos i join public.vestidos v on v.id=i.vestido_id
     where i.contrato_id=k.id and upper(btrim(v.codigo)) not in (select upper(btrim(it->>'code')) from jsonb_array_elements(case when jsonb_typeof(h.datos->'items')='array' then h.datos->'items' else '[]'::jsonb end) it)),'') else '' end faltan,
   coalesce((select string_agg(c.etq||' '||coalesce(c.nuevo,'(vacío)'),', ' order by c.etq) from (
     select distinct on (e.key) e.key, ch.despues->>e.key nuevo,
      case e.key when 'fecha_evento' then 'fecha del evento' when 'fecha_cita_medidas' then 'cita de medidas' when 'fecha_prueba_final' then 'prueba final'
       when 'fecha_entrega_envio' then 'fecha de entrega' when 'fecha_pre_xv' then 'fecha Pre XV' when 'referencia_vestido' then 'referencia del vestido' else 'forma de pago' end etq
     from public.config_historial ch cross join lateral unnest(array['fecha_evento','fecha_cita_medidas','fecha_prueba_final','fecha_entrega_envio','fecha_pre_xv','referencia_vestido','metodo_pago']) e(key)
     where ch.tabla='contratos' and ch.clave=k.id::text and ch.created_at>b.desde and (ch.antes->>e.key) is distinct from (ch.despues->>e.key)
     order by e.key, ch.created_at desc) c),'') cambios,
   (select max(ch.created_at) from public.config_historial ch where ch.tabla='contratos' and ch.clave=k.id::text and ch.created_at>b.desde) ultimo) x
 where k.sede_id=any(sedes) and f.tipo='factura' and f.origen='contrato' and f.estado='enviado' and f.siigo_id is not null and coalesce(f.datos->>'vinculada','')<>'true'
  and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','cancelada','borrador','rechazado')
  and (x.valor_dif or x.faltan<>'' or x.cambios<>'');$n$);
 execute d;
end $mig$;
