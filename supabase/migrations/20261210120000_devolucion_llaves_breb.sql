-- Depósitos: la devolución por transferencia acepta llaves Bre-B (celular, cédula, correo, alfanumérica con @, código de comercio)
-- además de cuentas de ahorros y corrientes. Cada llave se valida según su tipo (mismas reglas que lib/deposit-requests.ts).
-- Solo cambia la validación de private.editar_datos_devolucion; gestionar_deposito no valida el formato y no se toca.
-- Revert: re-apply private.editar_datos_devolucion from 20261106120000_devolucion_datos_lider.sql.
do $do$ declare d text:=pg_get_functiondef('private.editar_datos_devolucion(jsonb)'::regprocedure); a text; b text; begin
 a:=$a$  if v_tipo_cuenta not in ('Ahorros','Corriente') then raise exception 'El tipo de cuenta debe ser Ahorros o Corriente.'; end if;
  if v_cuenta !~ '^[0-9][0-9 -]{3,29}$' then raise exception 'El número de cuenta solo lleva números (y guiones).'; end if;$a$;
 b:=$b$  if v_tipo_cuenta not in ('Ahorros','Corriente','Llave: celular','Llave: cédula','Llave: correo','Llave: alfanumérica (@)','Llave: código de comercio') then raise exception 'Elige un tipo de cuenta (Ahorros o Corriente) o un tipo de llave.'; end if;
  if v_cuenta !~ (case v_tipo_cuenta when 'Llave: celular' then '^3[0-9]{9}$' when 'Llave: cédula' then '^[0-9]{5,15}$'
   when 'Llave: correo' then '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' when 'Llave: alfanumérica (@)' then '^@?[A-Za-z0-9._-]{3,30}$'
   when 'Llave: código de comercio' then '^[A-Za-z0-9]{3,20}$' else '^[0-9][0-9 -]{3,29}$' end) then
   if v_tipo_cuenta like 'Llave:%' then raise exception 'Revisa la llave: no corresponde al tipo elegido.'; end if;
   raise exception 'El número de cuenta solo lleva números (y guiones).'; end if;$b$;
 if position('Llave: celular' in d)=0 then
  if position(a in d)=0 then raise exception 'No se encontró la validación esperada en editar_datos_devolucion.'; end if;
  execute replace(d,a,b);
 end if;
end $do$;
