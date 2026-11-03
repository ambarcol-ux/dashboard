-- Configuración › Formularios: obligatoriedad de la cuenta bancaria (o llave Bre-B) en cada pantalla donde se registra.
-- Arranca «Obligatorio» en todas; Administración puede pasar a «Opcional» las editables.
-- Devoluciones por transferencia y Aliados (registro y contrato) quedan «Bloqueado»: sin cuenta no se puede pagar.
-- Revert: delete from public.config_formularios where modulo='cuentas_bancarias';
insert into public.config_formularios(formulario,campo,modulo,etiqueta,estado,orden) values
 ('cuenta_contrato','cuenta','cuentas_bancarias','Contrato: cuenta para devolver el depósito (si hay depósito)','obligatorio',10),
 ('cuenta_proveedor','cuenta','cuentas_bancarias','Proveedores: ficha y portal del proveedor','obligatorio',20),
 ('cuenta_aliado_directo','cuenta','cuentas_bancarias','Aliados Directos: ficha','obligatorio',30),
 ('cuenta_caja','cuenta','cuentas_bancarias','Caja: número de las cuentas bancarias y billeteras de la empresa','obligatorio',40),
 ('cuenta_devolucion','cuenta','cuentas_bancarias','Depósitos: devolución por transferencia','bloqueado',50),
 ('cuenta_aliados','cuenta','cuentas_bancarias','Aliados: registro y firma del contrato','bloqueado',60)
on conflict (formulario,campo) do nothing;
