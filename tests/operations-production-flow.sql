-- Run after production-setup.sql. All fixtures and schema changes roll back.
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where lower(rol)='admin' and coalesce(activo,true) limit 1),true);
do $$ declare c uuid:=gen_random_uuid();v uuid:=gen_random_uuid();sid uuid;begin
 select id into sid from public.sedes order by id limit 1;
 insert into public.vestidos(id,codigo,nombre,sede_id) values(v,'QA-'||v,'QA integración',sid);
 insert into public.contratos(id,numero_contrato,numero_factura,cliente_nombre,cliente_documento,cliente_email,fecha_evento,valor_total,estado,valor_garantia_acordada,banco_deposito,tipo_cuenta_deposito,numero_cuenta_deposito,titular_cuenta_deposito,sede_id)
 values(c,'QA-'||c,'QA-FACTURA','QA','QA','qa@example.invalid',current_date+10,0,'borrador',500000,'Banco','Ahorros','001','QA',sid);
 insert into public.contrato_items_vestidos(contrato_id,vestido_id,tipo,tipo_uso) values(c,v,'XV','XV');
 insert into storage.objects(bucket_id,name) values('comprobantes_depositos',c||'/qa/comprobante.pdf');
 perform set_config('qa.c',c::text,true);perform set_config('qa.v',v::text,true);perform set_config('qa.u',auth.uid()::text,true);
end $$;
set local role authenticated;
do $$ declare c uuid:=current_setting('qa.c')::uuid;eid uuid;op uuid:=gen_random_uuid();blocked boolean:=false;payload jsonb;begin
 payload:=jsonb_build_object('id',op,'contrato_id',c,'monto',500000,'descuento',0,'fecha',current_date,'metodo','Transferencia','comprobante_path',c||'/qa/comprobante.pdf');
 perform public.gestionar_deposito('ingreso',payload);perform public.gestionar_deposito('ingreso',payload);
 begin perform public.gestionar_deposito('ingreso',jsonb_set(payload,'{id}',to_jsonb(gen_random_uuid())));exception when others then if sqlerrm like 'Este contrato ya tiene un depósito%' then blocked:=true;else raise;end if;end;
 if not blocked or (select valor_deposito from public.contratos where id=c)<>500000 then raise exception 'FAIL depósito repetido';end if;
 insert into public.entregas_bitacora(contrato_id,tipo_entrega,usuario_id,finalizado) values(c,'EVENTO',auth.uid(),false) returning id into eid;
 perform set_config('qa.e',eid::text,true);perform set_config('qa.t',public.crear_enlace_operaciones(c,'entrega',eid),true);
 blocked:=false;
 begin perform public.recibir_vestidos_operaciones(c,gen_random_uuid(),jsonb_build_array(jsonb_build_object('vestido_id',current_setting('qa.v'),'necesita_arreglo',false,'cobro',0,'dias',2)));exception when others then if sqlerrm like 'Primero confirma la entrega%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'FAIL recepción antes de firma';end if;
end $$;
reset role;
do $$ begin if exists(select 1 from public.vestidos_fuera_tienda where contrato_id=current_setting('qa.c')::uuid) then raise exception 'FAIL salida antes de firma';end if;end $$;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select public.firmar_enlace_operaciones(current_setting('qa.e')::uuid,current_setting('qa.t'),'entrega','data:image/png;base64,aGVsbG8=','QA recibe','QA001');
reset role;
do $$ begin if (select count(*) from public.vestidos_fuera_tienda where contrato_id=current_setting('qa.c')::uuid and regreso_at is null)<>1 then raise exception 'FAIL salida firmada';end if;end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.u'),true);
set local role authenticated;
do $$ declare c uuid:=current_setting('qa.c')::uuid;op uuid:=gen_random_uuid();items jsonb;blocked boolean:=false;result jsonb;req uuid;begin
 items:=jsonb_build_array(jsonb_build_object('vestido_id',current_setting('qa.v'),'necesita_arreglo',true,'descripcion','Reparar cierre','cobro',300000,'dias',5));
 perform public.recibir_vestidos_operaciones(c,op,items);perform public.recibir_vestidos_operaciones(c,op,items);
 if (select count(*) from public.mantenimiento_bitacora where contrato_id=c)<>1 then raise exception 'FAIL revisión duplicada';end if;
 begin perform public.finalizar_contrato_con_deposito(c,0,'',500000,null);exception when others then if sqlerrm like 'Debes descontar los arreglos%' then blocked:=true;else raise;end if;end;
 if not blocked or (select estado from public.contratos where id=c)<>'mantenimiento' then raise exception 'FAIL cierre ignora arreglos';end if;
 result:=public.finalizar_contrato_con_deposito(c,300000,'Reparar cierre',500000,null);
 perform public.finalizar_contrato_con_deposito(c,300000,'Reparar cierre',500000,null);
 if not (result->>'finalizado')::boolean then raise exception 'FAIL cierre';end if;
 select id into req from public.solicitudes_depositos where contrato_id=c;
 if (select count(*) from public.solicitudes_depositos where contrato_id=c)<>1 or not exists(select 1 from public.solicitudes_depositos where id=req and monto=200000 and descuento=300000 and descuento_arreglos=300000) then raise exception 'FAIL devolución 500000-300000';end if;
 if (select estado from public.vestidos where id=current_setting('qa.v')::uuid)<>'Disponible' then raise exception 'FAIL vestido no liberado';end if;
 if exists(select 1 from public.mantenimiento_bitacora where contrato_id=c and not completado) then raise exception 'FAIL mantenimiento abierto';end if;
 perform public.gestionar_deposito('proceso',jsonb_build_object('id',req));
 perform public.gestionar_deposito('pagar',jsonb_build_object('id',req,'fecha',current_date,'comprobante_path',c||'/qa/comprobante.pdf'));
 if not exists(select 1 from public.devoluciones_depositos where contrato_id=c and monto_devuelto=200000 and monto_descuento=300000) then raise exception 'FAIL pago neto';end if;
 blocked:=false;begin perform public.cambiar_prenda_operaciones(c,'revertir',null,'Reapertura inválida tras pago',gen_random_uuid());exception when others then if sqlerrm like 'Hay devoluciones o descuentos%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'FAIL reapertura con devolución pagada';end if;
end $$;
reset role;
do $$ begin if exists(select 1 from public.vestidos_fuera_tienda where contrato_id=current_setting('qa.c')::uuid and regreso_at is null) then raise exception 'FAIL salida sin cierre';end if;end $$;
select 'PASS: entrega pendiente no cuenta como entrega; firma registra salida; depósito único; revisión idempotente; cierre obligatorio con descuento; devolución neta 200000; bloqueo reapertura' result;
rollback;
