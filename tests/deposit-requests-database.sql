begin;
-- Fixtures live only for this transaction; no customer record is changed.
do $$
declare c uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); x uuid:=gen_random_uuid(); z uuid:=gen_random_uuid(); sid uuid;
begin
 select id into sid from public.sedes limit 1;
 insert into auth.users(id,email) values(a,'deposit-test-advisor@example.com'),(b,'deposit-test-accounting@example.com'),(x,'deposit-test-other@example.com'),(z,'deposit-test-admin@example.com');
 insert into public.profiles(id,email,nombre,rol,sede_id,activo) values(a,'deposit-test-advisor@example.com','Asesora prueba','asesora',sid,true),(b,'deposit-test-accounting@example.com','Contabilidad prueba','contabilidad',sid,true),(x,'deposit-test-other@example.com','Otra sede','asesora',null,true),(z,'deposit-test-admin@example.com','Administrador prueba','ADMIN',null,true) on conflict(id) do update set rol=excluded.rol,sede_id=excluded.sede_id,activo=true;
 insert into public.contratos(numero_factura,id,numero_contrato,estado,cliente_nombre,cliente_documento,cliente_email,fecha_evento,valor_total,valor_deposito,sede_id,sede) values('FAC-TEST-INTEGRACION',c,'TEST-DEP-ROLLBACK','entregado','Cliente ficticio','TEST','test@example.com',current_date,0,0,sid,'Sede de prueba');
 insert into storage.objects(bucket_id,name) values('comprobantes_depositos',c||'/entrada.pdf'),('comprobantes_depositos',c||'/salida.pdf');
 perform set_config('test.deposit',jsonb_build_object('c',c,'a',a,'b',b,'x',x,'z',z)::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $test$
declare cfg jsonb:=current_setting('test.deposit')::jsonb; c uuid:=(cfg->>'c')::uuid; op uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); r2 uuid:=gen_random_uuid(); data jsonb; result jsonb; day date:=(now() at time zone 'America/Bogota')::date;
begin
 data:=jsonb_build_object('id',op,'contrato_id',c,'monto',300000,'fecha',day,'metodo','Efectivo');
 begin
  perform public.gestionar_deposito('ingreso',data);raise exception 'MISSING_RECEIPT_ACCEPTED';
 exception when others then if sqlerrm not like '%comprobante es obligatorio%' then raise; end if; end;
 data:=data||jsonb_build_object('comprobante_path',c||'/entrada.pdf');
 perform public.gestionar_deposito('ingreso',data);
 result:=public.gestionar_deposito('ingreso',data);
 if result->>'repetido'<>'true' then raise exception 'Duplicate income'; end if;
 if (select valor_deposito from public.contratos where id=c)<>300000 then raise exception 'Income balance wrong'; end if;
 begin
  update public.contratos set valor_deposito=900000 where id=c;raise exception 'DIRECT_AMOUNT_ACCEPTED';
 exception when others then if sqlerrm not like '%Registra el depósito con su comprobante%' then raise; end if; end;
 data:=jsonb_build_object('id',r,'contrato_id',c,'monto',100000,'descuento',10000,'motivo','Descuento acordado','metodo','Transferencia','saldo_esperado',300000,'recibido',true,'banco','Banco de prueba','tipo_cuenta','Ahorros','cuenta','0000','titular','Cliente ficticio');
 begin
  perform public.gestionar_deposito('solicitar',data-'recibido');raise exception 'MISSING_CONFIRMATION_ACCEPTED';
 exception when others then if sqlerrm not like '%Confirma que el vestido%' then raise; end if; end;
 perform public.gestionar_deposito('solicitar',data);
 if not exists(select 1 from public.solicitudes_depositos where id=r and recibido_at is not null and solicitante_id=(cfg->>'a')::uuid) then raise exception 'Receipt confirmation not recorded'; end if;
 if (select estado from public.contratos where id=c)<>'entregado' then raise exception 'Deposit flow changed logistics state'; end if;
 perform public.gestionar_deposito('solicitar',data);
 if (select count(*) from public.devoluciones_depositos where contrato_id=c)<>0 then raise exception 'Request counted as paid'; end if;
 begin
  perform public.gestionar_deposito('solicitar',data||jsonb_build_object('id',r2));raise exception 'DUPLICATE_REQUEST_ACCEPTED';
 exception when unique_violation then null; end;
 begin
  perform public.gestionar_deposito('proceso',jsonb_build_object('id',r));raise exception 'ADVISOR_PAYMENT_ACCEPTED';
 exception when others then if sqlerrm not like '%Solo Contabilidad%' then raise; end if; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',cfg->>'x','role','authenticated')::text,true);
 if (select count(*) from public.solicitudes_depositos where id=r)<>0 then raise exception 'Cross-site leak'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',cfg->>'z','role','authenticated')::text,true);
 if (select count(*) from public.solicitudes_depositos where id=r and estado in ('pendiente','en_proceso','pagado'))<>1 then raise exception 'Admin alert cannot see pending deposit'; end if;
 if (select count(*) from public.sedes)=0 then raise exception 'Admin lost site access'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',cfg->>'b','role','authenticated')::text,true);
 if (select count(*) from public.vestidos)<>0 then raise exception 'Accounting can read inventory'; end if;
 if (select count(*) from public.sedes)<>0 then raise exception 'Accounting can access site management'; end if;
 if (select count(*) from public.referidores)<>0 then raise exception 'Accounting can read partners'; end if;
 if (select count(*) from public.pagos)<>0 then raise exception 'Accounting can read rental payments'; end if;
 if (select count(*) from public.profiles where id<>(cfg->>'b')::uuid)<>0 then raise exception 'Accounting can read other profiles'; end if;
 update public.contratos set cliente_nombre='MUTATED' where id=c;
 if found then raise exception 'Accounting can edit contracts'; end if;
 update public.profiles set rol='admin' where id=(cfg->>'b')::uuid;
 if found then raise exception 'Accounting can escalate role'; end if;
 begin
  perform public.validar_y_quemar_codigo('TEST',c::text);raise exception 'Accounting can use discount RPC';
 exception when insufficient_privilege then null; end;
 begin
  perform public.validar_y_quemar_codigo('TEST',c::text,100000::numeric);raise exception 'Accounting can use extended discount RPC';
 exception when insufficient_privilege then null; end;


 if exists(select 1 from public.contratos) then raise exception 'Accounting can read complete contracts'; end if;
 if not exists(select 1 from public.contratos_depositos_pendientes() where id=c) then raise exception 'Missing queue identification'; end if;
 if exists(select 1 from public.movimientos_depositos) or exists(select 1 from public.devoluciones_depositos) then raise exception 'Accounting can read financial history'; end if;
 if exists(select 1 from public.kpi_vestidos_populares) or exists(select 1 from public.vista_historial_alquileres) then raise exception 'Accounting view leak'; end if;
 begin
  perform public.gestionar_deposito('ingreso',jsonb_build_object('contrato_id',c));raise exception 'ACCOUNTING_INCOME_ACCEPTED';
 exception when insufficient_privilege then null; end;
 begin
  perform public.gestionar_deposito('solicitar',jsonb_build_object('contrato_id',c));raise exception 'ACCOUNTING_REQUEST_ACCEPTED';
 exception when insufficient_privilege then null; end;
 begin
  perform public.gestionar_deposito('soporte',jsonb_build_object('contrato_id',c));raise exception 'ACCOUNTING_SUPPORT_ACCEPTED';
 exception when insufficient_privilege then null; end;
 if (select count(*) from public.solicitudes_depositos where id=r)<>1 then raise exception 'Accounting cannot see queue'; end if;
 begin
  insert into storage.objects(bucket_id,name) values('comprobantes_depositos',c||'/'||r||'/too-early.pdf');raise exception 'UPLOAD_BEFORE_ASSIGNMENT';
 exception when insufficient_privilege then null; end;
 perform public.gestionar_deposito('proceso',jsonb_build_object('id',r));
 insert into storage.objects(bucket_id,name) values('comprobantes_depositos',c||'/'||r||'/assigned.pdf');
 if not exists(select 1 from storage.objects where name=c||'/'||r||'/assigned.pdf') then raise exception 'Assigned receipt not visible'; end if;
 begin
  insert into storage.objects(bucket_id,name) values('comprobantes_depositos',c||'/other/unrelated.pdf');raise exception 'UNRELATED_RECEIPT_UPLOAD';
 exception when insufficient_privilege then null; end;
 begin
  perform public.gestionar_deposito('pagar',jsonb_build_object('id',r,'fecha',day));raise exception 'PAYMENT_WITHOUT_RECEIPT_ACCEPTED';
 exception when others then if sqlerrm not like '%comprobante es obligatorio%' then raise; end if; end;
 data:=jsonb_build_object('id',r,'fecha',day,'comprobante_path',c||'/salida.pdf');
 perform public.gestionar_deposito('pagar',data);perform public.gestionar_deposito('pagar',data);

 if exists(select 1 from public.solicitudes_depositos where id=r) then raise exception 'Completed request leaked'; end if;
 if exists(select 1 from public.historial_solicitudes_depositos where solicitud_id=r) then raise exception 'Completed history leaked'; end if;
 if exists(select 1 from public.contratos_depositos_pendientes() where id=c) then raise exception 'Completed contract leaked'; end if;
 if exists(select 1 from storage.objects where bucket_id='comprobantes_depositos' and name=c||'/salida.pdf') then raise exception 'Completed receipt leaked'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',cfg->>'a','role','authenticated')::text,true);
 if (select count(*) from public.devoluciones_depositos where contrato_id=c)<>1 then raise exception 'Duplicate payment'; end if;
 if (select estado from public.solicitudes_depositos where id=r)<>'devuelto' then raise exception 'Not returned'; end if;
 if (select count(*) from public.historial_solicitudes_depositos where solicitud_id=r)<>4 then raise exception 'Missing audit events'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',cfg->>'a','role','authenticated')::text,true);
 data:=jsonb_build_object('id',r2,'contrato_id',c,'monto',190000,'fecha',day,'metodo','Efectivo','saldo_esperado',190000,'recibido',true,'comprobante_path',c||'/salida.pdf');
 perform public.gestionar_deposito('solicitar',data);perform public.gestionar_deposito('solicitar',data);
 if (select estado from public.solicitudes_depositos where id=r2)<>'devuelto' then raise exception 'Cash required authorization'; end if;
 if (select sum(monto_devuelto+coalesce(monto_descuento,0)) from public.devoluciones_depositos where contrato_id=c)<>300000 then raise exception 'Final balance wrong'; end if;
 begin
  insert into public.devoluciones_depositos(contrato_id,monto_devuelto) values(c,1);raise exception 'LEGACY_BYPASS_ACCEPTED';
 exception when insufficient_privilege then null; end;

 -- A transfer entry cannot be returned directly in cash; cancellation releases reservation.
 op:=gen_random_uuid(); r:=gen_random_uuid();
 perform public.gestionar_deposito('ingreso',jsonb_build_object('id',op,'contrato_id',c,'monto',50000,'fecha',day,'metodo','Transferencia','comprobante_path',c||'/entrada.pdf'));
 data:=jsonb_build_object('id',r,'contrato_id',c,'monto',50000,'fecha',day,'metodo','Efectivo','saldo_esperado',50000,'recibido',true,'comprobante_path',c||'/salida.pdf');
 begin
  perform public.gestionar_deposito('solicitar',data);raise exception 'TRANSFER_TO_CASH_ACCEPTED';
 exception when others then if sqlerrm not like '%entrada en efectivo suficiente%' then raise; end if; end;
 data:=data||jsonb_build_object('metodo','Transferencia','banco','Test','cuenta','000','titular','Test','tipo_cuenta','Ahorros');
 begin
  perform public.gestionar_deposito('solicitar',data||jsonb_build_object('recibido',false));raise exception 'UNRECEIVED_ACCEPTED';
 exception when others then if sqlerrm not like '%Confirma que el vestido%' then raise; end if; end;
 begin
  perform public.gestionar_deposito('solicitar',data||jsonb_build_object('monto',50001));raise exception 'OVERDRAW_ACCEPTED';
 exception when others then if sqlerrm not like '%saldo%' then raise; end if; end;
 perform public.gestionar_deposito('solicitar',data);
 perform public.gestionar_deposito('cancelar',jsonb_build_object('id',r,'motivo','Prueba de cancelación'));
 perform public.gestionar_deposito('solicitar',data||jsonb_build_object('id',gen_random_uuid()));
end $test$;
rollback;
select 'PASS: receipts, balances, duplicate requests/payments, accounting permissions, site isolation, cash, audit, legacy protection' as verification;
