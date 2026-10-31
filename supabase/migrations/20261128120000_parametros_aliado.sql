-- Aliado: descuento sobre el vestido y pago mínimo como parámetros editables en Configuración (solo administración).
-- Revert: remove the two config_parametros rows and re-apply the previous body of private.contrato_modo_aliado (fixed 50%).
insert into public.config_parametros(clave,modulo,etiqueta,tipo,valor,minimo,maximo,orden,ayuda) values
 ('aliado_descuento_pct','aliados','Aliado · descuento sobre el vestido (%)','entero','5',0,50,10,'Se aplica al valor del vestido en contratos en modo Aliado'),
 ('aliado_pago_minimo_pct','aliados','Aliado · pago mínimo para crear el contrato (%)','entero','50',0,100,20,'Abono mínimo sobre el total del contrato en modo Aliado')
on conflict do nothing;
do $$ declare d text:=pg_get_functiondef('private.contrato_modo_aliado()'::regprocedure); begin
 d:=replace(d,'raise exception ''En modo Aliado el pago mínimo para crear el contrato es el 50%% (%).'',round(coalesce(new.valor_total,0)*0.5);',
  'raise exception ''En modo Aliado el pago mínimo para crear el contrato es el % por ciento (%).'',private.cfg_int(''aliado_pago_minimo_pct'',50),round(coalesce(new.valor_total,0)*private.cfg_int(''aliado_pago_minimo_pct'',50)/100.0);');
 d:=replace(d,'coalesce(new.anticipo,0)<round(coalesce(new.valor_total,0)*0.5) then','coalesce(new.anticipo,0)<round(coalesce(new.valor_total,0)*private.cfg_int(''aliado_pago_minimo_pct'',50)/100.0) then');
 if d like '%*0.5)%' or d not like '%aliado_pago_minimo_pct%' then raise exception 'patch modo aliado failed'; end if;
 execute d;
end $$;
