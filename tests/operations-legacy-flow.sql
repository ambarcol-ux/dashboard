-- Production functions + new operations; synthetic legacy records, transaction rollback.
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where lower(rol)='admin' and coalesce(activo,true) limit 1),true);
do $$ declare c uuid:=gen_random_uuid();v uuid:=gen_random_uuid();sid uuid;e uuid;token text;items jsonb;result jsonb;blocked boolean:=false;req uuid;begin
 select id into sid from public.sedes order by id limit 1;
 insert into public.vestidos(id,codigo,nombre,sede_id) values(v,'QA-'||v,'QA legado',sid);
 insert into public.contratos(id,numero_contrato,numero_factura,cliente_nombre,cliente_documento,cliente_email,fecha_evento,valor_total,estado,valor_deposito,valor_garantia_acordada,banco_deposito,tipo_cuenta_deposito,numero_cuenta_deposito,titular_cuenta_deposito,sede_id,vestido_id)
 values(c,'QA-'||c,'QA-FACTURA','QA','QA','qa@example.invalid',current_date+30,0,'firmado',500000,500000,'Banco','Ahorros','001','QA',sid,v);
 -- Legacy direct dress is deliberately absent from items.
 insert into public.entregas_bitacora(contrato_id,tipo_entrega,usuario_id,finalizado) values(c,'PREXV',auth.uid(),false) returning id into e;
 token:=public.crear_enlace_operaciones(c,'entrega',e);
 perform public.firmar_enlace_operaciones(e,token,'entrega','data:image/png;base64,aA==','QA','QA');
 if not exists(select 1 from public.vestidos_fuera_tienda where contrato_id=c and vestido_id=v and regreso_at is null) then raise exception 'FAIL salida prenda heredada';end if;
 items:=jsonb_build_array(jsonb_build_object('vestido_id',v,'necesita_arreglo',false,'descripcion','','cobro',0,'dias',2));
 perform public.recibir_vestidos_operaciones(c,gen_random_uuid(),items);
 begin perform public.finalizar_contrato_con_deposito(c,0,'',500000,null);exception when others then if sqlerrm like 'Falta la entrega del evento%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'FAIL PREXV finaliza antes del evento';end if;
 if public.liberar_vestidos_operaciones(c)<>'firmado' then raise exception 'FAIL liberación PREXV';end if;
 if exists(select 1 from public.solicitudes_depositos where contrato_id=c) then raise exception 'FAIL devolución prematura depósito PREXV';end if;
 insert into public.entregas_bitacora(contrato_id,tipo_entrega,usuario_id,finalizado) values(c,'EVENTO',auth.uid(),false) returning id into e;
 token:=public.crear_enlace_operaciones(c,'entrega',e);
 perform public.firmar_enlace_operaciones(e,token,'entrega','data:image/png;base64,aA==','QA','QA');
 items:=jsonb_build_array(jsonb_build_object('vestido_id',v,'necesita_arreglo',true,'descripcion','Arreglo legado','cobro',300000,'dias',5));
 perform public.recibir_vestidos_operaciones(c,gen_random_uuid(),items);
 -- An existing request must be preserved, not duplicated or deducted twice.
 insert into public.solicitudes_depositos(id,contrato_id,monto,descuento,descuento_arreglos,motivo,metodo,estado,solicitante_id,solicitante_nombre,banco,tipo_cuenta,cuenta,titular)
 values(gen_random_uuid(),c,200000,300000,300000,'Arreglo legado','Transferencia','pendiente',auth.uid(),'QA','Banco','Ahorros','001','QA') returning id into req;
 result:=public.finalizar_contrato_con_deposito(c,0,'',500000,req);
 if (result->>'monto_devolver')::numeric<>200000 or (select count(*) from public.solicitudes_depositos where contrato_id=c)<>1 then raise exception 'FAIL solicitud existente';end if;
 if (select estado from public.vestidos where id=v)<>'Disponible' then raise exception 'FAIL liberar prenda heredada';end if;
 if (select count(*) from public.vestidos_fuera_tienda where contrato_id=c)<>2 or exists(select 1 from public.vestidos_fuera_tienda where contrato_id=c and regreso_at is null) then raise exception 'FAIL historial dos salidas';end if;
end $$;
select 'PASS: prenda heredada sin items; PREXV vuelve a firmado sin reembolso; posterior evento y devolución; solicitud existente preservada sin doble descuento' result;
rollback;
