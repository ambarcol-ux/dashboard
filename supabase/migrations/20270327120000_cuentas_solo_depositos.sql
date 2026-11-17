-- Accounts reserved for guarantee deposits (they enter and are returned from there): they never appear nor can be used in the
-- cash register, expenses, fixed payments or contract payments, and they do not count when an account is required.
-- Reversible: drop the column and restore the previous bodies of the functions below.
alter table public.cuentas_dinero add column if not exists solo_depositos boolean not null default false;

create or replace function private.cuenta_json(c public.cuentas_dinero) returns jsonb
language sql stable security definer set search_path to '' as $function$
 select jsonb_build_object('id',c.id,'nombre',c.nombre,'tipo',c.tipo,'banco',c.banco,'numero',c.numero,'titular',c.titular,
  'tipo_cuenta',c.tipo_cuenta,'llave',c.llave,'solo_depositos',c.solo_depositos,
  'sede_id',c.sede_id,'sede',(select nombre from public.sedes where id=c.sede_id),'activo',c.activo,'orden',c.orden);
$function$;

-- A cash movement cannot go to the deposits account; a transfer with no account goes to the only operating bank account of its store.
create or replace function private.caja_cuenta_movimiento() returns trigger
language plpgsql security definer set search_path to '' as $function$
declare k public.cuentas_dinero;
begin
 if new.medio='Efectivo' then
  if new.cuenta_id is null or not exists(select 1 from public.cuentas_dinero where id=new.cuenta_id and tipo='efectivo' and sede_id=new.sede_id) then
   select id into new.cuenta_id from public.cuentas_dinero where sede_id=new.sede_id and tipo='efectivo' and activo order by created_at limit 1;
  end if;
 elsif new.cuenta_id is not null then
  select * into k from public.cuentas_dinero where id=new.cuenta_id;
  if k.id is null or k.tipo='efectivo' or (k.sede_id is not null and k.sede_id<>new.sede_id) then
   raise exception 'La cuenta elegida no corresponde a un pago por %.', lower(new.medio);
  end if;
  if k.solo_depositos and (tg_op='INSERT' or new.cuenta_id is distinct from old.cuenta_id) then raise exception 'La cuenta % es solo para depósitos en garantía.', k.nombre; end if;
  if tg_op='INSERT' and not k.activo then raise exception 'La cuenta % está inactiva.', k.nombre; end if;
 elsif new.medio='Transferencia' and (select count(*) from public.cuentas_dinero where sede_id=new.sede_id and tipo='banco' and activo and not solo_depositos)=1 then
  select id into new.cuenta_id from public.cuentas_dinero where sede_id=new.sede_id and tipo='banco' and activo and not solo_depositos;
 end if;
 return new;
end $function$;

-- Same body as before; the «choose the account» rule ignores deposit accounts.
create or replace function private.registrar_movimiento_caja(p_datos jsonb) returns uuid
language plpgsql security definer set search_path to '' as $function$
declare u public.profiles; s uuid:=(p_datos->>'sede_id')::uuid; f date:=(p_datos->>'fecha')::date; t text:=p_datos->>'tipo';
 med text:=p_datos->>'medio'; v numeric:=(p_datos->>'valor')::numeric; cat text:=btrim(coalesce(p_datos->>'categoria',''));
 desc_ text:=btrim(coalesce(p_datos->>'descripcion','')); ori text:=nullif(p_datos->>'origen',''); ori_id uuid:=nullif(p_datos->>'origen_id','')::uuid;
 cid uuid:=nullif(p_datos->>'contrato_id','')::uuid; path text:=nullif(btrim(coalesce(p_datos->>'comprobante_path','')),''); new_id uuid;
 cta uuid:=nullif(p_datos->>'cuenta_id','')::uuid; ini date;
begin
 u:=private.caja_perfil();
 if u.id is null or s is null or not private.caja_operar(s) then raise exception 'No puedes registrar movimientos en la caja de esta sede.' using errcode='42501'; end if;
 if f is null or f>private.caja_hoy() or f<private.caja_hoy()-31 then raise exception 'La fecha debe ser de hoy o de los últimos 31 días.'; end if;
 ini:=private.caja_inicio(s);
 if ini is not null and f<ini then raise exception 'La caja de esta sede empieza el %: no se registran movimientos anteriores.', to_char(ini,'DD/MM/YYYY'); end if;
 if private.caja_dia_cerrado(s,f) then raise exception 'La caja de ese día ya está cerrada.'; end if;
 if t not in ('ingreso','egreso') or med not in ('Efectivo','Transferencia','Tarjeta','Otro') or v is null or v<=0 or v<>round(v,2) or v>=1000000000000 or length(cat) not between 2 and 60 or length(desc_)>500 then raise exception 'Revisa el tipo, el medio, la categoría y el valor.'; end if;
 if cat='Base de caja' and (t<>'ingreso' or med<>'Efectivo' or ori is not null) then raise exception 'La base de caja es un ingreso en efectivo.'; end if;
 if ori in ('deposito','devolucion') then raise exception 'Los depósitos en garantía se llevan aparte en Depósitos; no entran a la caja.'; end if;
 if t='egreso' and length(desc_)<3 then raise exception 'Describe el egreso.'; end if;
 if path is not null and (split_part(path,'/',1)<>s::text or not exists(select 1 from storage.objects where bucket_id='comprobantes_caja' and name=path)) then raise exception 'El comprobante no es válido para esta sede.'; end if;
 if t='egreso' and path is null then raise exception 'Adjunta el comprobante del egreso.'; end if;
 if cid is not null and not exists(select 1 from public.contratos where id=cid and sede_id=s) then raise exception 'El contrato no pertenece a esta sede.'; end if;
 if med in ('Transferencia','Tarjeta') and cta is null and exists(select 1 from public.cuentas_dinero where activo and tipo<>'efectivo' and not solo_depositos and (sede_id is null or sede_id=s)) then
  raise exception 'Elige la cuenta o banco donde llegó el dinero.';
 end if;
 if ori is not null then
  if ori='pago' and not exists(select 1 from public.pagos p join public.contratos c on c.id=p.contrato_id where p.id=ori_id and c.sede_id=s) then raise exception 'Pago no encontrado en esta sede.'; end if;
 end if;
 begin
  insert into public.caja_movimientos(sede_id,fecha,tipo,categoria,medio,valor,descripcion,contrato_id,origen,origen_id,comprobante_path,usuario_id,cuenta_id)
  values(s,f,t,cat,med,v,desc_,cid,ori,ori_id,path,u.id,case when med='Efectivo' then null else cta end) returning id into new_id;
 exception when unique_violation then raise exception 'Ese movimiento del ERP ya está en la caja.';
 end;
 return new_id;
end $function$;

-- Expenses: same rule.
create or replace function public.gastos_registrar(p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_sede uuid:=nullif(p->>'sede_id','')::uuid; v_clase text:=coalesce(nullif(p->>'clase',''),'gasto');
 v_cat text:=btrim(coalesce(p->>'categoria','')); v_fecha date:=(p->>'fecha')::date; v_valor numeric:=(p->>'valor')::numeric;
 v_medio text:=p->>'medio'; v_cuenta uuid:=nullif(p->>'cuenta_id','')::uuid; v_benef text:=nullif(btrim(coalesce(p->>'beneficiario','')),'');
 v_desc text:=btrim(coalesce(p->>'descripcion','')); v_path text:=nullif(btrim(coalesce(p->>'comprobante_path','')),'');
 v_caja uuid; v_id uuid; v_mov uuid; k public.cuentas_dinero;
begin
 if not private.gastos_ver(v_sede) then raise exception 'No puedes registrar gastos de esta sede.' using errcode='42501'; end if;
 if v_clase not in ('gasto','retiro_utilidades') then raise exception 'Clase de gasto no válida.'; end if;
 if v_clase='retiro_utilidades' and not private.es_finanzas() then raise exception 'Los retiros de utilidades los registra administración.' using errcode='42501'; end if;
 if v_clase='retiro_utilidades' then v_cat:='Retiro de utilidades'; end if;
 if length(v_cat) not between 2 and 60 then raise exception 'Elige la categoría.'; end if;
 if v_fecha is null or v_fecha>(now() at time zone 'America/Bogota')::date then raise exception 'Revisa la fecha.'; end if;
 if v_valor is null or v_valor<=0 or v_valor<>round(v_valor,2) then raise exception 'Revisa el valor.'; end if;
 if v_medio not in ('Efectivo','Transferencia','Tarjeta','Otro') then raise exception 'Elige el medio de pago.'; end if;
 if length(v_desc)<3 then raise exception 'Describe el gasto.'; end if;
 if v_medio='Efectivo' then
  v_cuenta:=null;
  if v_sede is null then raise exception 'Un gasto en efectivo sale de la caja menor de una sede: elige la sede.'; end if;
 elsif v_cuenta is not null then
  select * into k from public.cuentas_dinero where id=v_cuenta;
  if k.id is null or k.tipo='efectivo' then raise exception 'Elige la cuenta de donde salió el dinero.'; end if;
  if k.solo_depositos then raise exception 'La cuenta % es solo para depósitos en garantía.', k.nombre; end if;
 elsif exists(select 1 from public.cuentas_dinero where activo and tipo<>'efectivo' and not solo_depositos and (sede_id is null or sede_id=v_sede or v_sede is null)) then
  raise exception 'Elige la cuenta de donde salió el dinero.';
 end if;
 v_caja:=private.gastos_sede_caja(v_sede,v_cuenta,v_medio);
 if v_path is null or split_part(v_path,'/',1)<>coalesce(v_caja::text,'administracion')
  or not exists(select 1 from storage.objects where bucket_id='comprobantes_caja' and name=v_path) then raise exception 'Adjunta el comprobante del gasto.'; end if;
 insert into public.gastos(sede_id,clase,categoria,fecha,valor,medio,cuenta_id,beneficiario,descripcion,comprobante_path,registrado_por)
 values(v_sede,v_clase,v_cat,v_fecha,v_valor,v_medio,v_cuenta,v_benef,v_desc,v_path,auth.uid()) returning id into v_id;
 if v_caja is not null then
  v_mov:=private.registrar_movimiento_caja(jsonb_build_object('sede_id',v_caja,'fecha',v_fecha,'tipo','egreso','categoria',v_cat,'medio',v_medio,'valor',v_valor,
   'descripcion',left(concat_ws(' · ',v_desc,v_benef,case when v_sede is null then 'Gasto de administración' when v_sede<>v_caja then 'Gasto de '||(select nombre from public.sedes where id=v_sede) end),500),
   'origen','gasto','origen_id',v_id,'comprobante_path',v_path,'cuenta_id',v_cuenta));
  update public.gastos set caja_movimiento_id=v_mov where id=v_id;
 end if;
 return v_id;
end $$;


-- Saving an account: the deposit flag is saved too.
create or replace function private.guardar_cuenta_dinero(p_datos jsonb) returns uuid
language plpgsql security definer set search_path to '' as $function$
declare u public.profiles; v_id uuid:=nullif(p_datos->>'id','')::uuid; v_tipo text:=p_datos->>'tipo';
 v_nombre text:=btrim(coalesce(p_datos->>'nombre','')); v_banco text:=nullif(btrim(coalesce(p_datos->>'banco','')),'');
 v_numero text:=nullif(btrim(coalesce(p_datos->>'numero','')),''); v_titular text:=nullif(btrim(coalesce(p_datos->>'titular','')),'');
 v_tipo_cuenta text:=nullif(btrim(coalesce(p_datos->>'tipo_cuenta','')),''); v_dep boolean:=coalesce((p_datos->>'solo_depositos')::boolean,false); v_llave text:=nullif(btrim(coalesce(p_datos->>'llave','')),'');
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
 if v_tipo='efectivo' then v_llave:=null; v_dep:=false; end if;
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
   insert into public.cuentas_dinero(nombre,tipo,banco,numero,titular,tipo_cuenta,llave,solo_depositos,sede_id,activo,orden,creado_por)
   values(v_nombre,v_tipo,v_banco,v_numero,v_titular,v_tipo_cuenta,v_llave,v_dep,v_sede,v_activo,v_orden,u.id) returning id into v_id;
  else
   update public.cuentas_dinero set nombre=v_nombre,tipo=v_tipo,banco=v_banco,numero=v_numero,titular=v_titular,tipo_cuenta=v_tipo_cuenta,llave=v_llave,solo_depositos=v_dep,sede_id=v_sede,activo=v_activo,orden=v_orden,updated_at=now() where id=v_id;
  end if;
 exception when unique_violation then raise exception 'Esa sede ya tiene una caja menor activa.';
 end;
 return v_id;
end $function$;

-- Mark the account where guarantee deposits enter and are returned from (Bancolombia ending 0560, all stores).
update public.cuentas_dinero set solo_depositos=true, updated_at=now() where tipo='banco' and sede_id is null and numero like '%0560' and not solo_depositos;
