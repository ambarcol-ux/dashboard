-- Inventario: datos obligatorios y unificados. Vestido nuevo: todo obligatorio y código único en todo el inventario.
-- Vestido existente: solo se valida el campo que cambia (los cambios de estado, traslados y contratos siguen igual).
create or replace function private.vestidos_validar_datos() returns trigger language plpgsql set search_path='' as $$
declare nuevo boolean:=tg_op='INSERT';
begin
 if nuevo or new.codigo is distinct from old.codigo then
  new.codigo:=upper(btrim(new.codigo));
  if new.codigo !~ '^[A-Z0-9][A-Z0-9-]{1,19}$' then raise exception 'El código solo lleva letras, números y guiones, sin espacios ni descripción (máx. 20).'; end if;
  if exists(select 1 from public.vestidos x where upper(btrim(x.codigo))=new.codigo and x.id<>new.id) then raise exception 'El código % ya existe en el inventario.',new.codigo; end if;
 end if;
 if (nuevo or new.nombre is distinct from old.nombre) and length(btrim(coalesce(new.nombre,'')))<3 then raise exception 'Escribe el nombre o descripción del vestido.'; end if;
 if (nuevo or new.clasificacion_id is distinct from old.clasificacion_id) and new.clasificacion_id is null then raise exception 'La clasificación es obligatoria.'; end if;
 if nuevo or new.talla is distinct from old.talla then
  new.talla:=upper(btrim(coalesce(new.talla,'')));
  if new.talla='' then raise exception 'La talla es obligatoria.'; end if;
 end if;
 if nuevo or new.color is distinct from old.color then
  new.color:=upper(btrim(coalesce(new.color,'')));
  if new.color='' then raise exception 'El color es obligatorio.'; end if;
 end if;
 if (nuevo or new.precio_sugerido is distinct from old.precio_sugerido) and coalesce(new.precio_sugerido,0)<=0 then raise exception 'El precio de alquiler es obligatorio.'; end if;
 if (nuevo or new.sede_actual_id is distinct from old.sede_actual_id) and not exists(select 1 from public.sedes s where s.id=new.sede_actual_id) then raise exception 'Elige una sede válida.'; end if;
 if (nuevo or new.sede_principal_id is distinct from old.sede_principal_id) and not exists(select 1 from public.sedes s where s.id=new.sede_principal_id) then raise exception 'Elige una sede base válida.'; end if;
 return new;
end $$;
create trigger vestidos_validar_datos before insert or update on public.vestidos for each row execute function private.vestidos_validar_datos();
