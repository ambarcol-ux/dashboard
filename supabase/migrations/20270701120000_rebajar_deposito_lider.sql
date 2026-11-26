-- Lowering the agreed deposit of a contract is an exceptional authorization: only administration, the store leader of that
-- contract's store, or the franquiciado of a store whose accounting he approves (Pereira). Raising it stays as before.
-- Reversible: re-run the previous definitions of the two patched functions.
create or replace function private.puede_rebajar_deposito(p_sede uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.es_admin() or (p_sede is not null and p_sede=any(coalesce(private.sedes_usuario(auth.uid()),'{}')) and (
  'asesora_lider'=any(coalesce(private.roles_usuario(auth.uid()),'{}'))
  or ('franquiciado'=any(coalesce(private.roles_usuario(auth.uid()),'{}')) and exists(select 1 from public.sedes s where s.id=p_sede and s.contabilidad_franquiciado))));
$$;
revoke all on function private.puede_rebajar_deposito(uuid) from public,anon;

do $mig$
declare d text; a text;
 chk text:=' raise exception ''Bajar el depósito pactado solo lo autoriza la asesora líder de la sede, el franquiciado que aprueba lo contable o administración.'' using errcode=''42501''; end if;';
begin
 d:=pg_get_functiondef('private.editar_monto_deposito'::regproc);
 if position('puede_rebajar_deposito' in d)=0 then
  a:=' if not found then raise exception ''Contrato no encontrado.''; end if;';
  if position(a in d)=0 then raise exception 'editar_monto_deposito: punto no encontrado'; end if;
  d:=replace(d,a,a||'
 if p_monto<coalesce(anterior,0) and not private.puede_rebajar_deposito(sede) then'||chk);
  execute d;
 end if;
 d:=pg_get_functiondef('private.corregir_valores_iniciales_contrato'::regproc);
 if position('puede_rebajar_deposito' in d)=0 then
  a:='  perform private.puede_corregir(c.sede_id,null);
  if p_deposito<private.deposito_pagado(p_contrato)';
  if position(a in d)=0 then raise exception 'corregir_valores_iniciales_contrato: punto no encontrado'; end if;
  d:=replace(d,a,'  if p_deposito<coalesce(c.valor_deposito,0) and not private.puede_rebajar_deposito(c.sede_id) then'||chk||'
'||a);
  execute d;
 end if;
end $mig$;
