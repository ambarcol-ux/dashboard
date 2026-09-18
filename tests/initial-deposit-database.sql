begin;
do $$
declare c uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); sid uuid;
begin
 select id into sid from public.sedes limit 1;
 insert into auth.users(id,email) values(u,'receipt-regression@example.invalid');
 insert into public.profiles(id,email,nombre,rol,sede_id,activo) values(u,'receipt-regression@example.invalid','Prueba comprobante','asesora',sid,true) on conflict(id) do update set rol='asesora',sede_id=sid,activo=true;
 perform set_config('test.receipt.user',u::text,true);
 perform set_config('test.receipt.sede',sid::text,true);

 insert into storage.objects(bucket_id,name) values('comprobantes_depositos',c||'/receipt.png');
 perform set_config('test.receipt',jsonb_build_object('c',c)::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare c uuid:=(current_setting('test.receipt')::jsonb->>'c')::uuid; data jsonb;
begin
 insert into public.contratos(id,numero_factura,numero_contrato,cliente_nombre,cliente_documento,cliente_email,fecha_evento,valor_total,valor_deposito,sede_id,sede,estado) values(c,'FAC-TEST-RECEIPT','TEST-RECEIPT','Prueba temporal','TEST','test@example.invalid',current_date,0,300000,current_setting('test.receipt.sede')::uuid,'Prueba','entregado');
 if (select valor_deposito from public.contratos where id=c)<>300000 then raise exception 'Initial guarantee missing'; end if;
 data:=jsonb_build_object('id',gen_random_uuid(),'contrato_id',c,'monto',0,'metodo','Efectivo','comprobante_path',c||'/receipt.png');
 perform public.gestionar_deposito('soporte',data);
 if (select valor_deposito from public.contratos where id=c)<>300000 then raise exception 'Receipt changed deposit'; end if;
 if exists(select 1 from public.movimientos_depositos where contrato_id=c) then raise exception 'Receipt created financial movement'; end if;
 if (select monto from public.soportes_depositos_anteriores where contrato_id=c)<>300000 then raise exception 'Receipt did not cover original amount'; end if;
 begin
  perform public.gestionar_deposito('soporte',data);
 exception when unique_violation then null; end;
 if (select valor_deposito from public.contratos where id=c)<>300000 then raise exception 'Retry duplicated deposit'; end if;
 perform public.gestionar_deposito('ingreso',data||jsonb_build_object('id',gen_random_uuid(),'monto',50000,'fecha',(now() at time zone 'America/Bogota')::date));
 if (select valor_deposito from public.contratos where id=c)<>350000 then raise exception 'Additional money was not recorded'; end if;
end $$;
rollback;
select 'PASS: authenticated advisor creates initial deposit; receipt with zero additional amount preserves deposit, no financial movement, retry cannot duplicate, actual additional money still adds once.' as result;
