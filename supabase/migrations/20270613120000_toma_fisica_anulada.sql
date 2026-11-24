-- Toma física: a count can be annulled (e.g., a test opened and closed without counting). An annulled count is kept for history but
-- no longer produces «Vestido faltante en la toma física» nor is shown as the store's last count. Annuls the Barranquilla test of 23/11
-- (closed in 14 seconds with 0 dresses marked). Reversible: set anulada=false.
alter table public.tomas_fisicas add column if not exists anulada boolean not null default false;
do $mig$
declare d text; a text;
begin
 d:=pg_get_functiondef('public.novedades_contables(uuid)'::regprocedure);
 a:='where t2.sede_id=t.sede_id and t2.estado=''cerrada'' order by';
 if position(a in d)=0 then raise exception 'novedades_contables: punto'; end if;
 execute replace(d,a,'where t2.sede_id=t.sede_id and t2.estado=''cerrada'' and not t2.anulada order by');
 d:=pg_get_functiondef('private.toma_detalle(uuid)'::regprocedure);
 a:='where sede_id=p_sede order by';
 if position(a in d)=0 then raise exception 'toma_detalle: punto'; end if;
 execute replace(d,a,'where sede_id=p_sede and not anulada order by');
end $mig$;
update public.tomas_fisicas set anulada=true, nota=coalesce(nota||' · ','')||'Anulada: prueba sin conteo (cerrada en 14 segundos), aprobado por administración'
where sede_id=(select id from public.sedes where nombre='Barranquilla') and estado='cerrada' and created_at::date='2026-11-23'
 and not exists(select 1 from public.toma_fisica_items i where i.toma_id=tomas_fisicas.id and i.encontrado);
