-- Existing views must honor table RLS so Accounting cannot bypass its deposit-only access.
-- Existing non-accounting SELECT policies remain unchanged.
alter view public.kpi_vestidos_populares set (security_invoker=true);
alter view public.vista_historial_alquileres set (security_invoker=true);
