-- Ventas › Plan Ahorro XV: the family saves monthly (minimum cuota $150.000) and, 3 months before the event, uses what it saved plus
-- an extra (10 %, 12 % in Corona) on Ámbar dresses and services. Each payment is an income in Cierres de caja (origin «plan_ahorro»).
-- Levels by what has been saved: Rosa (up to $1.500.000): +10 % and tiara · Diamante ($1.500.000–$3.000.000): +10 %, tiara, cushions and
-- 1 Gala Clásica dress on loan · Corona (over $3.000.000): +12 %, tiara, cushions, 2 gala dresses of any category on loan and priority.
-- Prizes are lent free for the event (returned like a rental); the extra is never paid in cash. Who sees and operates: whoever operates
-- the cash register of the store (private.caja_operar) and administration.
-- Reversión:
--   drop function public.plan_ahorro_crear(jsonb), public.plan_ahorro_pagar(uuid,jsonb), public.plan_ahorro_estado(uuid,text,text,uuid),
--    public.planes_ahorro_listar(uuid), private.plan_ahorro_premio(numeric);
--   drop table public.planes_ahorro_pagos, public.planes_ahorro;
--   alter table public.caja_movimientos drop constraint caja_movimientos_origen_check, add constraint caja_movimientos_origen_check check (origen in ('pago','deposito','devolucion','pago_fijo'));

create table if not exists public.planes_ahorro(
 id uuid primary key default gen_random_uuid(),
 numero serial,
 sede_id uuid not null references public.sedes(id),
 titular_nombre text not null check (length(btrim(titular_nombre)) between 3 and 120),
 titular_documento text check (titular_documento is null or length(titular_documento)<=30),
 telefono text not null check (length(regexp_replace(telefono,'\D','','g')) between 10 and 15),
 email text check (email is null or length(email)<=254),
 quinceanera_nombre text check (quinceanera_nombre is null or length(quinceanera_nombre)<=120),
 fecha_evento date not null,
 cuota_mensual numeric not null check (cuota_mensual>=150000 and cuota_mensual<1000000000),
 dia_pago int not null default 5 check (dia_pago between 1 and 28),
 estado text not null default 'activo' check (estado in ('activo','usado','desistido','terminado')),
 contrato_id uuid references public.contratos(id),
 primera_cita_id uuid references public.primeras_citas(id) on delete set null,
 cerrado_at timestamptz,
 cerrado_nota text check (cerrado_nota is null or length(cerrado_nota)<=500),
 notas text check (notas is null or length(notas)<=500),
 creado_por uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.planes_ahorro_pagos(
 id uuid primary key default gen_random_uuid(),
 plan_id uuid not null references public.planes_ahorro(id),
 fecha date not null,
 valor numeric not null check (valor>0 and valor<1000000000),
 medio text not null check (medio in ('Efectivo','Transferencia','Tarjeta','Otro')),
 caja_movimiento_id uuid references public.caja_movimientos(id),
 nota text check (nota is null or length(nota)<=300),
 registrado_por uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists planes_ahorro_sede on public.planes_ahorro(sede_id,estado);
create index if not exists planes_ahorro_pagos_plan on public.planes_ahorro_pagos(plan_id);
create trigger planes_ahorro_historial after insert or update or delete on public.planes_ahorro for each row execute function private.config_historial();
create trigger planes_ahorro_pagos_historial after insert or update or delete on public.planes_ahorro_pagos for each row execute function private.config_historial();

alter table public.caja_movimientos drop constraint caja_movimientos_origen_check,
 add constraint caja_movimientos_origen_check check (origen in ('pago','deposito','devolucion','pago_fijo','plan_ahorro'));

alter table public.planes_ahorro enable row level security;
alter table public.planes_ahorro_pagos enable row level security;
create policy planes_ahorro_ver on public.planes_ahorro for select to authenticated using (public.es_admin() or private.caja_operar(sede_id));
create policy planes_ahorro_pagos_ver on public.planes_ahorro_pagos for select to authenticated
 using (exists(select 1 from public.planes_ahorro p where p.id=plan_id and (public.es_admin() or private.caja_operar(p.sede_id))));
revoke insert,update,delete on public.planes_ahorro, public.planes_ahorro_pagos from anon, authenticated;

-- Level and extra for what has been saved (single place for the plan's rules).
create or replace function private.plan_ahorro_premio(p_ahorrado numeric) returns jsonb
language sql immutable set search_path='' as $$
 select case when p_ahorrado>3000000 then jsonb_build_object('nivel','Corona','pct',12,'premios','Tiara, cojines, 2 vestidos de gala de cualquier categoría en préstamo y prioridad para escoger','siguiente',null,'falta',0)
  when p_ahorrado>=1500000 then jsonb_build_object('nivel','Diamante','pct',10,'premios','Tiara, cojines y 1 vestido de Gala Clásica en préstamo','siguiente','Corona','falta',3000001-p_ahorrado)
  else jsonb_build_object('nivel','Rosa','pct',10,'premios','Tiara en préstamo','siguiente','Diamante','falta',1500000-p_ahorrado) end;
$$;

-- Enrolls a family. The first visit with the same phone (last 10 digits) is linked when there is one.
create or replace function public.plan_ahorro_crear(p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare s uuid:=(p->>'sede_id')::uuid; tel text:=regexp_replace(coalesce(p->>'telefono',''),'\D','','g'); ev date:=nullif(p->>'fecha_evento','')::date;
 cuota numeric:=nullif(p->>'cuota_mensual','')::numeric; hoy date:=(now() at time zone 'America/Bogota')::date; mail text:=nullif(lower(btrim(coalesce(p->>'email',''))),''); v_id uuid; cita uuid;
begin
 if s is null or not (public.es_admin() or private.caja_operar(s)) then raise exception 'No puedes inscribir planes en esta sede.' using errcode='42501'; end if;
 if length(btrim(coalesce(p->>'titular_nombre','')))<3 then raise exception 'Escribe el nombre de quien ahorra.'; end if;
 if length(tel)<10 then raise exception 'Escribe el celular (10 dígitos).'; end if;
 if ev is null or ev<hoy+90 then raise exception 'La fecha del evento debe ser al menos 3 meses después de hoy (el plan se usa 3 meses antes del evento).'; end if;
 if ev>hoy+730 then raise exception 'La fecha del evento no puede ser a más de 2 años.'; end if;
 if cuota is null or cuota<150000 then raise exception 'La cuota mínima es de $150.000 al mes.'; end if;
 if mail is not null and mail !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then raise exception 'El correo no es válido.'; end if;
 select id into cita from public.primeras_citas where right(regexp_replace(coalesce(telefono,''),'\D','','g'),10)=right(tel,10) and estado<>'cancelada' order by created_at desc limit 1;
 insert into public.planes_ahorro(sede_id,titular_nombre,titular_documento,telefono,email,quinceanera_nombre,fecha_evento,cuota_mensual,dia_pago,primera_cita_id,notas,creado_por)
 values(s,btrim(p->>'titular_nombre'),nullif(btrim(coalesce(p->>'titular_documento','')),''),tel,mail,nullif(btrim(coalesce(p->>'quinceanera_nombre','')),''),ev,cuota,
  coalesce(nullif(p->>'dia_pago','')::int,5),cita,nullif(btrim(coalesce(p->>'notas','')),''),auth.uid()) returning id into v_id;
 return v_id;
end $$;

-- Records a cuota: it goes to Cierres de caja of the store as an income «Plan Ahorro XV» (receipt optional).
create or replace function public.plan_ahorro_pagar(p_plan uuid,p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare pl public.planes_ahorro; pid uuid:=gen_random_uuid(); mov uuid;
begin
 select * into pl from public.planes_ahorro where id=p_plan for update;
 if pl.id is null or not (public.es_admin() or private.caja_operar(pl.sede_id)) then raise exception 'Plan no encontrado.' using errcode='42501'; end if;
 if pl.estado<>'activo' then raise exception 'Este plan ya no está activo.'; end if;
 insert into public.planes_ahorro_pagos(id,plan_id,fecha,valor,medio,nota,registrado_por)
 values(pid,p_plan,(p->>'fecha')::date,(p->>'valor')::numeric,p->>'medio',nullif(btrim(coalesce(p->>'nota','')),''),auth.uid());
 mov:=private.registrar_movimiento_caja(jsonb_build_object('sede_id',pl.sede_id,'fecha',p->>'fecha','tipo','ingreso','categoria','Plan Ahorro XV','medio',p->>'medio',
  'valor',p->>'valor','descripcion',left('Plan Ahorro XV n.º '||pl.numero||' · '||pl.titular_nombre||coalesce(' · '||pl.quinceanera_nombre,''),500),
  'origen','plan_ahorro','origen_id',pid,'comprobante_path',p->>'comprobante_path','cuenta_id',p->>'cuenta_id'));
 update public.planes_ahorro_pagos set caja_movimiento_id=mov where id=pid;
 update public.planes_ahorro set updated_at=now() where id=p_plan;
 return pid;
end $$;

-- Closes a plan: «usado» (turned into a contract, the extra applies), «desistido» (refund of what was paid minus 10 %, no extra)
-- or «terminado» (2 unpaid cuotas in a row; same refund). The refund itself is paid from Cierres de caja.
create or replace function public.plan_ahorro_estado(p_id uuid,p_estado text,p_nota text,p_contrato uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare pl public.planes_ahorro;
begin
 select * into pl from public.planes_ahorro where id=p_id for update;
 if pl.id is null or not (public.es_admin() or private.caja_operar(pl.sede_id)) then raise exception 'Plan no encontrado.' using errcode='42501'; end if;
 if p_estado not in ('activo','usado','desistido','terminado') then raise exception 'Estado no válido.'; end if;
 if p_estado='activo' and not public.es_admin() then raise exception 'Solo administración reactiva un plan.'; end if;
 if p_estado<>'activo' and length(btrim(coalesce(p_nota,'')))<5 then raise exception 'Escribe una nota (mínimo 5 caracteres).'; end if;
 if p_contrato is not null and not exists(select 1 from public.contratos where id=p_contrato and sede_id=pl.sede_id) then raise exception 'El contrato no es de esta sede.'; end if;
 update public.planes_ahorro set estado=p_estado,contrato_id=coalesce(p_contrato,contrato_id),cerrado_at=case when p_estado='activo' then null else now() end,
  cerrado_nota=case when p_estado='activo' then null else btrim(p_nota) end,updated_at=now() where id=p_id;
end $$;

-- List with what has been saved, the extra, the level and whether the family is up to date.
create or replace function public.planes_ahorro_listar(p_sede uuid default null) returns table(
 id uuid,numero int,sede_id uuid,sede text,titular_nombre text,telefono text,email text,quinceanera_nombre text,fecha_evento date,cuota_mensual numeric,dia_pago int,
 estado text,contrato_id uuid,created_at timestamptz,ahorrado numeric,pagos int,ultimo_pago date,extra numeric,disponible numeric,nivel text,premios text,siguiente text,falta numeric,
 usar_desde date,meses_pagados int,meses_esperados int,al_dia boolean,devolucion numeric,notas text,cerrado_nota text)
language sql stable security definer set search_path='' as $$
 with base as(
  select p.*,s.nombre sede_nombre,coalesce(sum(g.valor),0) ah,count(g.id)::int n,max(g.fecha) ult
  from public.planes_ahorro p join public.sedes s on s.id=p.sede_id left join public.planes_ahorro_pagos g on g.plan_id=p.id
  where (public.es_admin() or private.caja_operar(p.sede_id)) and (p_sede is null or p.sede_id=p_sede)
  group by p.id,s.nombre)
 select b.id,b.numero,b.sede_id,b.sede_nombre,b.titular_nombre,b.telefono,b.email,b.quinceanera_nombre,b.fecha_evento,b.cuota_mensual,b.dia_pago,b.estado,b.contrato_id,b.created_at,
  b.ah,b.n,b.ult,round(b.ah*(r->>'pct')::numeric/100),b.ah+round(b.ah*(r->>'pct')::numeric/100),r->>'nivel',r->>'premios',r->>'siguiente',greatest(0,round((r->>'falta')::numeric)),
  (b.fecha_evento-90),floor(b.ah/b.cuota_mensual)::int,e.esperados,b.estado<>'activo' or b.ah>=b.cuota_mensual*e.esperados,round(b.ah*0.9),b.notas,b.cerrado_nota
 from base b cross join lateral (select private.plan_ahorro_premio(b.ah) r) x
 cross join lateral (select (extract(year from age(date_trunc('month',(now() at time zone 'America/Bogota')::date),date_trunc('month',b.created_at at time zone 'America/Bogota')))*12
  +extract(month from age(date_trunc('month',(now() at time zone 'America/Bogota')::date),date_trunc('month',b.created_at at time zone 'America/Bogota'))))::int d) m
 cross join lateral (select m.d+1-case when m.d>0 and extract(day from (now() at time zone 'America/Bogota'))<=b.dia_pago then 1 else 0 end esperados) e
 order by b.estado<>'activo',b.fecha_evento;
$$;
revoke all on function private.plan_ahorro_premio(numeric) from public, anon;
revoke all on function public.plan_ahorro_crear(jsonb), public.plan_ahorro_pagar(uuid,jsonb), public.plan_ahorro_estado(uuid,text,text,uuid), public.planes_ahorro_listar(uuid) from public, anon;
grant execute on function public.plan_ahorro_crear(jsonb), public.plan_ahorro_pagar(uuid,jsonb), public.plan_ahorro_estado(uuid,text,text,uuid), public.planes_ahorro_listar(uuid) to authenticated;
