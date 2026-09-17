begin;
do $$
declare cid uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); x uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); sid uuid; other_sid uuid;
begin
 select id into sid from public.sedes order by id limit 1;
 select id into other_sid from public.sedes where id<>sid order by id limit 1;
 insert into auth.users(id,email) values(a,'prexv-perm-a@example.com'),(x,'prexv-perm-x@example.com'),(b,'prexv-perm-b@example.com');
 insert into public.profiles(id,email,nombre,rol,sede_id,activo) values(a,'prexv-perm-a@example.com','Prueba','asesora',sid,true),(x,'prexv-perm-x@example.com','Prueba','asesora',other_sid,true),(b,'prexv-perm-b@example.com','Prueba','contabilidad',sid,true) on conflict(id) do update set rol=excluded.rol,sede_id=excluded.sede_id;
 insert into public.contratos(numero_factura,id,numero_contrato,cliente_nombre,cliente_documento,cliente_email,fecha_evento,valor_total,sede_id,prexv_componentes,fecha_pre_xv,prexv_fotografo) values('FAC-TEST-INTEGRACION',cid,'TEST-PREXV-PERM','Prueba','TEST','test@example.com',current_date,0,sid,array['fotos'],current_date,'Prueba');
 perform set_config('test.prexv',jsonb_build_object('c',cid,'a',a,'x',x,'b',b)::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare cfg jsonb:=current_setting('test.prexv')::jsonb; cid uuid:=(cfg->>'c')::uuid;
begin
 update public.contratos set prexv_fotografo_agendado=true where id=cid;
 if not found then raise exception 'Same-site advisor cannot confirm'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',cfg->>'x','role','authenticated')::text,true);
 begin
  update public.contratos set prexv_fotografo='Other site' where id=cid;
  if found then raise exception 'Other site edited contract'; end if;
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',cfg->>'b','role','authenticated')::text,true);
 update public.contratos set prexv_fotografo='Accounting' where id=cid;
 if found then raise exception 'Accounting edited contract'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$
declare cfg jsonb:=current_setting('test.prexv')::jsonb; cid uuid:=(cfg->>'c')::uuid;
begin
 begin update public.contratos set prexv_fotografo='Anonymous' where id=cid; raise exception 'Anon edited provider'; exception when insufficient_privilege then null; end;
 begin update public.contratos set fecha_pre_xv=current_date+1 where id=cid; raise exception 'Anon reprogrammed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: same-site advisor, site isolation, accounting read-only, anonymous PRE-XV protection' as result;
rollback;
