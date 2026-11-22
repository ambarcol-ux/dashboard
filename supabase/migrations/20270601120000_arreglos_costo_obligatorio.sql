-- Arreglos ligados al contrato (Operaciones › Adaptaciones y confección): receiving a sastrería job now requires its cost to Ámbar
-- (0 when the store did it) and, when it has a cost, who did it, so it lands in Pagos a proveedores and in the Estado de resultados.
-- Novedades contables: sastrería/lavandería paid from the cash register or as an expense without going through Adaptaciones.
-- Reversible: re-apply arreglo_recibir and novedades_contables from their previous migrations.

do $mig$
declare d text; a text;
begin
 d:=pg_get_functiondef('public.arreglo_recibir(uuid,jsonb,numeric)'::regprocedure);
 a:='if p_costo is not null and (p_costo<0 or p_costo<>round(p_costo,2)) then raise exception ''Revisa el costo.''; end if;';
 if position(a in d)=0 then raise exception 'arreglo_recibir: punto'; end if;
 d:=replace(d,a,a||E'\n if m.tipo=''SASTRERÍA'' and coalesce(p_costo,m.costo) is null then raise exception ''Escribe cuánto le costó el arreglo a Ámbar (0 si lo hizo la sede).''; end if;\n if coalesce(p_costo,m.costo,0)>0 and m.proveedor_id is null then raise exception ''Elige quién hizo el arreglo (Editar › Proveedor) para que quede su pago pendiente.''; end if;');
 execute d;

 d:=pg_get_functiondef('public.novedades_contables(uuid)'::regprocedure);
 a:='where todo and l.estado=''pendiente'' and l.fecha<hoy-3;';
 if position(a in d)=0 then raise exception 'novedades_contables: punto'; end if;
 d:=replace(d,a,left(a,length(a)-1)||$n$
 union all
 select 'sastcaja:'||m.id, 'Arreglo pagado sin pasar por Adaptaciones', s.nombre::text, s.id, to_char(m.fecha,'DD/MM/YYYY'),
  format('$%s · %s: regístralo en Adaptaciones y confección con el vestido, el contrato y el proveedor',to_char(m.valor,'FM999G999G999'),left(coalesce(m.descripcion,m.categoria),120)),
  '/dashboard/arreglos', 'Sede', false, m.fecha
 from public.caja_movimientos m join public.sedes s on s.id=m.sede_id
 where m.sede_id=any(sedes) and m.tipo='egreso' and m.anulado_at is null and m.fecha>=hoy-45
  and (coalesce(m.descripcion,'')||' '||coalesce(m.categoria,'')) ~* 'sastr|arregl|costur|modist|lavand|tintor'
  and coalesce(m.origen,'') not in ('devolucion','gasto');$n$);
 execute d;
end $mig$;
