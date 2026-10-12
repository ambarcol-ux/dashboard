-- Primeras citas: Sundays and Colombian Monday holidays have no capacity, and every
-- agenda change for a customer with email is queued as a notification email.
-- Existing appointments on those days are kept; only new bookings/reschedules are blocked.

-- Colombian holidays (Ley 51 de 1983). Mirrored in lib/first-visit-calendar.ts for the forms.
create function private.festivo_colombia(p_fecha date) returns boolean language plpgsql immutable set search_path='' as $$
declare y integer := extract(year from p_fecha)::integer; a integer; b integer; c integer; d integer; e integer; f integer; g integer; h integer; i integer; k integer; l integer; m integer; easter date;
begin
 a:=y%19;b:=y/100;c:=y%100;d:=b/4;e:=b%4;f:=(b+8)/25;g:=(b-f+1)/3;h:=(19*a+b-d-g+15)%30;i:=c/4;k:=c%4;l:=(32+2*e+2*i-h-k)%7;m:=(a+11*h+22*l)/451;
 easter:=make_date(y,(h+l-7*m+114)/31,(h+l-7*m+114)%31+1);
 return p_fecha in (make_date(y,1,1),make_date(y,5,1),make_date(y,7,20),make_date(y,8,7),make_date(y,12,8),make_date(y,12,25),easter-3,easter-2)
  or p_fecha in (select x+((8-extract(dow from x)::integer)%7) from unnest(array[make_date(y,1,6),make_date(y,3,19),make_date(y,6,29),make_date(y,8,15),make_date(y,10,12),make_date(y,11,1),make_date(y,11,11),easter+39,easter+60,easter+68]) x);
end; $$;
revoke all on function private.festivo_colombia(date) from public,anon,authenticated;
grant execute on function private.festivo_colombia(date) to service_role;

create or replace function public.disponibilidad_primera_cita(p_fecha date,p_modalidad text,p_sede uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare today date := (now() at time zone 'America/Bogota')::date; closed boolean; result jsonb;
begin
 if p_fecha is null or p_fecha<today or p_fecha>today+90 or p_modalidad is null or p_modalidad not in ('presencial','virtual') or not exists(select 1 from public.sedes where id=p_sede and activo is true) then raise exception 'Fecha, modalidad o sede inválida.'; end if;
 closed:=extract(isodow from p_fecha)=7 or (extract(isodow from p_fecha)=1 and private.festivo_colombia(p_fecha));
 select coalesce(jsonb_agg(jsonb_build_object('hora',to_char(h,'HH24:MI'),'cupos',greatest(0,cap-ocupados)) order by h),'[]'::jsonb) into result
 from (
 select (time '09:00'+n*interval '1 hour') h,
 case when closed then 0 when p_modalidad='virtual' then 1 else 2 end cap,
 (select count(*) from public.primeras_citas c where c.fecha=p_fecha and c.hora=time '09:00'+n*interval '1 hour' and c.modalidad=p_modalidad and (p_modalidad='virtual' or c.sede_id=p_sede) and c.estado<>'cancelada')::integer ocupados
 from generate_series(0,9) n
 where (p_fecha+time '09:00'+n*interval '1 hour') at time zone 'America/Bogota'>now()
 ) t;
 return result;
end; $$;

-- Customer email outbox. The trigger snapshots each change so a later edit never rewrites an earlier notice.
create table public.primeras_citas_correos (
 id uuid primary key default gen_random_uuid(),
 cita_id uuid not null references public.primeras_citas(id),
 evento text not null check (evento in ('reserva','reprogramacion','cancelacion','confirmacion','enlace_virtual')),
 detalle jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 estado text not null default 'pendiente' check (estado in ('pendiente','enviando','enviado','error','omitido')),
 intentos integer not null default 0,
 provider_id text,
 error text
);
create index primeras_citas_correos_pendientes on public.primeras_citas_correos(created_at) where estado in ('pendiente','error','enviando');
create index primeras_citas_correos_cita on public.primeras_citas_correos(cita_id,created_at);
alter table public.primeras_citas_correos enable row level security;
revoke all on public.primeras_citas_correos from public,anon,authenticated;
grant select on public.primeras_citas_correos to authenticated;
grant all on public.primeras_citas_correos to service_role;
create policy correos_lectura on public.primeras_citas_correos for select to authenticated using(exists(select 1 from public.primeras_citas c where c.id=cita_id));

create function private.notificar_cambio_primera_cita() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; site text;
begin
 if coalesce(new.email,'')='' or (new.crm_origen_id is not null and not new.crm_mensajes_activos) then return new; end if;
 if tg_op='INSERT' then kind:='reserva';
 elsif new.estado='cancelada' and old.estado<>'cancelada' then kind:='cancelacion';
 elsif new.estado='cancelada' then return new;
 elsif (new.fecha,new.hora,new.modalidad,new.sede_id) is distinct from (old.fecha,old.hora,old.modalidad,old.sede_id) then kind:='reprogramacion';
 elsif new.estado='confirmada' and old.estado<>'confirmada' then kind:='confirmacion';
 elsif new.enlace_virtual<>'' and new.enlace_virtual is distinct from old.enlace_virtual then kind:='enlace_virtual';
 else return new;
 end if;
 select nombre into site from public.sedes where id=new.sede_id;
 insert into public.primeras_citas_correos(cita_id,evento,detalle) values(new.id,kind,jsonb_build_object(
  'fecha',new.fecha,'hora',to_char(new.hora,'HH24:MI'),'modalidad',new.modalidad,'sede',site,'motivo',new.motivo,'enlace_virtual',new.enlace_virtual,
  'anterior',case when kind='reprogramacion' then jsonb_build_object('fecha',old.fecha,'hora',to_char(old.hora,'HH24:MI'),'modalidad',old.modalidad,'sede',(select nombre from public.sedes where id=old.sede_id)) end));
 return new;
end; $$;
revoke all on function private.notificar_cambio_primera_cita() from public,anon,authenticated;
create trigger notificar_cambio_primera_cita after insert or update of fecha,hora,modalidad,sede_id,estado,enlace_virtual on public.primeras_citas for each row execute function private.notificar_cambio_primera_cita();

-- Server-only claim. Resend's idempotency key (the row id) makes a retry after an unknown outcome safe.
create function public.tomar_correo_primera_cita(p_cita uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.primeras_citas_correos; c public.primeras_citas;
begin
 update public.primeras_citas_correos set estado='error',error='Resultado del envío desconocido; se reintentará.',updated_at=now() where estado='enviando' and updated_at<now()-interval '5 minutes';
 select * into r from public.primeras_citas_correos where estado in ('pendiente','error') and intentos<5 and (p_cita is null or cita_id=p_cita) and (estado='pendiente' or updated_at<now()-interval '2 minutes') order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 select * into c from public.primeras_citas where id=r.cita_id;
 if coalesce(c.email,'')='' or c.resultado_comercial='NO CONTACTAR' or r.created_at<now()-interval '3 days' then
  update public.primeras_citas_correos set estado='omitido',updated_at=now() where id=r.id; return jsonb_build_object('omitido',true);
 end if;
 update public.primeras_citas_correos set estado='enviando',intentos=intentos+1,updated_at=now() where id=r.id;
 return jsonb_build_object('correo',to_jsonb(r),'cita',jsonb_build_object('id',c.id,'fecha',c.fecha,'cliente_nombre',c.cliente_nombre,'email',c.email));
end; $$;
revoke all on function public.tomar_correo_primera_cita(uuid) from public,anon,authenticated;
grant execute on function public.tomar_correo_primera_cita(uuid) to service_role;
notify pgrst,'reload schema';
