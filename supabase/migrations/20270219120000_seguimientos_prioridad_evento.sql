-- Seguimientos automáticos: primero las clientas con evento en los próximos 60 días (la más cercana primero); después el resto
-- por fecha programada, como antes. No cambia cuántos mensajes salen (40 por tanda) ni las reglas de quién los recibe.
-- Reversión: volver a «order by s.fecha,s.etapa limit greatest(1,least(p_limite,100))» con el mismo bloque DO.
do $do$
declare d text;
begin
 d:=pg_get_functiondef('private.seguimientos_auto_tomar(int)'::regprocedure);
 d:=replace(d,$x$order by s.fecha,s.etapa limit greatest(1,least(p_limite,100))$x$,
  $x$order by case when c.fecha_evento between hoy and hoy+60 then 0 else 1 end, case when c.fecha_evento between hoy and hoy+60 then c.fecha_evento end, s.fecha,s.etapa limit greatest(1,least(p_limite,100))$x$);
 if position('hoy+60 then c.fecha_evento end' in d)=0 then raise exception 'seguimientos_auto_tomar: texto no encontrado'; end if;
 execute d;
end $do$;
