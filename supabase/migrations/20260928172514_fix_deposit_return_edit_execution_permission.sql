-- Allow the public invoker wrapper to reach the existing guarded implementation.
-- Identity, active profile, role, contract access and closed-request checks remain in place.
GRANT EXECUTE ON FUNCTION private.editar_datos_devolucion(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
