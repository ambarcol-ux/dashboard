-- Seguimientos automáticos: un solo mensaje por celular. Un número con varias citas abiertas recibía un mensaje por cada cita en la
-- misma tanda, y la IA respondía con los datos de otra cita (otra sede). Ahora: una etapa por celular en cada tanda, 3 días entre
-- contactos por celular (no solo por cita), y el chat usa la cita del último mensaje automático enviado, con su sede y fecha.
-- Reversión: volver a aplicar private.seguimientos_auto_tomar y private.seguimiento_info_chat de 20270130120000 (+ 20270210120000).
do $do$
declare d text;
begin
 d:=pg_get_functiondef('private.seguimientos_auto_tomar(int)'::regprocedure);
 d:=replace(d,$x$and not exists(select 1 from public.primeras_citas_seguimientos z where z.cita_id=c.id and z.realizado_at>now()-interval '3 days')$x$,
  $x$and not exists(select 1 from public.primeras_citas_seguimientos z join public.primeras_citas cz on cz.id=z.cita_id
     where right(regexp_replace(coalesce(cz.telefono,''),'\D','','g'),10)=right(regexp_replace(c.telefono,'\D','','g'),10) and z.realizado_at>now()-interval '3 days')$x$);
 d:=replace(d,$x$order by s.fecha,s.etapa limit$x$,
  $x$and s.id=(select y.id from public.primeras_citas_seguimientos y join public.primeras_citas cy on cy.id=y.cita_id
     where y.realizado_at is null and y.anulado_at is null and y.fecha<=hoy and coalesce(cy.resultado_comercial,'EN SEGUIMIENTO')='EN SEGUIMIENTO'
      and cy.estado<>'cancelada' and not coalesce(cy.alquilo,false) and cy.cierre_seguimiento is null
      and right(regexp_replace(coalesce(cy.telefono,''),'\D','','g'),10)=right(regexp_replace(c.telefono,'\D','','g'),10)
      and y.etapa=(select min(w.etapa) from public.primeras_citas_seguimientos w where w.cita_id=cy.id and w.realizado_at is null and w.anulado_at is null)
     order by y.fecha,y.etapa,y.id limit 1)
  order by s.fecha,s.etapa limit$x$);
 if position('join public.primeras_citas cz' in d)=0 or position('order by y.fecha,y.etapa,y.id' in d)=0 then raise exception 'seguimientos_auto_tomar: texto no encontrado'; end if;
 execute d;

 d:=pg_get_functiondef('private.seguimiento_info_chat(text)'::regprocedure);
 d:=replace(d,$x$'fecha_evento',c.fecha_evento,$x$,$x$'fecha_evento',c.fecha_evento,'sede',(select sd.nombre from public.sedes sd where sd.id=c.sede_id)::text,'fecha_cita',c.fecha,$x$);
 d:=replace(d,$x$ order by c.fecha desc limit 1$x$,$x$ order by (select max(s.realizado_at) from public.primeras_citas_seguimientos s where s.cita_id=c.id and s.auto_at is not null) desc nulls last, c.fecha desc limit 1$x$);
 if position('''fecha_cita'',c.fecha' in d)=0 or position('desc nulls last' in d)=0 then raise exception 'seguimiento_info_chat: texto no encontrado'; end if;
 execute d;
end $do$;

-- The chat only receives the real no-rental reason, never the internal note of the visit.
do $do$
declare d text;
begin
 d:=pg_get_functiondef('private.seguimiento_info_chat(text)'::regprocedure);
 d:=replace(d,$x$'motivo_no_alquiler',coalesce(nullif(c.motivo_no_alquiler,''),c.motivo)$x$,$x$'motivo_no_alquiler',nullif(c.motivo_no_alquiler,'')$x$);
 if position($x$nullif(c.motivo_no_alquiler,''),'tipo_vestido'$x$ in d)=0 then raise exception 'seguimiento_info_chat: motivo no encontrado'; end if;
 execute d;
end $do$;
