-- Este script actualiza el job de pg_cron que mueve los contratos en borrador a 'anulado' en lugar de 'finalizado'
-- y libera el inventario marcando los vestidos como 'Disponible'.

-- 1. Buscamos y eliminamos el job anterior si se llamaba de alguna forma estándar
-- (Si el job no se llamaba así, puedes modificar la consulta pg_cron directamente en tu panel)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM cron.job WHERE command ILIKE '%estado = ''finalizado''%' AND command ILIKE '%borrador%'
    ) THEN
        -- Desactivamos el cron antiguo (requiere permisos de postgres)
        -- Puedes borrarlo manualmente desde la interfaz de Supabase si prefieres
        DELETE FROM cron.job WHERE command ILIKE '%estado = ''finalizado''%' AND command ILIKE '%borrador%';
    END IF;
END $$;

-- 2. Creamos el nuevo job de cron (se ejecuta cada medianoche)
-- Reemplaza 'limpieza_borradores' con el nombre original de tu cron si lo recuerdas
SELECT cron.schedule(
    'limpieza_borradores', -- Nombre del Cron
    '0 0 * * *',           -- Todos los días a medianoche
    $$
    WITH contratos_vencidos AS (
        -- Seleccionamos los borradores de más de 3 días
        SELECT id
        FROM contratos
        WHERE estado = 'borrador' 
          AND created_at < NOW() - INTERVAL '3 days'
    ),
    actualizacion_contratos AS (
        -- Pasamos los contratos a 'anulado'
        UPDATE contratos
        SET estado = 'anulado'
        WHERE id IN (SELECT id FROM contratos_vencidos)
        RETURNING id
    )
    -- Liberamos los vestidos asociados a esos contratos
    UPDATE vestidos
    SET estado = 'Disponible'
    WHERE id IN (
        SELECT vestido_id 
        FROM contrato_items_vestidos 
        WHERE contrato_id IN (SELECT id FROM actualizacion_contratos)
    );
    $$
);
