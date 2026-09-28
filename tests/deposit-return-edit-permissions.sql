-- Integration checks: all attempted edits roll back inside subtransactions.

create temporary table deposit_edit_test_results(test text, result text) on commit drop;
do $test$
declare
 actor record; request_row public.solicitudes_depositos%rowtype;
 before_row jsonb; before_history bigint; answer jsonb; updated_notes text;
begin
 select * into request_row from public.solicitudes_depositos where estado in ('pendiente','en_proceso') order by created_at limit 1;
 if not found then raise exception 'No pending request available for rollback test'; end if;
 before_row:=to_jsonb(request_row);
 select count(*) into before_history from public.historial_solicitudes_depositos where solicitud_id=request_row.id;
 for actor in select distinct on (lower(rol)) id,lower(rol) as rol from public.profiles where coalesce(activo,true) and lower(rol) in ('admin','contabilidad','asesora') order by lower(rol),id loop
  begin
   perform set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated')::text,true);
   set local role authenticated;
   if current_user <> 'authenticated' then raise exception 'Wrong test role'; end if;
   answer:=public.editar_datos_devolucion(jsonb_build_object('id',request_row.id,
      'banco',coalesce(request_row.banco,'Prueba transaccional'),
      'tipo_cuenta',coalesce(request_row.tipo_cuenta,'Ahorros'),
      'cuenta',coalesce(request_row.cuenta,'000000'),
      'titular',coalesce(request_row.titular,'Prueba transaccional'),
      'observaciones','VERIFICACION_TRANSACCIONAL_SIN_PERSISTIR'));
   if actor.rol='asesora' then raise exception 'Advisor unexpectedly allowed'; end if;
   if answer->>'ok' <> 'true' then raise exception 'Update did not report success'; end if;
   select observaciones into updated_notes from public.solicitudes_depositos where id=request_row.id;
   if updated_notes is distinct from 'VERIFICACION_TRANSACCIONAL_SIN_PERSISTIR' then raise exception 'Saved value not readable'; end if;
   if (select count(*) from public.historial_solicitudes_depositos where solicitud_id=request_row.id) <> before_history+1 then raise exception 'Missing audit event'; end if;
   raise exception using errcode='ZX001',message='Verified save and audit; rollback this test';
  exception
   when sqlstate 'ZX001' then insert into deposit_edit_test_results values(actor.rol,'PASS: saved, read back and audited; rolled back');
   when insufficient_privilege then
    if actor.rol<>'asesora' or sqlerrm not like 'Solo Administrador%' then raise; end if;
    insert into deposit_edit_test_results values(actor.rol,'PASS: existing role restriction preserved');
  end;
 end loop;
 if (select to_jsonb(s) from public.solicitudes_depositos s where id=request_row.id) is distinct from before_row then raise exception 'Request was not rolled back'; end if;
 if (select count(*) from public.historial_solicitudes_depositos where solicitud_id=request_row.id) <> before_history then raise exception 'Audit was not rolled back'; end if;
 begin
  perform set_config('request.jwt.claims','{}',true);
  set local role authenticated;
  perform public.editar_datos_devolucion(jsonb_build_object('id',request_row.id));
  raise exception 'Missing identity unexpectedly accepted';
 exception when raise_exception then
  if sqlerrm <> 'Inicia sesión.' then raise; end if;
  insert into deposit_edit_test_results values('missing_identity','PASS: rejected');
 end;
 insert into deposit_edit_test_results values('data_integrity','PASS: original request and audit unchanged');
end
$test$;
select * from deposit_edit_test_results;
