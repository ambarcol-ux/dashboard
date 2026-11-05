-- Editar contrato (admin): un correo vacío se guarda vacío (antes se convertía en null y fallaba «cliente_email violates not-null»);
-- un documento vacío conserva el anterior (también es obligatorio). 20 contratos no tienen correo y no se podían editar.
-- Reversión: volver a reemplazar las dos expresiones por nullif(btrim(p_datos->>'cliente_email'),'') y nullif(btrim(p_datos->>'cliente_documento'),'').
do $$
declare d text; antes text;
begin
 d:=pg_get_functiondef('public.editar_contrato_completo_admin'::regproc); antes:=d;
 d:=replace(d,$x$cliente_email = case when p_datos ? 'cliente_email' then nullif(btrim(p_datos->>'cliente_email'),'') else c.cliente_email end$x$,
  $x$cliente_email = case when p_datos ? 'cliente_email' then coalesce(btrim(p_datos->>'cliente_email'),'') else c.cliente_email end$x$);
 d:=replace(d,$x$cliente_documento = case when p_datos ? 'cliente_documento' then nullif(btrim(p_datos->>'cliente_documento'),'') else c.cliente_documento end$x$,
  $x$cliente_documento = case when p_datos ? 'cliente_documento' then coalesce(nullif(btrim(p_datos->>'cliente_documento'),''),c.cliente_documento) else c.cliente_documento end$x$);
 if position('coalesce(btrim(p_datos->>''cliente_email''),'''')' in d)=0 or position('coalesce(nullif(btrim(p_datos->>''cliente_documento''),''''),c.cliente_documento)' in d)=0 then
  raise exception 'editar_contrato_completo_admin: no se encontró el texto a reemplazar';
 end if;
 execute d;
end $$;
