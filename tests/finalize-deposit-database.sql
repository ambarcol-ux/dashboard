
create temporary table finalize_deposit_results(test text,result text) on commit drop;
do $test$
declare
 cid uuid; actor record; c_before jsonb; ledger_before bigint; amount numeric; response jsonb; s public.solicitudes_depositos%rowtype;
 request_count bigint; wrong_actor uuid; admin_id uuid; scenario record;
begin
 select c.id into cid from public.contratos c
 where lower(c.estado)='mantenimiento' and c.valor_deposito=500000
 and coalesce(c.saldo,0)+coalesce(c.total_multas,0)<=0 and nullif(btrim(c.numero_factura),'') is not null
 and not exists(select 1 from public.solicitudes_depositos q where q.contrato_id=c.id and q.estado in ('pendiente','en_proceso','pagado'))
 and not exists(select 1 from public.devoluciones_depositos d where d.contrato_id=c.id)
 and exists(select 1 from public.profiles p where lower(p.rol)='asesora' and coalesce(p.activo,true) and p.sede_id=c.sede_id)
 order by c.id limit 1;
 if cid is null then raise exception 'No suitable rollback fixture'; end if;
 select to_jsonb(c) into c_before from public.contratos c where id=cid;
 select count(*) into ledger_before from public.movimientos_depositos where contrato_id=cid;
 for actor in select distinct on (lower(p.rol)) p.id,lower(p.rol) rol from public.profiles p
 where coalesce(p.activo,true) and (lower(p.rol)='admin' or (lower(p.rol)='asesora' and p.sede_id=(select sede_id from public.contratos where id=cid))) order by lower(p.rol),p.id loop
  if actor.rol='admin' then admin_id:=actor.id; end if;
  foreach amount in array array[300000::numeric,0::numeric,500000::numeric] loop
   begin
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated')::text,true);
    set local role authenticated;
    response:=public.finalizar_contrato_con_deposito(cid,amount,case when amount>0 then 'Daño de prueba transaccional' else '' end,500000,null);
    if response->>'finalizado'<>'true' then raise exception 'Not finalized'; end if;
    select * into s from public.solicitudes_depositos where id=(response->>'solicitud_id')::uuid;
    if s.monto<>500000-amount or s.descuento<>amount or (amount>0 and s.motivo<>'Daño de prueba transaccional') then raise exception 'Wrong return amounts'; end if;
    if (select valor_deposito from public.contratos where id=cid)<>500000 then raise exception 'Original deposit changed'; end if;
    if (select count(*) from public.movimientos_depositos where contrato_id=cid)<>ledger_before then raise exception 'Money movement created on finalization'; end if;
    if not exists(select 1 from public.historial_solicitudes_depositos where solicitud_id=s.id and usuario_id=actor.id) then raise exception 'Missing audit'; end if;
    select count(*) into request_count from public.solicitudes_depositos where contrato_id=cid;
    response:=public.finalizar_contrato_con_deposito(cid,amount,'Retry',500000,null);
    if response->>'repetido'<>'true' or (select count(*) from public.solicitudes_depositos where contrato_id=cid)<>request_count then raise exception 'Retry duplicated request'; end if;
    raise exception using errcode='ZX001',message='rollback successful test';
   exception when sqlstate 'ZX001' then
    insert into finalize_deposit_results values(actor.rol||' deduction '||amount,'PASS: closure, amounts, original deposit, audit, retry; rolled back');
   end;
  end loop;
 end loop;

 -- Preserve prior requests; never rewrite a payment already in progress.
 foreach amount in array array[1::numeric,2::numeric] loop
  begin
   insert into public.solicitudes_depositos(id,contrato_id,monto,descuento,metodo,estado,solicitante_id,solicitante_nombre,motivo)
   values(gen_random_uuid(),cid,200000,300000,'Transferencia',case when amount=1 then 'pendiente' else 'en_proceso' end,admin_id,'Rollback test','Existing reason')
   returning * into s;
   perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
   set local role authenticated;
   response:=public.finalizar_contrato_con_deposito(cid,0,'',500000,s.id);
   if response->>'solicitud_id'<>s.id::text or (response->>'monto_devolver')::numeric<>200000 then raise exception 'Existing request changed'; end if;
   if (select to_jsonb(q) from public.solicitudes_depositos q where id=s.id) is distinct from to_jsonb(s) then raise exception 'Existing request mutated'; end if;
   raise exception using errcode='ZX001',message='rollback';
  exception when sqlstate 'ZX001' then
   insert into finalize_deposit_results values('existing request '||amount,'PASS: amounts, reason and state preserved; rolled back');
  end;
 end loop;
 begin
  insert into public.solicitudes_depositos(id,contrato_id,monto,descuento,metodo,estado,solicitante_id,solicitante_nombre)
  values(gen_random_uuid(),cid,500000,0,'Transferencia','pendiente',admin_id,'Rollback test') returning * into s;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  set local role authenticated;
  perform public.finalizar_contrato_con_deposito(cid,300000,'Damage',500000,null);
  raise exception using errcode='ZX002',message='Concurrent request ignored';
 exception when raise_exception then
  if sqlerrm not like 'La solicitud de devolución cambió%' then raise; end if;
  insert into finalize_deposit_results values('request appeared after preview','PASS: stale confirmation rejected');
 end;
 for scenario in select * from (values
 ('negative',-1::numeric,'Daño',500000::numeric),
 ('excess',500001::numeric,'Daño',500000::numeric),
 ('precision',0.001::numeric,'Daño',500000::numeric),
 ('missing reason',300000::numeric,'',500000::numeric),
 ('stale balance',300000::numeric,'Daño',499999::numeric)) t(name,discount,reason,balance) loop
  begin
   perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
   set local role authenticated;
   perform public.finalizar_contrato_con_deposito(cid,scenario.discount,scenario.reason,scenario.balance,null);
   raise exception using errcode='ZX002',message='Invalid input accepted';
  exception when raise_exception then
   insert into finalize_deposit_results values(scenario.name,'PASS: rejected and rolled back');
  end;
 end loop;
 for actor in select id,rol from public.profiles where coalesce(activo,true) and
  (lower(rol)='contabilidad' or (lower(rol)='asesora' and sede_id is distinct from (select sede_id from public.contratos where id=cid))) loop
  begin
   perform set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated')::text,true);
   set local role authenticated;
   perform public.finalizar_contrato_con_deposito(cid,0,'',500000,null);
   raise exception using errcode='ZX002',message='Unauthorized user accepted';
  exception when insufficient_privilege then
   insert into finalize_deposit_results values(actor.rol||' outside scope','PASS: rejected');
  end;
 end loop;
 if (select to_jsonb(c) from public.contratos c where id=cid) is distinct from c_before then raise exception 'Contract not restored'; end if;
 if exists(select 1 from public.solicitudes_depositos where contrato_id=cid and estado in ('pendiente','en_proceso','pagado')) then raise exception 'Request not rolled back'; end if;
 insert into finalize_deposit_results values('integrity','PASS: original contract and request state preserved');
end $test$;
select * from finalize_deposit_results;
