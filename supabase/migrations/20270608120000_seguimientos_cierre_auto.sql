-- Seguimientos (Primeras visitas): every morning the ERP closes the follow-up plan of a visit still «EN SEGUIMIENTO» when
--  · the client's event date already passed → «Evento ya pasado» / EVENTO FINALIZADO, or
--  · the client (same phone) signed a contract after the visit → «Alquiló» / ALQUILÓ.
-- Reuses private.cerrar_plan and leaves a line in primeras_citas_historial. Runs once now for the pending ones.
-- Reversible: unschedule «seguimientos-cierre-auto» and remove private.seguimientos_cierre_auto.
create or replace function private.seguimientos_cierre_auto() returns integer
language plpgsql security definer set search_path='' as $$
declare x record; n int:=0; hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 for x in
  select c.id, (select k.numero_contrato from public.contratos k
    where right(regexp_replace(coalesce(k.cliente_whatsapp,''),'\D','','g'),10)=right(regexp_replace(coalesce(c.telefono,''),'\D','','g'),10)
     and length(regexp_replace(coalesce(c.telefono,''),'\D','','g'))>=10 and k.created_at>=c.created_at
     and lower(coalesce(k.estado,'')) not in ('cancelado','anulado','rechazado') order by k.created_at limit 1) contrato,
   c.fecha_evento
  from public.primeras_citas c
  where coalesce(c.resultado_comercial,'EN SEGUIMIENTO')='EN SEGUIMIENTO' and c.cierre_seguimiento is null
   and exists(select 1 from public.primeras_citas_seguimientos s where s.cita_id=c.id and s.realizado_at is null and s.anulado_at is null)
 loop
  if x.contrato is not null then
   perform private.cerrar_plan(x.id,'Alquiló','ALQUILÓ','No necesario','Ya tiene contrato '||x.contrato);
   insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(x.id,null,'Seguimiento cerrado automáticamente','La clienta ya tiene el contrato '||x.contrato||'.');
   n:=n+1;
  elsif x.fecha_evento is not null and x.fecha_evento<hoy then
   perform private.cerrar_plan(x.id,'Evento ya pasado','EVENTO FINALIZADO','No necesario','La fecha del evento ya pasó');
   insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(x.id,null,'Seguimiento cerrado automáticamente','La fecha del evento ('||to_char(x.fecha_evento,'DD/MM/YYYY')||') ya pasó.');
   n:=n+1;
  end if;
 end loop;
 return n;
end $$;
revoke all on function private.seguimientos_cierre_auto() from public, anon, authenticated;

select cron.schedule('seguimientos-cierre-auto','17 10 * * *','select private.seguimientos_cierre_auto()');
select private.seguimientos_cierre_auto();
