-- Paid drafts are real contracts. Before, a draft older than 3 days was annulled on its next update and its dresses freed, even
-- when the family had already paid (10 paid contracts ended «anulado» and their dresses «Disponible»).
--  · public.fn_manejar_expiracion_borradores: only annuls drafts without anticipo and without payments; frees dresses only on the
--    change to «anulado».
--  · public.disponibilidad_contratos_vestido: also returns whether the contract has money (anticipo 1/0), so a paid draft blocks the
--    dress in the Agenda de vestidos (lib/availability.ts).
-- Data (approved by administration, 19/11/2026): the 10 paid contracts went back to «borrador» with a line in
-- historial_cambios_contrato, and their dresses back to «Reservado» (CD414B «EN EVENTO»).
-- Reversible: restore both functions from their previous definitions.

create or replace function public.fn_manejar_expiracion_borradores()
 returns trigger language plpgsql as $function$
begin
 -- A draft older than 3 days is annulled only when it has no money: no anticipo and no payment that is not annulled.
 if new.estado='borrador' and new.created_at<now()-interval '3 days' and coalesce(new.anticipo,0)<=0
    and not exists(select 1 from public.pagos p where p.contrato_id=new.id and p.anulado_at is null) then
  new.estado:='anulado';
 end if;
 if new.estado='anulado' and (tg_op='INSERT' or old.estado is distinct from 'anulado') then
  update public.vestidos set estado='Disponible' where id in (select vestido_id from public.contrato_items_vestidos where contrato_id=new.id);
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.disponibilidad_contratos_vestido(p_vestido uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare v public.vestidos; sl uuid[]; propia boolean;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 if not (public.es_admin() or private.tiene_permiso('panel.disponibilidad')) then raise exception 'Sin acceso a la Agenda de vestidos.' using errcode='42501'; end if;
 select * into v from public.vestidos where id=p_vestido;
 if not found then return '[]'::jsonb; end if;
 sl:=private.sedes_limitadas();
 propia:=sl is null or v.sede_actual_id=any(sl) or v.sede_principal_id=any(sl);
 if not propia and not private.permiso_todas_sedes('panel.disponibilidad') then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'numero_contrato',c.numero_contrato,'cliente_nombre',case when propia then c.cliente_nombre end,
   'fecha_evento',c.fecha_evento,'tipo_evento',c.tipo_evento,'tipo_entrega',c.tipo_entrega,'estado',c.estado,'anticipo',case when coalesce(c.anticipo,0)>0 then 1 else 0 end,'fecha_entrega_envio',c.fecha_entrega_envio,
   'fecha_pre_xv',c.fecha_pre_xv,'fechas_bloqueo_especial',c.fechas_bloqueo_especial,'fecha_disponibilidad_real',c.fecha_disponibilidad_real,
   'bloqueo_especial_fecha',case when c.bloqueo_especial_vestido_id=p_vestido then c.bloqueo_especial_fecha end,'bloqueo_especial_vestido_id',c.bloqueo_especial_vestido_id,
   'valor_total',case when propia then c.valor_total end,'created_at',c.created_at))
  from public.contratos c
  where c.vestido_id=p_vestido or c.bloqueo_especial_vestido_id=p_vestido
   or exists(select 1 from public.contrato_items_vestidos i where i.contrato_id=c.id and i.vestido_id=p_vestido)),'[]'::jsonb);
end $function$;
