-- Plan Ahorro XV: only families whose event is at least 6 months away can enroll (closer events go through the normal sale:
-- 50 % to book or 20 % cash discount). No minimum number of cuotas.
-- Reversión: re-run public.plan_ahorro_crear from 20270318120000_plan_ahorro_xv.sql (3 months).
create or replace function public.plan_ahorro_crear(p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare s uuid:=(p->>'sede_id')::uuid; tel text:=regexp_replace(coalesce(p->>'telefono',''),'\D','','g'); ev date:=nullif(p->>'fecha_evento','')::date;
 cuota numeric:=nullif(p->>'cuota_mensual','')::numeric; hoy date:=(now() at time zone 'America/Bogota')::date; mail text:=nullif(lower(btrim(coalesce(p->>'email',''))),''); v_id uuid; cita uuid;
begin
 if s is null or not (public.es_admin() or private.caja_operar(s)) then raise exception 'No puedes inscribir planes en esta sede.' using errcode='42501'; end if;
 if length(btrim(coalesce(p->>'titular_nombre','')))<3 then raise exception 'Escribe el nombre de quien ahorra.'; end if;
 if length(tel)<10 then raise exception 'Escribe el celular (10 dígitos).'; end if;
 if ev is null or ev<(hoy+interval '6 months')::date then raise exception 'El evento debe ser al menos 6 meses después de hoy. Si es antes, va por la venta normal (abono del 50 %% o pago de contado).'; end if;
 if ev>hoy+730 then raise exception 'La fecha del evento no puede ser a más de 2 años.'; end if;
 if cuota is null or cuota<150000 then raise exception 'La cuota mínima es de $150.000 al mes.'; end if;
 if mail is not null and mail !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then raise exception 'El correo no es válido.'; end if;
 select id into cita from public.primeras_citas where right(regexp_replace(coalesce(telefono,''),'\D','','g'),10)=right(tel,10) and estado<>'cancelada' order by created_at desc limit 1;
 insert into public.planes_ahorro(sede_id,titular_nombre,titular_documento,telefono,email,quinceanera_nombre,fecha_evento,cuota_mensual,dia_pago,primera_cita_id,notas,creado_por)
 values(s,btrim(p->>'titular_nombre'),nullif(btrim(coalesce(p->>'titular_documento','')),''),tel,mail,nullif(btrim(coalesce(p->>'quinceanera_nombre','')),''),ev,cuota,
  coalesce(nullif(p->>'dia_pago','')::int,5),cita,nullif(btrim(coalesce(p->>'notas','')),''),auth.uid()) returning id into v_id;
 return v_id;
end $$;
