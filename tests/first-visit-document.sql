do $$
declare s uuid; v uuid:=gen_random_uuid(); d date:=(now() at time zone 'America/Bogota')::date+20; r jsonb; ip text:=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'); lim text:=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'); ver timestamptz;
begin
 select sede_id into s from public.profiles where email='asesor1bogotaambar@gmail.com';
 if extract(isodow from d)=7 then d:=d+1;end if;
 r:=public.reservar_primera_cita_documento(v,d,'17:00','presencial',s,'QA CEDULA','9908886619','',true,ip,null,'Gala','9908886619');
 if r->>'reservada'<>'true' then raise exception 'FAIL reservation';end if;
 r:=public.buscar_primera_cita_documento('9908886619',ip,lim);
 if jsonb_array_length(r)<>1 or r->0->>'id'<>v::text or r->0 ? 'email' or r->0 ? 'cliente_nombre' or r->0 ? 'cliente_documento' then raise exception 'FAIL search/projection';end if;
 if jsonb_array_length(public.buscar_primera_cita_documento('999999999999999',ip,repeat('a',64)))<>0 then raise exception 'FAIL wrong document';end if;
 perform public.buscar_primera_cita_documento('9908886619',ip,lim) from generate_series(1,4);
 if jsonb_array_length(public.buscar_primera_cita_documento('9908886619',ip,lim))<>0 then raise exception 'FAIL rate limit';end if;
 select updated_at into ver from public.primeras_citas where id=v;
 perform set_config('request.jwt.claim.sub',(select id::text from public.profiles where email='genesis@ambarcouture.com'),true);
 begin
  perform public.guardar_documento_primera_cita(v,'9908886620',ver);raise exception 'FAIL other site accepted';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',(select id::text from public.profiles where email='asesor1bogotaambar@gmail.com'),true);
 perform public.guardar_documento_primera_cita(v,'9908886620',ver);
 if (select cliente_documento from public.primeras_citas where id=v)<>'9908886620' then raise exception 'FAIL staff edit';end if;
 select updated_at into ver from public.primeras_citas where id=v;
 perform public.accion_cliente_primera_cita(v,'reprogramar',jsonb_build_object('version',ver,'fecha',d,'hora','18:00','modalidad','presencial','sede',s,'motivo','Prueba cambio'));
 if (select hora from public.primeras_citas where id=v)<>time '18:00' then raise exception 'FAIL reschedule';end if;
 select updated_at into ver from public.primeras_citas where id=v;
 begin perform public.accion_cliente_primera_cita(v,'reprogramar',jsonb_build_object('version',ver,'fecha',d,'hora','19:00','modalidad','presencial','sede',s,'motivo','Prueba horario'));raise exception 'FAIL invalid hour accepted';exception when raise_exception then if sqlerrm='FAIL invalid hour accepted' then raise;end if;end;
 if (select hora from public.primeras_citas where id=v)<>time '18:00' then raise exception 'FAIL previous slot lost';end if;
 update public.primeras_citas set estado='cancelada' where id=v;
 if jsonb_array_length(public.buscar_primera_cita_documento('9908886620',ip,repeat('b',64)))<>0 then raise exception 'FAIL cancelled visible';end if;
 if has_function_privilege('anon','public.buscar_primera_cita_documento(text,text,text)','EXECUTE') or has_function_privilege('authenticated','public.buscar_primera_cita_documento(text,text,text)','EXECUTE') then raise exception 'FAIL bypass rate limits';end if;
end $$;
