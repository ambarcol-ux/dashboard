-- Improve existing reads without changing data or authorization rules.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
CREATE INDEX IF NOT EXISTS arreglos_contrato_id_perf_idx ON public.arreglos (contrato_id);
CREATE INDEX IF NOT EXISTS contrato_items_vestidos_contrato_id_perf_idx ON public.contrato_items_vestidos (contrato_id);
CREATE INDEX IF NOT EXISTS contrato_items_vestidos_vestido_id_perf_idx ON public.contrato_items_vestidos (vestido_id);
CREATE INDEX IF NOT EXISTS entregas_bitacora_contrato_id_perf_idx ON public.entregas_bitacora (contrato_id);
CREATE INDEX IF NOT EXISTS pagos_contrato_id_perf_idx ON public.pagos (contrato_id);
ALTER POLICY "Permitir todo a usuarios autenticados" ON public."mantenimiento_bitacora" USING (((SELECT auth.role()) = 'authenticated'::text));
ALTER POLICY "prestamos_sedes_actualizar" ON public."prestamos_vestidos_sedes" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND COALESCE(p.activo, true) AND ((lower(p.rol) = 'admin'::text) OR (p.sede_id = ANY (ARRAY[prestamos_vestidos_sedes.sede_origen_id, prestamos_vestidos_sedes.sede_destino_id]))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND COALESCE(p.activo, true) AND ((lower(p.rol) = 'admin'::text) OR (p.sede_id = ANY (ARRAY[prestamos_vestidos_sedes.sede_origen_id, prestamos_vestidos_sedes.sede_destino_id])))))));
ALTER POLICY "prestamos_sedes_crear" ON public."prestamos_vestidos_sedes" WITH CHECK (((solicitado_por = (SELECT auth.uid())) AND (estado = 'solicitado'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND COALESCE(p.activo, true) AND ((lower(p.rol) = 'admin'::text) OR (p.sede_id = prestamos_vestidos_sedes.sede_destino_id)))))));
ALTER POLICY "prestamos_sedes_leer" ON public."prestamos_vestidos_sedes" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND COALESCE(p.activo, true) AND ((lower(p.rol) = 'admin'::text) OR (p.sede_id = ANY (ARRAY[prestamos_vestidos_sedes.sede_origen_id, prestamos_vestidos_sedes.sede_destino_id])))))));
ALTER POLICY "Usuarios pueden editar su propio perfil" ON public."profiles" USING (((SELECT auth.uid()) = id));
ALTER POLICY "cada quien ve su perfil" ON public."profiles" USING (((id = (SELECT auth.uid())) OR es_admin()));
