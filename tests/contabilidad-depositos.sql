begin;
-- Las pruebas se revierten junto con sus datos.
select set_config('test.accountant',(select id::text from public.profiles where lower(rol)='contabilidad' and coalesce(activo,true) limit 1),true);
select set_config('test.contract',gen_random_uuid()::text,true);
select set_config('test.movement',gen_random_uuid()::text,true);
insert into public.contratos(id,numero_contrato,numero_factura,cliente_nombre,cliente_documento,estado,valor_deposito,sede,sede_id,es_alquiler_estrene,cliente_email,fecha_evento,valor_total)
values(current_setting('test.contract')::uuid,'PRUEBA-CONTABILIDAD-ROLLBACK','TEST-ROLLBACK','Prueba transaccional','TEST','borrador',0,'Prueba',(select id from public.sedes limit 1),false,'test@example.invalid',current_date,0);
select set_config('request.jwt.claim.sub',current_setting('test.accountant'),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $test$ declare v jsonb; n integer; begin
 if not exists(select 1 from public.contratos_depositos_contabilidad() where id=current_setting('test.contract')::uuid) then raise exception 'No ve contrato sin depósito'; end if;
 if exists(select 1 from public.contratos) then raise exception 'Acceso indebido al contrato completo'; end if;
 insert into storage.objects(bucket_id,name) values('comprobantes_depositos',current_setting('test.contract')||'/'||current_setting('test.movement')||'/test.pdf');
 v:=jsonb_build_object('id',current_setting('test.movement'),'contrato_id',current_setting('test.contract'),'monto',500000,'descuento',0,'fecha',(now() at time zone 'America/Bogota')::date,'metodo','Transferencia','comprobante_path',current_setting('test.contract')||'/'||current_setting('test.movement')||'/test.pdf');
 perform public.gestionar_deposito('ingreso',v);
 perform public.gestionar_deposito('ingreso',v);
 if (select valor_deposito from public.contratos_depositos_contabilidad() where id=current_setting('test.contract')::uuid)<>500000 then raise exception 'Ingreso repetido sumó de nuevo'; end if;
 if (select count(*) from public.movimientos_depositos where contrato_id=current_setting('test.contract')::uuid)<>1 then raise exception 'Historial ingreso incorrecto'; end if;
 begin perform public.gestionar_deposito('solicitar',v); raise exception 'Autorizó solicitud indebida'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('comprobantes_depositos','sin-contrato/test.pdf'); raise exception 'Autorizó ruta inválida'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('fotos-entregas',current_setting('test.contract')||'/test.pdf'); raise exception 'Autorizó otro módulo'; exception when insufficient_privilege then null; end;
 update public.contratos set cliente_nombre='NO' where id=current_setting('test.contract')::uuid; get diagnostics n=row_count;
 if n<>0 then raise exception 'Editó contrato'; end if;
end $test$;
reset role;
do $test$ begin
 if not exists(select 1 from public.bitacora_contratos where contrato_id=current_setting('test.contract')::uuid and accion='Depósito recibido') then raise exception 'Falta auditoría'; end if;
end $test$;
select set_config('test.request',gen_random_uuid()::text,true);
insert into public.solicitudes_depositos(id,contrato_id,monto,descuento,metodo,estado,solicitante_id,solicitante_nombre,banco,tipo_cuenta,cuenta,titular,motivo)
values(current_setting('test.request')::uuid,current_setting('test.contract')::uuid,400000,100000,'Transferencia','pendiente',current_setting('test.accountant')::uuid,'Prueba','Banco prueba','Ahorros','123','Prueba','Arreglo de prueba');
set local role authenticated;
do $test$ declare v jsonb; begin
 perform public.gestionar_deposito('proceso',jsonb_build_object('id',current_setting('test.request')));
 insert into storage.objects(bucket_id,name) values('comprobantes_depositos',current_setting('test.contract')||'/'||current_setting('test.request')||'/salida.pdf');
 v:=jsonb_build_object('id',current_setting('test.request'),'fecha',(now() at time zone 'America/Bogota')::date,'comprobante_path',current_setting('test.contract')||'/'||current_setting('test.request')||'/salida.pdf');
 perform public.gestionar_deposito('pagar',v);perform public.gestionar_deposito('pagar',v);
 if not exists(select 1 from public.solicitudes_depositos where id=current_setting('test.request')::uuid and estado='devuelto') then raise exception 'No ve devolución completada'; end if;
 if (select count(*) from public.devoluciones_depositos where contrato_id=current_setting('test.contract')::uuid and monto_devuelto=400000 and monto_descuento=100000)<>1 then raise exception 'Devolución incorrecta o duplicada'; end if;
 if (select count(*) from public.historial_solicitudes_depositos where solicitud_id=current_setting('test.request')::uuid)<>3 then raise exception 'No ve trazabilidad completa'; end if;
 if not exists(select 1 from storage.objects where name=current_setting('test.contract')||'/'||current_setting('test.request')||'/salida.pdf') then raise exception 'Comprobante devuelto invisible'; end if;
end $test$;
reset role;
select set_config('test.requests',(select count(*)::text from public.solicitudes_depositos),true);
select set_config('test.returns',(select count(*)::text from public.devoluciones_depositos),true);
select set_config('test.events',(select count(*)::text from public.historial_solicitudes_depositos),true);
set local role authenticated;
do $test$ begin
 if (select count(*) from public.solicitudes_depositos)<>current_setting('test.requests')::int then raise exception 'Historial solicitudes incompleto'; end if;
 if (select count(*) from public.devoluciones_depositos)<>current_setting('test.returns')::int then raise exception 'Historial devoluciones incompleto'; end if;
 if (select count(*) from public.historial_solicitudes_depositos)<>current_setting('test.events')::int then raise exception 'Trazabilidad incompleta'; end if;
end $test$;
reset role;
update public.profiles set activo=false where id=current_setting('test.accountant')::uuid;
set local role authenticated;
do $test$ begin
 if exists(select 1 from public.contratos_depositos_contabilidad()) or exists(select 1 from public.movimientos_depositos) or exists(select 1 from public.solicitudes_depositos) then raise exception 'Perfil inactivo accede'; end if;
 if private.comprobante_contabilidad(current_setting('test.contract')||'/test.pdf',false) then raise exception 'Perfil inactivo sube comprobante'; end if;
end $test$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $test$ begin
 begin perform public.contratos_depositos_contabilidad(); raise exception 'Anon accede RPC'; exception when insufficient_privilege then null; end;
end $test$;
reset role;
rollback;
