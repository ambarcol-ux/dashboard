-- Origen de las primeras citas:
--  · anuncio_id: al crear una cita, si la clienta escribió al 304 desde un anuncio (mismo celular, últimos 30 días), la cita queda ligada a ese anuncio,
--    aunque haya agendado por la web, un enlace o con una asesora.
--  · Registrar «Cómo se enteró» con un clic desde el detalle de la cita (lista configurable pv_como_se_entero), con historial.
-- Reversión: drop trigger primeras_citas_anuncio on public.primeras_citas; drop function private.primeras_citas_anuncio();
--   drop function public.registrar_origen_primera_cita(uuid,text); drop function private.registrar_origen_primera_cita(uuid,text);
--   alter table public.primeras_citas drop column anuncio_id;
alter table public.primeras_citas add column if not exists anuncio_id text;

create or replace function private.primeras_citas_anuncio() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.anuncio_id is null and length(regexp_replace(coalesce(new.telefono,''),'\D','','g'))>=10 then
  select w.anuncio_id into new.anuncio_id from public.whatsapp_conversaciones w
  where w.anuncio_id is not null and right(w.telefono,10)=right(regexp_replace(new.telefono,'\D','','g'),10)
    and w.anuncio_at between now()-interval '30 days' and now()+interval '1 hour'
  order by w.anuncio_at desc limit 1;
 end if;
 return new;
end $$;
create trigger primeras_citas_anuncio before insert on public.primeras_citas for each row execute function private.primeras_citas_anuncio();

create or replace function private.registrar_origen_primera_cita(p_id uuid, p_origen text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; v text:=trim(coalesce(p_origen,''));
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into c from public.primeras_citas where id=p_id for update;
 if not found or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'Cita no disponible.'; end if;
 if v='' or length(v)>80 then raise exception 'Elige cómo se enteró la clienta.'; end if;
 if v is not distinct from c.como_se_entero then return; end if;
 update public.primeras_citas set como_se_entero=v,updated_at=clock_timestamp() where id=c.id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,auth.uid(),'Origen de la cita',format('Cómo se enteró: %s → %s',coalesce(c.como_se_entero,'—'),v));
end $$;
create or replace function public.registrar_origen_primera_cita(p_id uuid, p_origen text) returns void
language sql set search_path='' as $$ select private.registrar_origen_primera_cita(p_id,p_origen); $$;
revoke all on function private.registrar_origen_primera_cita(uuid,text), public.registrar_origen_primera_cita(uuid,text) from public, anon;
grant execute on function private.registrar_origen_primera_cita(uuid,text), public.registrar_origen_primera_cita(uuid,text) to authenticated;
