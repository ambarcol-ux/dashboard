-- WhatsApp AI: after booking in the chat, the client may write her full name and email; they are saved on her latest open first visit
-- (same pattern as cita_evento_por_chat). The email is only filled when empty; the name replaces the WhatsApp profile name.
-- Reversible: drop function public.cita_datos_por_chat(text,text,text); drop function private.cita_datos_por_chat(text,text,text);
create or replace function private.cita_datos_por_chat(p_tel text, p_nombre text, p_correo text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare c public.primeras_citas; t text:=right(regexp_replace(coalesce(p_tel,''),'\D','','g'),10);
 n text:=nullif(left(btrim(regexp_replace(coalesce(p_nombre,''),'[^[:alpha:]'' .-]','','g')),120),'');
 e text:=nullif(lower(btrim(coalesce(p_correo,''))),''); cambios text[]:='{}';
begin
 if length(t)<10 then return false; end if;
 if n is not null and length(n)<3 then n:=null; end if;
 if e is not null and (length(e)>254 or e !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$') then e:=null; end if;
 if n is null and e is null then return false; end if;
 select * into c from public.primeras_citas
 where right(regexp_replace(coalesce(telefono,''),'\D','','g'),10)=t and estado<>'cancelada'
  and not exists(select 1 from public.contratos k where k.primera_cita_id=primeras_citas.id)
 order by created_at desc limit 1 for update;
 if c.id is null then return false; end if;
 if n is not null and c.cliente_nombre is distinct from n then cambios:=cambios||('nombre «'||n||'» (antes: «'||coalesce(c.cliente_nombre,'')||'»)'); else n:=null; end if;
 if e is not null and coalesce(c.email,'')='' then cambios:=cambios||('correo '||e); else e:=null; end if;
 if n is null and e is null then return false; end if;
 update public.primeras_citas set cliente_nombre=coalesce(n,cliente_nombre),email=coalesce(e,email),updated_at=clock_timestamp() where id=c.id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,null,'Datos de la clienta por la IA',
  'La clienta escribió en el chat de WhatsApp su '||array_to_string(cambios,' y ')||'.');
 return true;
end $$;
create or replace function public.cita_datos_por_chat(p_tel text, p_nombre text, p_correo text)
returns boolean language sql security definer set search_path to '' as $$ select private.cita_datos_por_chat(p_tel,p_nombre,p_correo) $$;
revoke all on function public.cita_datos_por_chat(text,text,text) from public, anon, authenticated;
grant execute on function public.cita_datos_por_chat(text,text,text) to service_role;
