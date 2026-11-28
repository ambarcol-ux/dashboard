-- Seguimiento fase 2 (C · solo aviso): the advisor sets aside for 48 hours a favorite dress of a visit for her event date. It does NOT
-- change availability (contracts, allies, QR keep working the same): whoever starts a contract with that dress near that date sees a warning.
-- Reversión: drop function public.apartar_vestido(uuid,text), public.apartados_activos(uuid,text[],date); drop table public.apartados_vestido;
create table if not exists public.apartados_vestido(
 id uuid primary key default gen_random_uuid(),
 cita_id uuid not null references public.primeras_citas(id) on delete cascade,
 vestido_id uuid not null references public.vestidos(id),
 codigo text not null,
 sede_id uuid not null references public.sedes(id),
 fecha_evento date not null,
 cliente text,
 hasta timestamptz not null,
 creado_por uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create index if not exists apartados_vestido_activos on public.apartados_vestido(sede_id,codigo,hasta);
alter table public.apartados_vestido enable row level security;
revoke all on public.apartados_vestido from anon, authenticated;

create or replace function public.apartar_vestido(p_cita uuid, p_codigo text)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; v uuid; cod text:=upper(btrim(coalesce(p_codigo,''))); h timestamptz:=now()+interval '48 hours';
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into c from public.primeras_citas where id=p_cita;
 if c.id is null or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'No tienes acceso a esta visita.' using errcode='42501'; end if;
 if c.fecha_evento is null then raise exception 'Primero registra la fecha del evento.'; end if;
 select id into v from public.vestidos where upper(btrim(codigo))=cod and not coalesce(archivado,false) and (sede_actual_id=c.sede_id or sede_principal_id=c.sede_id) limit 1;
 if v is null then raise exception 'No encontré el vestido % en esta sede.', cod; end if;
 update public.apartados_vestido set hasta=h where cita_id=p_cita and vestido_id=v and hasta>now();
 if not found then
  insert into public.apartados_vestido(cita_id,vestido_id,codigo,sede_id,fecha_evento,cliente,hasta,creado_por)
   values(p_cita,v,cod,c.sede_id,c.fecha_evento,split_part(btrim(coalesce(c.cliente_nombre,'')),' ',1),h,auth.uid());
 end if;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(p_cita,auth.uid(),'Vestido apartado 48 h',cod||' para el '||to_char(c.fecha_evento,'DD/MM/YYYY'));
 return h;
end $$;
revoke all on function public.apartar_vestido(uuid,text) from public, anon;
grant execute on function public.apartar_vestido(uuid,text) to authenticated;

-- Active set-asides of these dress codes in a store whose event date is within 3 days of the given date (only a warning).
create or replace function public.apartados_activos(p_sede uuid, p_codigos text[], p_fecha date)
returns table(codigo text, cliente text, fecha_evento date, hasta timestamptz) language sql stable security definer set search_path='' as $$
 select a.codigo, a.cliente, a.fecha_evento, a.hasta from public.apartados_vestido a
 where auth.uid() is not null and a.sede_id=p_sede and a.hasta>now() and a.codigo=any(array(select upper(btrim(x)) from unnest(coalesce(p_codigos,'{}')) x))
  and (p_fecha is null or abs(a.fecha_evento-p_fecha)<=3)
 order by a.hasta;
$$;
revoke all on function public.apartados_activos(uuid,text[],date) from public, anon;
grant execute on function public.apartados_activos(uuid,text[],date) to authenticated;
