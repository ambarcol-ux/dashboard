begin;
do $test$ declare u record; own_id uuid; other_id uuid; n integer; msg text; begin
for u in select p.id,p.sede_id from public.profiles p join private.accesos_operativos_sede a on a.usuario_id=p.id loop
select id into own_id from public.contratos where sede_id=u.sede_id and lower(estado) not in ('borrador','pendiente_admin') limit 1;
select id into other_id from public.contratos where sede_id<>u.sede_id limit 1;
perform set_config('request.jwt.claim.sub',u.id::text,true);execute 'set local role authenticated';
if not private.operador_sede_contrato(own_id) or private.operador_sede_contrato(other_id) then raise exception 'FAIL scoped capability';end if;
update public.contratos set cliente_nombre=cliente_nombre where id=own_id;get diagnostics n=row_count;if n<>1 then raise exception 'FAIL own edit';end if;
update public.contratos set cliente_nombre=cliente_nombre where id=other_id;get diagnostics n=row_count;if n<>0 then raise exception 'FAIL other edit';end if;
begin perform public.editar_contrato_completo_admin(own_id,'{}','[]','[]');raise exception 'FAIL missing dress accepted';exception when others then get stacked diagnostics msg=message_text;if msg not like '%al menos un vestido%' then raise exception 'FAIL full edit permission: %',msg;end if;end;
begin perform public.operacion_contrato(other_id,'eliminar');raise exception 'FAIL other deletion';exception when others then get stacked diagnostics msg=message_text;if msg not like '%no disponible para tu sede%' then raise exception 'FAIL delete scope: %',msg;end if;end;
execute 'reset role';
end loop;end $test$;
rollback;