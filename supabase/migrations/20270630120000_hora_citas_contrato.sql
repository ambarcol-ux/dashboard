-- Measurement and final-fitting appointments of a contract keep their time (chosen with a time picker), and the WhatsApp AI
-- receives those appointments (date, time and state) so it can tell the customer when they are.
-- Reversible: the columns can stay; re-run the previous definitions of the two patched functions.
alter table public.contratos add column if not exists hora_cita_medidas time, add column if not exists hora_prueba_final time;

do $mig$
declare d text; a text;
begin
 d:=pg_get_functiondef('public.editar_contrato_completo_admin'::regproc);
 if position('hora_cita_medidas' in d)=0 then
  a:='    fecha_prueba_final = case when p_datos ? ''fecha_prueba_final'' then nullif(p_datos->>''fecha_prueba_final'','''')::date else c.fecha_prueba_final end,';
  if position(a in d)=0 then raise exception 'editar_contrato_completo_admin: punto no encontrado'; end if;
  d:=replace(d,a,a||'
    hora_cita_medidas = case when p_datos ? ''hora_cita_medidas'' then nullif(p_datos->>''hora_cita_medidas'','''')::time else c.hora_cita_medidas end,
    hora_prueba_final = case when p_datos ? ''hora_prueba_final'' then nullif(p_datos->>''hora_prueba_final'','''')::time else c.hora_prueba_final end,');
  execute d;
 end if;
 d:=pg_get_functiondef('private.whatsapp_contexto'::regproc);
 if position('hora_cita_medidas' in d)=0 then
  a:='c.entregado_evento,c.fecha_entrega_evento,';
  if position(a in d)=0 then raise exception 'whatsapp_contexto: punto no encontrado'; end if;
  d:=replace(d,a,a||'c.fecha_cita_medidas,to_char(c.hora_cita_medidas,''HH24:MI'') hora_cita_medidas,c.estado_medidas,c.fecha_prueba_final,to_char(c.hora_prueba_final,''HH24:MI'') hora_prueba_final,c.estado_prueba_final,');
  execute d;
 end if;
end $mig$;
