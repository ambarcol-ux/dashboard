-- Reuse the existing account-scoped RLS rules for the second operations advisor.
insert into private.accesos_operativos_sede(usuario_id,sede_id)
select p.id,s.id from public.profiles p join auth.users u on u.id=p.id cross join public.sedes s
where lower(u.email)='genesis@ambarcouture.com' and s.nombre='Villavicencio' and s.activo is true;
do $$ begin if not exists(select 1 from private.accesos_operativos_sede a join auth.users u on u.id=a.usuario_id join public.sedes s on s.id=a.sede_id where lower(u.email)='genesis@ambarcouture.com' and s.nombre='Villavicencio') then raise exception 'Revisa la cuenta y sede Villavicencio';end if;end $$;
update public.profiles p set rol='asesora',sede_id=a.sede_id from private.accesos_operativos_sede a join auth.users u on u.id=a.usuario_id where p.id=a.usuario_id and lower(u.email)='genesis@ambarcouture.com';
alter policy operaciones_sede_limitada on public.referidores using ((select private.sede_operativa_limitada()) is null or sede_origen=(select nombre from public.sedes where id=(select private.sede_operativa_limitada()))) with check ((select private.sede_operativa_limitada()) is null or sede_origen=(select nombre from public.sedes where id=(select private.sede_operativa_limitada())));
do $$ declare f record;begin for f in select pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='validar_y_quemar_codigo' loop execute replace(f.definition,'Contrato no disponible para Bogotá.','Contrato no disponible para tu sede.');end loop;end $$;
notify pgrst,'reload schema';
