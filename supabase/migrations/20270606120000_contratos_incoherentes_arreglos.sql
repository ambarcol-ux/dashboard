-- Inicio › «Contratos con datos por revisar»: contracts.saldo is valor_total - anticipo (arreglos are not in it), so the overpaid and
-- «saldo no cuadra» rules now use the real balance valor_total + total_arreglos - anticipo. A contract whose arreglos are paid is no
-- longer flagged. No data changes. Reversible: re-apply alertas_inicio_sede from 20270605120000.
do $mig$
declare d text; a text; b text;
begin
 d:=pg_get_functiondef('private.alertas_inicio_sede(uuid)'::regprocedure);
 a:='when coalesce(c.saldo,0)<0 and coalesce(c.saldo,0)+coalesce(c.total_multas,0)<0 then';
 b:='when abs(coalesce(c.saldo,0)-(coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0)-coalesce(c.anticipo,0)))>1 and c.valor_total is not null then';
 if position(a in d)=0 or position(b in d)=0 then raise exception 'alertas_inicio_sede: punto'; end if;
 d:=replace(d,a,'when coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0)-coalesce(c.anticipo,0)<0 and coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0)-coalesce(c.anticipo,0)+coalesce(c.total_multas,0)<0 then');
 d:=replace(d,b,'when abs(coalesce(c.saldo,0)-(coalesce(c.valor_total,0)-coalesce(c.anticipo,0)))>1 and c.valor_total is not null then');
 execute d;
end $mig$;
