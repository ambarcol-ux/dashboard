begin;
select set_config('test.admin',(select id::text from public.profiles where lower(rol)='admin' and coalesce(activo,true) limit 1),true);
select set_config('test.asesora',(select id::text from public.profiles where lower(rol)='asesora' and coalesce(activo,true) limit 1),true);
select set_config('test.contabilidad',(select id::text from public.profiles where lower(rol)='contabilidad' and coalesce(activo,true) limit 1),true);
select set_config('test.c',gen_random_uuid()::text,true);
select set_config('test.s',gen_random_uuid()::text,true);
insert into public.contratos(id,numero_contrato,numero_factura,cliente_nombre,cliente_documento,cliente_email,fecha_evento,valor_total,estado,valor_deposito,sede_id,es_alquiler_estrene)
values(current_setting('test.c')::uuid,'PRUEBA-DOC-ROLLBACK','PRUEBA-DOC','Prueba','PRUEBA','test@example.invalid',current_date+30,0,'firmado',500000,(select sede_id from public.profiles where id=current_setting('test.asesora')::uuid),false);
insert into public.solicitudes_depositos(id,contrato_id,monto,descuento,metodo,estado,solicitante_id,solicitante_nombre,responsable_id,responsable_nombre)
values(current_setting('test.s')::uuid,current_setting('test.c')::uuid,500000,0,'Transferencia','en_proceso',current_setting('test.admin')::uuid,'Prueba',current_setting('test.admin')::uuid,'Anterior');
select set_config('request.jwt.claim.sub',current_setting('test.contabilidad'),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $test$ begin
 begin perform public.retomar_devolucion(current_setting('test.s')::uuid,current_setting('test.admin')::uuid,'');raise exception 'Aceptó motivo vacío';exception when others then if sqlerrm='Aceptó motivo vacío' then raise;end if;end;
 begin perform public.retomar_devolucion(current_setting('test.s')::uuid,gen_random_uuid(),'Cambio');raise exception 'No verificó responsable esperado';exception when others then if sqlerrm='No verificó responsable esperado' then raise;end if;end;
 perform public.retomar_devolucion(current_setting('test.s')::uuid,current_setting('test.admin')::uuid,'Continuar gestión con Contabilidad');
 if not exists(select 1 from public.solicitudes_depositos where id=current_setting('test.s')::uuid and responsable_id=auth.uid() and estado='en_proceso') then raise exception 'No reasignó';end if;
 if not exists(select 1 from public.historial_solicitudes_depositos where solicitud_id=current_setting('test.s')::uuid and detalle like 'Cambio de responsable:%') then raise exception 'No auditó reasignación';end if;
 begin perform public.desistir_contrato(current_setting('test.c')::uuid,'No autorizado');raise exception 'Contabilidad puede desistir';exception when insufficient_privilege then null;end;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.asesora'),true);
set local role authenticated;
do $test$ begin
 begin perform public.retomar_devolucion(current_setting('test.s')::uuid,current_setting('test.contabilidad')::uuid,'No autorizado');raise exception 'Asesora puede retomar pago';exception when insufficient_privilege then null;end;
 perform public.desistir_contrato(current_setting('test.c')::uuid,'Cliente desiste');
 if not exists(select 1 from public.contratos where id=current_setting('test.c')::uuid and estado='cancelado' and valor_deposito=500000) then raise exception 'Desistimiento alteró dinero o falló';end if;
end $test$;
reset role;
update public.contratos set estado='firmado' where id=current_setting('test.c')::uuid;
select set_config('request.jwt.claim.sub',current_setting('test.admin'),true);
set local role authenticated;
do $test$ begin
 begin insert into public.entregas_bitacora(contrato_id,usuario_id,tipo_entrega) values(current_setting('test.c')::uuid,auth.uid(),'EVENTO');raise exception 'Entrega sin comprobante aceptada';exception when others then if sqlerrm='Entrega sin comprobante aceptada' then raise;end if;end;
 insert into storage.objects(bucket_id,name) values('comprobantes_depositos',current_setting('test.c')||'/entrega/test.pdf');
 insert into public.entregas_bitacora(contrato_id,usuario_id,tipo_entrega,comprobante_deposito_path,metodo_deposito) values(current_setting('test.c')::uuid,auth.uid(),'EVENTO',current_setting('test.c')||'/entrega/test.pdf','Transferencia');
 if (select valor_deposito from public.contratos where id=current_setting('test.c')::uuid)<>500000 then raise exception 'El comprobante sumó dinero';end if;
 if not exists(select 1 from public.soportes_depositos_anteriores where contrato_id=current_setting('test.c')::uuid and monto=500000) then raise exception 'No soportó depósito previo';end if;
 if not exists(select 1 from public.comprobantes_entrega_depositos() where contrato_id=current_setting('test.c')::uuid) then raise exception 'Falta historial comprobante';end if;
 begin perform public.desistir_contrato(current_setting('test.c')::uuid,'No permitido');raise exception 'Desistió después de entrega';exception when others then if sqlerrm='Desistió después de entrega' then raise;end if;end;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.contabilidad'),true);
set local role authenticated;
do $test$ begin
 if not exists(select 1 from public.comprobantes_entrega_depositos() where contrato_id=current_setting('test.c')::uuid) then raise exception 'Contabilidad no ve comprobante';end if;
 if not exists(select 1 from storage.objects where name=current_setting('test.c')||'/entrega/test.pdf') then raise exception 'Contabilidad no abre comprobante';end if;
end $test$;
reset role;
update public.solicitudes_depositos set estado='devuelto' where id=current_setting('test.s')::uuid;
set local role authenticated;
do $test$ begin
 begin perform public.retomar_devolucion(current_setting('test.s')::uuid,current_setting('test.contabilidad')::uuid,'No permitido');raise exception 'Retomó pago devuelto';exception when others then if sqlerrm='Retomó pago devuelto' then raise;end if;end;
end $test$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $test$ begin
 begin perform public.comprobantes_entrega_depositos();raise exception 'Anon lee recibos';exception when insufficient_privilege then null;end;
 begin perform public.retomar_devolucion(gen_random_uuid(),null,'No');raise exception 'Anon reasigna';exception when insufficient_privilege then null;end;
 begin perform public.desistir_contrato(gen_random_uuid(),'No');raise exception 'Anon desiste';exception when insufficient_privilege then null;end;
end $test$;
reset role;
rollback;
