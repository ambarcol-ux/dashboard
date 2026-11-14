-- Seguimientos automáticos: no se escribe a quien ya tiene un contrato vigente con el mismo celular, aunque el contrato no esté
-- enlazado a su primera cita (caso real: clienta con contrato pagado recibió el mensaje de seguimiento).
-- Reversión: volver a aplicar private.seguimientos_auto_tomar sin la condición «contrato por celular».
do $do$
declare d text;
begin
 d:=pg_get_functiondef('private.seguimientos_auto_tomar(int)'::regprocedure);
 d:=replace(d,$x$and (c.fecha_evento is null or c.fecha_evento>=hoy)$x$,
  $x$and (c.fecha_evento is null or c.fecha_evento>=hoy)
   and not exists(select 1 from public.contratos k where lower(coalesce(k.estado,'')) not in ('anulado','cancelado','borrador','rechazado')
     and k.created_at>=c.created_at-interval '30 days'
     and right(regexp_replace(coalesce(nullif(k.cliente_whatsapp,''),k.whatsapp,''),'\D','','g'),10)=right(regexp_replace(c.telefono,'\D','','g'),10))$x$);
 if position('contratos k where lower(coalesce(k.estado' in d)=0 then raise exception 'seguimientos_auto_tomar: texto no encontrado'; end if;
 execute d;
end $do$;
