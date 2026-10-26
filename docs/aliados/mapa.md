# Mapa del módulo Aliados directos
1. Archivos/tablas/pantallas: `app/dashboard/aliados-directos/page.tsx`, `lib/direct-allies.ts`, `app/aliado-contrato/page.tsx`, `app/api/aliados/contrato/*`, `lib/ally-contract*.ts`, `components/AllyContractAdmin.tsx`; tablas `aliados`, `tipos_aliado`, `aliados_cambios_cuenta`, `contratos_aliado`, `historial_aliado` (`lineas_aliado`, `pagos_aliado` solo histórico); migraciones `supabase/migrations/20261022120000_aliados_directos.sql`, `20261031120000_aliados_sin_comisiones.sql`.
2. Firma del contrato de arrendamiento: `app/firma/[id]/page.tsx` (firma del aliado: `app/aliado-contrato/page.tsx`).
3. Bloqueos de disponibilidad: `lib/availability.ts`, `lib/contract-calendar.ts`, `app/api/contratos/calendario/route.ts`.
4. Correos: Resend en `lib/ally-emails.ts` y `app/api/primeras-citas/procesar/route.ts`; enlace de citas `app/agendar-primera-cita/page.tsx`.
5. Ficha de medidas de tienda: sección de medidas en `app/contratos/nuevo/page.tsx` / `components/ContractTemplate.tsx`.
6. Tareas programadas: pg_cron en `supabase/migrations/20261013230000_primeras_citas_reloj_envios.sql`, `20261021150000_metas_automaticas_sede.sql`, `20260528_fix_3_day_rule.sql`.
