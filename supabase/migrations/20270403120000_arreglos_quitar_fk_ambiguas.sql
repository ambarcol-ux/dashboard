-- The foreign keys added on mantenimiento_bitacora (arreglo_id, proveedor_id, registrado_por) gave the API two paths between
-- contratos and arreglos / proveedores / profiles, which makes embedded reads like contratos?select=arreglos(*) ambiguous.
-- The functions arreglo_guardar / arreglo_recibir already check those ids, so the constraints are not needed.
-- Reversible: add the three foreign keys back (and name the relationship in every embed, e.g. arreglos!arreglos_contrato_id_fkey).
alter table public.mantenimiento_bitacora drop constraint if exists mantenimiento_bitacora_arreglo_id_fkey;
alter table public.mantenimiento_bitacora drop constraint if exists mantenimiento_bitacora_registrado_por_fkey;
alter table public.mantenimiento_bitacora drop constraint if exists mantenimiento_bitacora_proveedor_id_fkey;
notify pgrst, 'reload schema';
