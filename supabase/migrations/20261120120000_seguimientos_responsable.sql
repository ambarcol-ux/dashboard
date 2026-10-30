-- Seguimiento a cargo de la asesora que atendió (activa, vendedora, no admin/contabilidad); si no, la asesora líder de la sede.
-- Reasignación múltiple por admin y asesora líder, con historial.
-- Revert: re-apply the previous body of private.replanificar_seguimientos; remove the new functions.
create or replace function private.responsable_seguimiento(p_cita uuid) returns uuid language sql stable security definer set search_path='' as $$
 select coalesce(
  (select p.id from public.primeras_citas c join public.profiles p on p.id=c.asesora_id
   where c.id=p_cita and coalesce(p.activo,true) and coalesce(p.rol_id,'') not in ('admin','contabilidad')
    and exists(select 1 from public.asesoras a where a.profile_id=p.id and a.aparece_como_vendedora)),
  (select private.lider_de_sede(c.sede_id) from public.primeras_citas c where c.id=p_cita))
$$;

do $$ declare d text:=pg_get_functiondef('private.replanificar_seguimientos(uuid)'::regprocedure); begin
 d:=replace(d,'quien:=coalesce(c.asesora_id,c.responsable_id);','quien:=private.responsable_seguimiento(c.id);');
 if d not like '%responsable_seguimiento%' then raise exception 'patch replanificar failed'; end if;
 execute d;
end $$;

-- Open follow-ups take the rule now.
update public.primeras_citas_seguimientos s set asignado_a=private.responsable_seguimiento(s.cita_id),updated_at=clock_timestamp()
 where s.realizado_at is null and s.anulado_at is null and s.asignado_a is distinct from private.responsable_seguimiento(s.cita_id);

-- Active advisors of a sede that can receive follow-ups.
create or replace function public.asesoras_reasignables(p_sede uuid) returns table(id uuid,nombre text) language sql stable security definer set search_path='' as $$
 select p.id,coalesce(p.nombre,p.email) from public.profiles p join public.usuario_sedes us on us.usuario_id=p.id and us.activo and us.sede_id=p_sede
 where coalesce(p.activo,true) and p.rol_id in ('asesora','asesora_lider')
  and (public.es_admin() or (exists(select 1 from public.profiles q where q.id=auth.uid() and q.rol_id='asesora_lider') and p_sede=any(private.sedes_usuario(auth.uid()))))
 order by 2
$$;
create or replace function public.reasignar_seguimientos(p_citas uuid[],p_asesora uuid) returns int language plpgsql security definer set search_path='' as $$
declare c record; n int:=0; quien text;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 select coalesce(nombre,email) into quien from public.profiles where id=p_asesora;
 for c in select * from public.primeras_citas where id=any(p_citas) loop
  if not exists(select 1 from public.asesoras_reasignables(c.sede_id) x where x.id=p_asesora) then raise exception 'La asesora no está disponible para la sede de %.',c.cliente_nombre using errcode='42501'; end if;
  update public.primeras_citas_seguimientos set asignado_a=p_asesora,updated_at=clock_timestamp() where cita_id=c.id and realizado_at is null and anulado_at is null and asignado_a is distinct from p_asesora;
  if found then
   n:=n+1;
   insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,auth.uid(),'Seguimiento reasignado','Pasa a '||quien||'.');
  end if;
 end loop;
 return n;
end $$;
revoke all on function public.asesoras_reasignables(uuid),public.reasignar_seguimientos(uuid[],uuid) from public,anon;
grant execute on function public.asesoras_reasignables(uuid),public.reasignar_seguimientos(uuid[],uuid) to authenticated;
