-- Bank accounts in Colombia: account type (savings or checking) and the Bre-B key, apart from the account number.
-- Reversible: drop the two columns and restore the previous bodies of cuenta_json and guardar_cuenta_dinero.
alter table public.cuentas_dinero add column if not exists tipo_cuenta text check (tipo_cuenta in ('ahorros','corriente'));
alter table public.cuentas_dinero add column if not exists llave text;

create or replace function private.cuenta_json(c public.cuentas_dinero) returns jsonb
language sql stable security definer set search_path to '' as $function$
 select jsonb_build_object('id',c.id,'nombre',c.nombre,'tipo',c.tipo,'banco',c.banco,'numero',c.numero,'titular',c.titular,
  'tipo_cuenta',c.tipo_cuenta,'llave',c.llave,
  'sede_id',c.sede_id,'sede',(select nombre from public.sedes where id=c.sede_id),'activo',c.activo,'orden',c.orden);
$function$;

create or replace function private.guardar_cuenta_dinero(p_datos jsonb) returns uuid
language plpgsql security definer set search_path to '' as $function$
declare u public.profiles; v_id uuid:=nullif(p_datos->>'id','')::uuid; v_tipo text:=p_datos->>'tipo';
 v_nombre text:=btrim(coalesce(p_datos->>'nombre','')); v_banco text:=nullif(btrim(coalesce(p_datos->>'banco','')),'');
 v_numero text:=nullif(btrim(coalesce(p_datos->>'numero','')),''); v_titular text:=nullif(btrim(coalesce(p_datos->>'titular','')),'');
 v_tipo_cuenta text:=nullif(btrim(coalesce(p_datos->>'tipo_cuenta','')),''); v_llave text:=nullif(btrim(coalesce(p_datos->>'llave','')),'');
 v_sede uuid:=nullif(p_datos->>'sede_id','')::uuid; v_activo boolean:=coalesce((p_datos->>'activo')::boolean,true);
 v_orden int:=coalesce((p_datos->>'orden')::int,0); old public.cuentas_dinero;
begin
 u:=private.caja_perfil();
 if u.id is null or not (private.es_finanzas() or (private.tiene_permiso('caja.cuentas') and v_sede is not null and private.caja_operar(v_sede))) then raise exception 'Solo puedes configurar cuentas de tu sede (las cuentas de todas las sedes las configura administración).' using errcode='42501'; end if;
 if v_tipo not in ('efectivo','banco','billetera') or length(v_nombre) not between 2 and 80 then raise exception 'Escribe el nombre y el tipo de la cuenta.'; end if;
 if v_tipo='efectivo' and v_sede is null then raise exception 'La caja menor debe pertenecer a una sede.'; end if;
 if v_tipo='banco' and v_banco is null then raise exception 'Escribe el banco de la cuenta.'; end if;
 if v_tipo_cuenta is not null and v_tipo_cuenta not in ('ahorros','corriente') then raise exception 'El tipo de cuenta debe ser ahorros o corriente.'; end if;
 if v_tipo<>'banco' then v_tipo_cuenta:=null; end if;
 if v_tipo='efectivo' then v_llave:=null; end if;
 if v_sede is not null and not exists(select 1 from public.sedes where id=v_sede) then raise exception 'Sede no encontrada.'; end if;
 if v_id is not null then
  select * into old from public.cuentas_dinero where id=v_id for update;
  if old.id is null then raise exception 'Cuenta no encontrada.'; end if;
  if not private.es_finanzas() and (old.sede_id is null or not private.caja_operar(old.sede_id)) then raise exception 'Solo puedes editar las cuentas de tu sede.' using errcode='42501'; end if;
  if old.tipo<>v_tipo and exists(select 1 from public.caja_movimientos where cuenta_id=v_id) then raise exception 'La cuenta ya tiene movimientos: no se puede cambiar su tipo.'; end if;
  if old.tipo='efectivo' and old.sede_id is distinct from v_sede and exists(select 1 from public.caja_movimientos where cuenta_id=v_id) then raise exception 'La caja menor ya tiene movimientos: no se puede cambiar de sede.'; end if;
 end if;
 begin
  if v_id is null then
   insert into public.cuentas_dinero(nombre,tipo,banco,numero,titular,tipo_cuenta,llave,sede_id,activo,orden,creado_por)
   values(v_nombre,v_tipo,v_banco,v_numero,v_titular,v_tipo_cuenta,v_llave,v_sede,v_activo,v_orden,u.id) returning id into v_id;
  else
   update public.cuentas_dinero set nombre=v_nombre,tipo=v_tipo,banco=v_banco,numero=v_numero,titular=v_titular,tipo_cuenta=v_tipo_cuenta,llave=v_llave,sede_id=v_sede,activo=v_activo,orden=v_orden,updated_at=now() where id=v_id;
  end if;
 exception when unique_violation then raise exception 'Esa sede ya tiene una caja menor activa.';
 end;
 return v_id;
end $function$;
