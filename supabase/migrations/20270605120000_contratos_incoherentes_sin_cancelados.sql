-- Inicio › «Contratos con datos por revisar»: cancelled, annulled, draft or rejected contracts no longer count (their leftover balance is
-- not owed: drafts have their own alert and cancellations go through Desistimientos). No data changes.
-- Reversible: re-apply alertas_inicio_sede from its previous migration.
do $mig$
declare d text; a text;
begin
 d:=pg_get_functiondef('private.alertas_inicio_sede(uuid)'::regprocedure);
 a:='from public.contratos c left join public.sedes s on s.id=c.sede_id where lim is null or c.sede_id=any(lim))';
 if position(a in d)=0 then raise exception 'alertas_inicio_sede: punto'; end if;
 d:=replace(d,a,'from public.contratos c left join public.sedes s on s.id=c.sede_id where (lim is null or c.sede_id=any(lim)) and lower(coalesce(c.estado,'''')) not in (''cancelado'',''anulado'',''borrador'',''rechazado''))');
 execute d;
end $mig$;
