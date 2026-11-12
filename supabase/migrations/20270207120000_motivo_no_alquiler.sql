-- Motivo obligatorio al registrar «No alquiló» (resultado de la cita y vitrina «En seguimiento»/«No cerró»), para medir por qué se pierden ventas.
-- Reversión: drop function public.registrar_motivo_no_alquiler(uuid,text);
create or replace function public.registrar_motivo_no_alquiler(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 if p_motivo not in ('Precio','No encontré vestido','Visitaré otras tiendas','Debo consultarlo','Fecha del evento','Talla / diseño / ajuste','Otro') then raise exception 'Elige el motivo por el que no alquiló.'; end if;
 select * into c from public.primeras_citas where id=p_id for update;
 if c.id is null or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'No tienes acceso a esta visita.' using errcode='42501'; end if;
 update public.primeras_citas set motivo_no_alquiler=p_motivo,updated_at=clock_timestamp() where id=p_id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(p_id,auth.uid(),'Motivo de no alquiler',p_motivo);
end $$;
revoke all on function public.registrar_motivo_no_alquiler(uuid,text) from public, anon;
grant execute on function public.registrar_motivo_no_alquiler(uuid,text) to authenticated;
