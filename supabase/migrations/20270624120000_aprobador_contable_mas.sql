-- Whoever approves a store's accounting (private.lider_contable: store leaders until 10/12, Pereira's franquiciado) can also, in that
-- store only: change the value or category of a cash movement, forgive late-return fines and register historical withdrawal refunds.
-- Reversible: re-run the previous definitions (remove the «or private.lider_contable(...)» parts).
do $mig$
declare d text;
begin
 d:=pg_get_functiondef('private.editar_movimiento_caja'::regproc);
 if position('lider_contable' in d)=0 then
  d:=replace(d,'if not private.es_finanzas() and (n.valor is distinct from m.valor or n.categoria is distinct from m.categoria) then',
               'if not (private.es_finanzas() or private.lider_contable(m.sede_id)) and (n.valor is distinct from m.valor or n.categoria is distinct from m.categoria) then');
  if position('lider_contable' in d)=0 then raise exception 'editar_movimiento_caja: no aplicado'; end if;
  execute d; end if;
 d:=pg_get_functiondef('private.condonar_multa'::regproc);
 if position('lider_contable' in d)=0 then
  d:=replace(d,'if not private.es_finanzas() then raise exception ''Solo administración o contabilidad puede condonar multas.''',
               'if not (private.es_finanzas() or private.lider_contable((select x.sede_id from public.contratos x where x.id=p_contrato))) then raise exception ''Solo administración, contabilidad o quien aprueba lo contable de la sede puede condonar multas.''');
  if position('lider_contable' in d)=0 then raise exception 'condonar_multa: no aplicado'; end if;
  execute d; end if;
 d:=pg_get_functiondef('private.desistimiento_devolver'::regproc);
 if position('lider_contable' in d)=0 then
  d:=replace(d,'if not private.es_finanzas() then raise exception ''Solo administración o contabilidad registran devoluciones históricas.''',
               'if not (private.es_finanzas() or private.lider_contable(d.sede_id)) then raise exception ''Solo administración, contabilidad o quien aprueba lo contable de la sede registran devoluciones históricas.''');
  if position('lider_contable' in d)=0 then raise exception 'desistimiento_devolver: no aplicado'; end if;
  execute d; end if;
end $mig$;
