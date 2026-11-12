-- Corrige seguimientos_auto_tomar: sedes.nombre es varchar y la función declara text («structure of query does not match function
-- result type»); la tanda de las 10:05 a. m. del 12-nov no envió nada por esto. Reversión: no aplica (solo convierte el tipo).
do $do$
declare d text;
begin
 d:=pg_get_functiondef('private.seguimientos_auto_tomar(int)'::regprocedure);
 d:=replace(d,$x$coalesce(sd.nombre,'')$x$,$x$coalesce(sd.nombre,'')::text$x$);
 if position($x$coalesce(sd.nombre,'')::text$x$ in d)=0 then raise exception 'seguimientos_auto_tomar: texto no encontrado'; end if;
 execute d;
end $do$;
