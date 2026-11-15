-- Anuncios fase 2: pausar, activar y ajustar el presupuesto diario de campañas y conjuntos de Meta desde el ERP (solo administración).
-- Topes en Configuración (config_parametros, módulo anuncios). Cada cambio queda en public.config_historial (tabla 'meta_anuncios').
-- Reversión: drop function public.anuncios_registrar(text,text,jsonb,jsonb);
--   delete from public.config_parametros where clave in ('anuncios_tope_diario','anuncios_cambio_max_pct');
insert into public.config_parametros(clave,modulo,etiqueta,tipo,valor,minimo,maximo,orden,ayuda) values
 ('anuncios_tope_diario','anuncios','Presupuesto diario máximo por campaña o conjunto (COP)','entero','100000',5000,5000000,10,'Desde el ERP no se puede poner un presupuesto diario mayor a este valor.'),
 ('anuncios_cambio_max_pct','anuncios','Cambio máximo de presupuesto por ajuste (%)','entero','50',10,300,20,'Cuánto puede subir o bajar el presupuesto en un solo ajuste.')
on conflict (clave) do nothing;

-- Registers an ad change made from the ERP in the shared history (Configuración › Historial y auditoría).
create or replace function public.anuncios_registrar(p_id text,p_accion text,p_antes jsonb,p_despues jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administración.' using errcode='42501'; end if;
 insert into public.config_historial(tabla,clave,accion,antes,despues) values('meta_anuncios',left(p_id,64),left(p_accion,20),p_antes,p_despues);
end $$;
revoke all on function public.anuncios_registrar(text,text,jsonb,jsonb) from public, anon;
grant execute on function public.anuncios_registrar(text,text,jsonb,jsonb) to authenticated;
