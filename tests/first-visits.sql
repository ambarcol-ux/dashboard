-- Run after migration in one transaction and always ROLLBACK.
do $$
declare a uuid;b uuid;d date;sun date;id1 uuid:=gen_random_uuid();id2 uuid:=gen_random_uuid();v uuid:=gen_random_uuid();j jsonb;admin_id uuid;cid uuid;stamp timestamptz;failed boolean;
begin
 select id into a from public.sedes where activo is true order by id limit 1;
 select id into b from public.sedes where activo is true and id<>a order by id limit 1;
 select id into admin_id from public.profiles where activo is true and lower(rol)='admin' limit 1;
 d:=(now() at time zone 'America/Bogota')::date+14;
 while extract(isodow from d)=7 loop d:=d+1;end loop;
 sun:=d;while extract(isodow from sun)<>7 loop sun:=sun+1;end loop;
 j:=public.reservar_primera_cita(id1,d,'09:00','presencial',a,'QA Primera Uno','9900000001','',true,repeat('a',64));assert (j->>'reservada')::boolean,'First booking';
 j:=public.reservar_primera_cita(id1,d,'09:00','presencial',a,'QA Primera Uno','9900000001','',true,repeat('a',64));assert (j->>'reservada')::boolean,'Idempotent retry';
 assert (select count(*)=1 from public.primeras_citas where id=id1),'No duplicate';
 j:=public.reservar_primera_cita(id2,d,'09:00','presencial',a,'QA Primera Dos','9900000002','',true,repeat('a',64));assert (j->>'reservada')::boolean,'Second same site';
 j:=public.reservar_primera_cita(gen_random_uuid(),d,'09:00','presencial',a,'QA Tercera','9900000003','',true,repeat('a',64));assert not (j->>'reservada')::boolean,'Reject third';
 j:=public.reservar_primera_cita(gen_random_uuid(),d,'09:00','presencial',b,'QA Otra Sede','9900000004','',true,repeat('b',64));assert (j->>'reservada')::boolean,'Independent site';
 j:=public.reservar_primera_cita(v,d,'10:00','virtual',a,'QA Virtual','9900000005','',true,repeat('c',64));assert (j->>'reservada')::boolean,'Virtual first';
 j:=public.reservar_primera_cita(gen_random_uuid(),d,'10:00','virtual',b,'QA Virtual Dos','9900000006','',true,repeat('d',64));assert not (j->>'reservada')::boolean,'Global virtual cap';
 j:=public.reservar_primera_cita(gen_random_uuid(),sun,'10:00','virtual',b,'QA Domingo','9900000007','',true,repeat('e',64));assert not (j->>'reservada')::boolean,'No virtual Sunday';
 j:=public.reservar_primera_cita(gen_random_uuid(),sun,'09:00','presencial',a,'QA Domingo Uno','9900000008','',true,repeat('f',64));assert (j->>'reservada')::boolean,'Sunday first';
 j:=public.reservar_primera_cita(gen_random_uuid(),sun,'09:00','presencial',a,'QA Domingo Dos','9900000009','',true,repeat('1',64));assert not (j->>'reservada')::boolean,'Sunday second denied';
 j:=public.reservar_primera_cita(gen_random_uuid(),d,'19:00','presencial',a,'QA Late','9900000010','',true,repeat('2',64));assert not (j->>'reservada')::boolean,'19 not a start';
 j:=public.reservar_primera_cita(gen_random_uuid(),d,'18:00','presencial',a,'QA Last','9900000011','',true,repeat('3',64));assert (j->>'reservada')::boolean,'18 accepted';
 j:=public.reservar_primera_cita(gen_random_uuid(),d,'12:00','presencial',a,'QA Same Phone','9900000001','',true,repeat('4',64));assert not (j->>'reservada')::boolean,'Pending phone duplicate denied';
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 select updated_at into stamp from public.primeras_citas where id=id1;
 failed:=false;begin perform public.gestionar_primera_cita(id1,'cancelada','',stamp);exception when others then failed:=true;end;assert failed,'Cancellation reason required';
 perform public.gestionar_primera_cita(id1,'cancelada','Cambio solicitado por cliente',stamp);
 j:=public.reservar_primera_cita(gen_random_uuid(),d,'09:00','presencial',a,'QA Reuse','9900000012','',true,repeat('5',64));assert (j->>'reservada')::boolean,'Cancelled slot reusable';
 failed:=false;begin perform public.gestionar_primera_cita(id1,'confirmada','',stamp);exception when others then failed:=true;end;assert failed,'No stale update/reactivation';
 assert not has_table_privilege('anon','public.primeras_citas','SELECT'),'No visitor PII';
 assert not has_table_privilege('authenticated','public.primeras_citas','INSERT'),'No direct insert';
 assert not has_function_privilege('anon','public.reservar_primera_cita(uuid,date,time,text,uuid,text,text,text,boolean,text)','EXECUTE'),'Booking API only';
 assert has_function_privilege('service_role','public.reservar_primera_cita(uuid,date,time,text,uuid,text,text,text,boolean,text)','EXECUTE'),'Server booking allowed';
 -- Past attended visit can create a draft; real contract validation remains active.
 update public.primeras_citas set fecha=(now() at time zone 'America/Bogota')::date-1,estado='asistio' where id=id2;
 insert into public.contratos(numero_contrato,numero_factura,estado,cliente_nombre,cliente_documento,cliente_email,fecha_evento,valor_total,sede,sede_id,primera_cita_id) values('QA-PRIMERA-'||id2::text,'QA-PC-001','borrador','QA Primera Dos','9900000002','qa@example.invalid',d+30,100000,'QA',a,id2) returning id into cid;
 assert (select count(*)=1 from public.primeras_citas_historial where cita_id=id2 and accion='Contrato creado'),'Contract audit';
 j:=public.listar_primeras_citas((now() at time zone 'America/Bogota')::date-1,sun);
 assert exists(select 1 from jsonb_array_elements(j) e where e->>'contrato_id'=cid::text and e->>'contrato_estado'='borrador'),'Draft linkage';
 failed:=false;begin perform public.gestionar_primera_cita(id2,'no_cerro','No debe permitir con contrato',(select updated_at from public.primeras_citas where id=id2));exception when others then failed:=true;end;assert failed,'Linked active contract guard';
 failed:=false;begin update public.contratos set primera_cita_id=null where id=cid;exception when others then failed:=true;end;assert failed,'Immutable source';
 -- Test an advisor's site isolation and shared virtual queue.
 perform set_config('request.jwt.claim.sub',(select id::text from public.profiles where activo is true and lower(rol)='asesora' and sede_id is not null limit 1),true);
 assert not private.acceso_primera_cita(gen_random_uuid(),'presencial'),'Other site denied';
 assert private.acceso_primera_cita(a,'virtual'),'Shared virtual queue';
 perform set_config('request.jwt.claim.sub',(select id::text from public.profiles where activo is true and lower(rol)='contabilidad' limit 1),true);
 assert not private.acceso_primera_cita(a,'virtual'),'Accounting denied';
 failed:=false;begin perform public.listar_primeras_citas(d,sun);exception when others then failed:=true;end;assert failed,'Accounting list denied';
 raise notice 'PASS: site capacity, global virtual capacity, Sunday, hours, retry, duplicates, permissions, cancellation, attendance and contract linkage';
end;$$;

set local role service_role;
select public.disponibilidad_primera_cita(((now() at time zone 'America/Bogota')::date+14),'presencial',(select id from public.sedes where activo is true limit 1));
reset role;
