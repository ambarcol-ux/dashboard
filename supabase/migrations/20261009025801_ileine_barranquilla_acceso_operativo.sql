-- Reuse the existing account-scoped RLS rules for the Barranquilla operations advisor.
insert into private.accesos_operativos_sede(usuario_id,sede_id)
select p.id,s.id from public.profiles p join auth.users u on u.id=p.id cross join public.sedes s
where lower(u.email)='ileine@ambarcouture.com' and s.nombre='Barranquilla' and s.activo is true;
do $$ begin if not exists(select 1 from private.accesos_operativos_sede a join auth.users u on u.id=a.usuario_id join public.sedes s on s.id=a.sede_id where lower(u.email)='ileine@ambarcouture.com' and s.nombre='Barranquilla') then raise exception 'Revisa la cuenta y sede Barranquilla';end if;end $$;
update public.profiles p set rol='asesora',sede_id=a.sede_id from private.accesos_operativos_sede a join auth.users u on u.id=a.usuario_id where p.id=a.usuario_id and lower(u.email)='ileine@ambarcouture.com';
notify pgrst,'reload schema';
