-- Asesora líder may correct initial payment/deposit (own sede) until the caja is closed; also applies to drafts.
-- Revert: re-apply 20261109120000 and delete the permiso row.
insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden) values
 ('contratos.corregir_valores_iniciales','Contratos','Corregir abono inicial y depósito','Corrige el pago inicial existente; pide motivo; bloqueado con caja cerrada',false,96)
on conflict (codigo) do nothing;
insert into public.roles_permisos(rol_id,permiso) select r,'contratos.corregir_valores_iniciales' from unnest(array['admin','asesora_lider']) r on conflict do nothing;
do $$ declare d text:=pg_get_functiondef('private.corregir_valores_iniciales_contrato(uuid,numeric,numeric,text)'::regprocedure); begin
 d:=replace(d,$a$ if not public.es_admin() then raise exception 'Solo el propietario/administrador puede corregir estos valores.' using errcode='42501'; end if;$a$,
  $b$ if not (public.es_admin() or (private.tiene_permiso('contratos.corregir_valores_iniciales') and exists(select 1 from public.contratos x join public.profiles u on u.id=auth.uid() and coalesce(u.activo,true) where x.id=p_contrato and x.sede_id is not distinct from coalesce(private.sede_operativa_limitada(),u.sede_id)))) then raise exception 'No tienes permiso para corregir estos valores.' using errcode='42501'; end if;$b$);
 d:=replace(d,$a$ if lower(coalesce(c.estado,'')) in ('borrador','pendiente_admin') then raise exception 'Solo aplica a contratos pactados.'; end if;$a$,'');
 if d not like '%corregir_valores_iniciales''%' then raise exception 'patch failed'; end if;
 execute d;
end $$;
