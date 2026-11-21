-- «permission denied for function cerrar_caja_billetes»: the public wrapper (security invoker) calls the 5-argument private function,
-- which was created without execute for the app's users. The private function checks its own permissions (security definer).
-- Reversible: revoke execute on function private.cerrar_caja_billetes(uuid,date,jsonb,text,text) from authenticated.
grant execute on function private.cerrar_caja_billetes(uuid,date,jsonb,text,text) to authenticated;
