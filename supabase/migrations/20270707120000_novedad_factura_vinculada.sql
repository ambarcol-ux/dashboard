-- «Contrato sin factura en Siigo» also counts the invoice made by hand in Siigo and linked to the contract (siigo_historico.contrato_id),
-- not only the invoices sent by the ERP. Reversible: remove the added condition in public.novedades_contables.
do $mig$
declare d text:=pg_get_functiondef('public.novedades_contables(uuid)'::regprocedure);
 a text:=$q$and k.created_at<now()-interval '1 hour'
  and not exists(select 1 from public.siigo_documentos d where d.contrato_id=k.id and d.tipo='factura' and d.estado in ('enviado','pendiente'))$q$;
begin
 if position('h.contrato_id=k.id and h.tipo=''factura'')' in d)>0 then return; end if;
 if (length(d)-length(replace(d,a,'')))/length(a)<>1 then raise exception 'novedades_contables: punto no encontrado'; end if;
 d:=replace(d,a,a||$q$
  and not exists(select 1 from public.siigo_historico h where h.contrato_id=k.id and h.tipo='factura')$q$);
 execute d;
end $mig$;
