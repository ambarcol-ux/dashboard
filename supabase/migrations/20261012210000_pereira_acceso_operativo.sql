-- Reuse the existing account-scoped RLS rules for the three Pereira operations advisors.
insert into private.accesos_operativos_sede(usuario_id,sede_id)
select p.id,s.id from public.profiles p join auth.users u on u.id=p.id cross join public.sedes s
where lower(u.email) in ('liderpereira@ambarcouture.com','asesorapereira@ambarcouture.com','ambarcouturepereira@gmail.com') and s.nombre='Pereira' and s.activo is true
on conflict (usuario_id) do update set sede_id=excluded.sede_id;
do $$ begin if (select count(*) from private.accesos_operativos_sede a join auth.users u on u.id=a.usuario_id join public.sedes s on s.id=a.sede_id where s.nombre='Pereira' and lower(u.email) in ('liderpereira@ambarcouture.com','asesorapereira@ambarcouture.com','ambarcouturepereira@gmail.com'))<>3 then raise exception 'Revisa las tres cuentas y la sede Pereira';end if;end $$;
update public.profiles p set rol='asesora',sede_id=a.sede_id from private.accesos_operativos_sede a join auth.users u on u.id=a.usuario_id where p.id=a.usuario_id and lower(u.email) in ('liderpereira@ambarcouture.com','asesorapereira@ambarcouture.com','ambarcouturepereira@gmail.com');
notify pgrst,'reload schema';
