begin;
do $$
declare cid uuid:=gen_random_uuid(); legacy uuid:=gen_random_uuid(); parts text[]; r record; i integer;
begin
 insert into public.contratos(numero_factura,cliente_nombre,cliente_documento,cliente_email,fecha_evento,valor_total,id,numero_contrato,tipo_evento,fecha_pre_xv,prexv_fotografo) values('FAC-TEST-INTEGRACION','Prueba','TEST','test@example.com',current_date,0,legacy,'TEST-PREXV-LEGACY','Evento',current_date,'Proveedor previo');
 update public.contratos set cliente_nombre='Firma compatible' where id=legacy;
 execute 'select * from public.contratos where id=$1' into r using legacy;
 if r.prexv_componentes is not null or r.prexv_fotografo<>'Proveedor previo' or r.prexv_fotografo_agendado then raise exception 'Legacy changed'; end if;
 for i in 0..7 loop
  parts:=array[]::text[];
  if i&1=1 then parts:=parts||'fotos'::text; end if;
  if i&2=2 then parts:=parts||'maquillaje'::text; end if;
  if i&4=4 then parts:=parts||'locacion'::text; end if;
  insert into public.contratos(numero_factura,cliente_nombre,cliente_documento,cliente_email,fecha_evento,valor_total,id,numero_contrato,prexv_componentes,fecha_pre_xv,prexv_fotografo,prexv_maquilladora,prexv_locacion)
   values('FAC-TEST-INTEGRACION','Prueba','TEST','test@example.com',current_date,0,cid,'TEST-PREXV-'||i,parts,current_date,'Fotos prueba','Makeup prueba','Locación prueba');
  update public.contratos set prexv_fotografo_agendado=true,prexv_maquilladora_agendada=true,prexv_locacion_confirmada=true where id=cid;
  execute 'select * from public.contratos where id=$1' into r using cid;
  if r.prexv_fotografo_agendado<>(i&1=1) or r.prexv_maquilladora_agendada<>(i&2=2) or r.prexv_locacion_confirmada<>(i&4=4) then raise exception 'Wrong confirmations for %',parts; end if;
  update public.contratos set prexv_fotografo='Otro fotógrafo' where id=cid;
  execute 'select * from public.contratos where id=$1' into r using cid;
  if r.prexv_fotografo_agendado or r.prexv_maquilladora_agendada<>(i&2=2) or r.prexv_locacion_confirmada<>(i&4=4) then raise exception 'Provider invalidation affected another component'; end if;
  update public.contratos set fecha_pre_xv=current_date+1 where id=cid;
  execute 'select * from public.contratos where id=$1' into r using cid;
  if r.prexv_fotografo_agendado or r.prexv_maquilladora_agendada or r.prexv_locacion_confirmada then raise exception 'Reprogramming kept old reservations'; end if;
  delete from public.contratos where id=cid;
 end loop;
 insert into public.contratos(numero_factura,cliente_nombre,cliente_documento,cliente_email,fecha_evento,valor_total,id,numero_contrato,prexv_componentes,fecha_pre_xv) values('FAC-TEST-INTEGRACION','Prueba','TEST','test@example.com',current_date,0,cid,'TEST-PREXV-EMPTY',array['maquillaje'],current_date);
 begin
  update public.contratos set prexv_maquilladora_agendada=true where id=cid;
  raise exception 'Accepted missing makeup provider';
 exception when others then if sqlerrm not like 'Indica el nombre%' then raise; end if; end;
 begin
  update public.contratos set prexv_componentes=array['desconocido'] where id=cid;
  raise exception 'Accepted unknown component';
 exception when check_violation then null; end;
 begin
  update public.contratos set fecha_pre_xv=null where id=cid;
  raise exception 'Accepted missing date';
 exception when others then if sqlerrm not like 'Indica la fecha%' then raise; end if; end;
end $$;
select 'PASS: eight combinations, legacy preservation, separate confirmations, missing providers, rescheduling, unknown components' as result;
rollback;
