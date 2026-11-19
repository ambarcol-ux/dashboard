-- Plan Ahorro XV › the family enrolls itself from the link the WhatsApp AI sends (page /plan-ahorro-inscripcion), then signs its
-- contract right away. Same rules as the staff form (public.plan_ahorro_crear): event at least 6 months and at most 2 years away,
-- minimum cuota $150.000, valid e-mail. The phone comes from the signed link (the chat's WhatsApp). If that phone already has an
-- active plan not yet signed, that plan is returned (no duplicates); if it is already signed, the family is sent to the chat.
-- Only the server (service_role) calls it. Reversible: drop function public.plan_ahorro_inscribir_servidor(jsonb).

create or replace function public.plan_ahorro_inscribir_servidor(p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare s uuid; tel text:=right(regexp_replace(coalesce(p->>'telefono',''),'\D','','g'),10); ev date; cuota numeric:=nullif(p->>'cuota_mensual','')::numeric;
 hoy date:=(now() at time zone 'America/Bogota')::date; mail text:=nullif(lower(btrim(coalesce(p->>'email',''))),''); dia int:=coalesce(nullif(p->>'dia_pago','')::int,5);
 doc text:=regexp_replace(coalesce(p->>'titular_documento',''),'\D','','g'); ya public.planes_ahorro; v_id uuid; cita uuid;
begin
 begin s:=(p->>'sede_id')::uuid; ev:=nullif(p->>'fecha_evento','')::date; exception when others then raise exception 'Revisa la sede y la fecha del evento.'; end;
 if s is null or not exists(select 1 from public.sedes where id=s and activo) then raise exception 'Elige la sede.'; end if;
 if length(tel)<>10 then raise exception 'El enlace no tiene un celular válido.'; end if;
 if length(btrim(coalesce(p->>'titular_nombre','')))<3 then raise exception 'Escribe tu nombre completo.'; end if;
 if length(doc) not between 5 and 12 then raise exception 'Escribe tu número de cédula.'; end if;
 if length(btrim(coalesce(p->>'quinceanera_nombre','')))<3 then raise exception 'Escribe el nombre de la quinceañera.'; end if;
 if ev is null or ev<(hoy+interval '6 months')::date then raise exception 'El evento debe ser al menos 6 meses después de hoy. Si es antes, escríbenos por WhatsApp y te ayudamos con la separación normal del vestido.'; end if;
 if ev>hoy+730 then raise exception 'La fecha del evento no puede ser a más de 2 años.'; end if;
 if cuota is null or cuota<150000 then raise exception 'La cuota mínima es de $150.000 al mes.'; end if;
 if cuota>20000000 then raise exception 'Revisa el valor de la cuota.'; end if;
 if dia not between 1 and 28 then raise exception 'Elige un día de pago entre 1 y 28.'; end if;
 if mail is not null and mail !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then raise exception 'El correo no es válido.'; end if;
 select * into ya from public.planes_ahorro where right(regexp_replace(telefono,'\D','','g'),10)=tel and estado='activo' order by created_at desc limit 1;
 if ya.id is not null and ya.firmado_at is not null then raise exception 'Ya tienes un Plan Ahorro XV activo (n.º %) con contrato firmado. Escríbenos por WhatsApp si necesitas algo.',ya.numero; end if;
 if ya.id is not null then return ya.id; end if;
 select id into cita from public.primeras_citas where right(regexp_replace(coalesce(telefono,''),'\D','','g'),10)=tel and estado<>'cancelada' order by created_at desc limit 1;
 insert into public.planes_ahorro(sede_id,titular_nombre,titular_documento,telefono,email,quinceanera_nombre,fecha_evento,cuota_mensual,dia_pago,primera_cita_id,notas,creado_por)
 values(s,btrim(p->>'titular_nombre'),doc,tel,mail,btrim(p->>'quinceanera_nombre'),ev,cuota,dia,cita,'Inscrito por la familia desde el enlace de WhatsApp.',null)
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.plan_ahorro_inscribir_servidor(jsonb) from public, anon, authenticated;
grant execute on function public.plan_ahorro_inscribir_servidor(jsonb) to service_role;
