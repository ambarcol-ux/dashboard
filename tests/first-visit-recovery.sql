do $$
declare s uuid; v uuid:=gen_random_uuid(); d date:=(now() at time zone 'America/Bogota')::date+14; r jsonb; i integer; ip text:=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'); mail text:=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex');
begin
 select id into s from public.sedes where activo is true limit 1;
 if extract(isodow from d)=7 then d:=d+1;end if;
 begin
  perform public.reservar_primera_cita_completa(v,d,'17:00','presencial',s,'QA MARÍA RECUPERAR','9908886655','qa-recuperar@example.invalid',true,ip,null,'Otro');
  raise exception 'FAIL invalid dress accepted';
 exception when raise_exception then if sqlerrm='FAIL invalid dress accepted' then raise;end if;end;
 r:=public.reservar_primera_cita_completa(v,d,'17:00','presencial',s,'QA MARÍA RECUPERAR','9908886655','qa-recuperar@example.invalid',true,ip,null,'Gala');
 if r->>'reservada'<>'true' then raise exception 'FAIL reservation';end if;
 for i in 1..3 loop
  r:=public.recuperar_enlace_primera_cita('qa  maria recuperar','QA-RECUPERAR@example.invalid',ip,mail);
  if jsonb_array_length(r)<>1 or r->0->>'id'<>v::text then raise exception 'FAIL normalized owner recovery';end if;
 end loop;
 if jsonb_array_length(public.recuperar_enlace_primera_cita('QA MARÍA RECUPERAR','qa-recuperar@example.invalid',ip,mail))<>0 then raise exception 'FAIL rate limit';end if;
 if jsonb_array_length(public.recuperar_enlace_primera_cita('Wrong Name','qa-recuperar@example.invalid',ip,repeat('a',64)))<>0 then raise exception 'FAIL wrong name';end if;
 if jsonb_array_length(public.recuperar_enlace_primera_cita('QA MARÍA RECUPERAR','wrong@example.invalid',ip,repeat('b',64)))<>0 then raise exception 'FAIL wrong email';end if;
 update public.primeras_citas set estado='cancelada' where id=v;
 if jsonb_array_length(public.recuperar_enlace_primera_cita('QA MARÍA RECUPERAR','qa-recuperar@example.invalid',ip,repeat('c',64)))<>0 then raise exception 'FAIL cancelled';end if;
 if has_function_privilege('anon','public.recuperar_enlace_primera_cita(text,text,text,text)','EXECUTE') or has_function_privilege('authenticated','public.recuperar_enlace_primera_cita(text,text,text,text)','EXECUTE') or not has_function_privilege('service_role','public.recuperar_enlace_primera_cita(text,text,text,text)','EXECUTE') then raise exception 'FAIL role permissions';end if;
end $$;
