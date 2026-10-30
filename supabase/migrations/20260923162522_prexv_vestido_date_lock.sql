-- Copied from Supabase (applied migration 20260923162522).
create or replace function private.assert_vestido_fecha_libre(
  p_contrato_id uuid,
  p_vestido_id uuid,
  p_fecha date,
  p_tipo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero_contrato text;
  v_codigo_vestido text;
  v_tipo_conflicto text;
begin
  if p_vestido_id is null or p_fecha is null then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_vestido_id::text || ':' || p_fecha::text, 0)
  );

  select
    c.numero_contrato,
    coalesce(v.codigo, p_vestido_id::text),
    case
      when c.fecha_pre_xv = p_fecha then 'PRE-XV'
      else 'EVENTO'
    end
  into v_numero_contrato, v_codigo_vestido, v_tipo_conflicto
  from (
    select distinct civ.contrato_id, civ.vestido_id
    from public.contrato_items_vestidos civ
    where civ.vestido_id = p_vestido_id

    union

    select c0.id as contrato_id, c0.vestido_id
    from public.contratos c0
    where c0.vestido_id = p_vestido_id
  ) u
  join public.contratos c on c.id = u.contrato_id
  left join public.vestidos v on v.id = u.vestido_id
  where c.id is distinct from p_contrato_id
    and lower(coalesce(c.estado,'')) not in ('cancelado','anulado','rechazado','borrador')
    and (c.fecha_pre_xv = p_fecha or c.fecha_evento = p_fecha)
  order by c.created_at
  limit 1;

  if found then
    raise exception 'El vestido % ya está bloqueado para % el % por % del contrato %.',
      v_codigo_vestido,
      coalesce(p_tipo,'USO'),
      to_char(p_fecha,'YYYY-MM-DD'),
      v_tipo_conflicto,
      coalesce(v_numero_contrato,'SIN NÚMERO')
      using errcode = '23514',
            hint = 'Selecciona otro vestido o cambia la fecha antes de guardar.';
  end if;
end;
$$;

revoke all on function private.assert_vestido_fecha_libre(uuid,uuid,date,text) from public, anon, authenticated;

create or replace function private.validar_bloqueo_fechas_contrato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if lower(coalesce(new.estado,'')) in ('cancelado','anulado','rechazado','borrador') then
    return new;
  end if;

  for v_id in
    select distinct x.vestido_id
    from (
      select new.vestido_id as vestido_id
      union all
      select civ.vestido_id
      from public.contrato_items_vestidos civ
      where civ.contrato_id = new.id
    ) x
    where x.vestido_id is not null
  loop
    perform private.assert_vestido_fecha_libre(new.id, v_id, new.fecha_pre_xv, 'PRE-XV');

    if new.fecha_evento is distinct from new.fecha_pre_xv then
      perform private.assert_vestido_fecha_libre(new.id, v_id, new.fecha_evento, 'EVENTO');
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function private.validar_bloqueo_fechas_contrato() from public, anon, authenticated;

create or replace function private.validar_bloqueo_item_vestido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contratos%rowtype;
begin
  if new.vestido_id is null or new.contrato_id is null then
    return new;
  end if;

  select * into c
  from public.contratos
  where id = new.contrato_id;

  if not found then
    return new;
  end if;

  if lower(coalesce(c.estado,'')) in ('cancelado','anulado','rechazado','borrador') then
    return new;
  end if;

  perform private.assert_vestido_fecha_libre(c.id, new.vestido_id, c.fecha_pre_xv, 'PRE-XV');

  if c.fecha_evento is distinct from c.fecha_pre_xv then
    perform private.assert_vestido_fecha_libre(c.id, new.vestido_id, c.fecha_evento, 'EVENTO');
  end if;

  return new;
end;
$$;

revoke all on function private.validar_bloqueo_item_vestido() from public, anon, authenticated;

create trigger bloquear_vestido_por_fechas_contrato
before insert or update of fecha_pre_xv, fecha_evento, vestido_id, estado
on public.contratos
for each row
execute function private.validar_bloqueo_fechas_contrato();

create trigger bloquear_vestido_por_fechas_item
before insert or update of contrato_id, vestido_id
on public.contrato_items_vestidos
for each row
execute function private.validar_bloqueo_item_vestido();
