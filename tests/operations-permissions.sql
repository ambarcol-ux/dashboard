begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where lower(rol)='admin' and coalesce(activo,true) limit 1),true);
do $$ declare c uuid:=gen_random_uuid();v uuid:=gen_random_uuid();sid uuid; other_sid uuid; a uuid:=gen_random_uuid();x uuid:=gen_random_uuid();z uuid:=gen_random_uuid();begin
 select id into sid from public.sedes order by id limit 1;select id into other_sid from public.sedes where id<>sid limit 1;
 insert into public.vestidos(id,codigo,nombre,sede_id) values(v,'QA-'||v,'QA permisos',sid);
 insert into public.contratos(id,numero_contrato,numero_factura,cliente_nombre,cliente_documento,cliente_email,fecha_evento,valor_total,estado,valor_garantia_acordada,banco_deposito,tipo_cuenta_deposito,numero_cuenta_deposito,titular_cuenta_deposito,sede_id)
 values(c,'QA-'||c,'QA-FACTURA','QA','QA','qa@example.invalid',current_date+200,0,'borrador',500000,'Banco','Ahorros','001','QA',sid);
 insert into auth.users(id,email) values(a,a||'@example.invalid'),(x,x||'@example.invalid'),(z,z||'@example.invalid');
 insert into public.profiles(id,email,nombre,rol,sede_id,activo) values(a,a||'@example.invalid','QA','asesora',sid,true),(x,x||'@example.invalid','QA','asesora',other_sid,true),(z,z||'@example.invalid','QA','asesora',sid,false) on conflict(id) do update set rol=excluded.rol,sede_id=excluded.sede_id,activo=excluded.activo;
 perform set_config('qa.p',jsonb_build_object('c',c,'v',v,'a',a,'x',x,'z',z,'admin',auth.uid())::text,true);
end $$;
set local role authenticated;
do $$ declare q jsonb:=current_setting('qa.p')::jsonb;c uuid:=(q->>'c')::uuid;v uuid:=(q->>'v')::uuid;op uuid:=gen_random_uuid();blocked boolean; actor text;begin
 perform public.cambiar_prenda_operaciones(c,'asignar',v,null,op);perform public.cambiar_prenda_operaciones(c,'asignar',v,null,op);
 if (select count(*) from public.contrato_items_vestidos where contrato_id=c)<>1 then raise exception 'FAIL asignación repetida';end if;
 foreach actor in array array['x','z'] loop
  perform set_config('request.jwt.claim.sub',q->>actor,true);blocked:=false;
  begin perform public.cambiar_prenda_operaciones(c,'quitar',v,'Retiro prueba QA',gen_random_uuid());exception when others then if sqlerrm in ('Contrato no disponible para tu sede.','No autorizado.') then blocked:=true;else raise;end if;end;
  if not blocked then raise exception 'FAIL permiso sede/activo';end if;
 end loop;
 perform set_config('request.jwt.claim.sub',q->>'a',true);blocked:=false;
 begin perform public.cambiar_prenda_operaciones(c,'revertir',null,'Reapertura prueba QA',gen_random_uuid());exception when others then if sqlerrm='Solo administración puede revertir.' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'FAIL reversión asesora';end if;
 perform set_config('request.jwt.claim.sub',q->>'admin',true);
end $$;
reset role;
create function public.qa_fail_operation_audit() returns trigger language plpgsql as $$begin if new.accion='Retiro de prenda' then raise exception 'QA audit failure';end if;return new;end$$;
create trigger qa_fail_operation_audit before insert on public.bitacora_contratos for each row execute function public.qa_fail_operation_audit();
set local role authenticated;
do $$ declare q jsonb:=current_setting('qa.p')::jsonb;c uuid:=(q->>'c')::uuid;v uuid:=(q->>'v')::uuid;blocked boolean:=false;begin
 begin perform public.cambiar_prenda_operaciones(c,'quitar',v,'Retiro prueba QA',gen_random_uuid());exception when others then if sqlerrm='QA audit failure' then blocked:=true;else raise;end if;end;
 if not blocked or not exists(select 1 from public.contrato_items_vestidos where contrato_id=c and vestido_id=v) or (select vestido_id from public.contratos where id=c)<>v then raise exception 'FAIL mutación parcial tras fallo de bitácora';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ declare blocked boolean:=false;begin
 begin perform public.cambiar_prenda_operaciones((current_setting('qa.p')::jsonb->>'c')::uuid,'quitar',(current_setting('qa.p')::jsonb->>'v')::uuid,'QA anónimo',gen_random_uuid());exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'FAIL anónimo';end if;
end $$;
select 'PASS: asignación idempotente; sede ajena/usuario inactivo/anónimo bloqueados; reversión solo admin; fallo de bitácora revierte toda la operación' result;
rollback;
