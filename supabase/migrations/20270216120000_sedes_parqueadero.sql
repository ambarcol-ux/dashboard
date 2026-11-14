-- Parqueadero aliado por sede: la IA de WhatsApp lo dice cuando preguntan, y va en la confirmación, el recordatorio de 2 horas
-- y el correo de las citas presenciales de esa sede. Solo Bogotá lo tiene (convenio con Parking 106).
-- Reversión: alter table public.sedes drop column parqueadero;
alter table public.sedes add column if not exists parqueadero text check (parqueadero is null or length(parqueadero)<=400);
update public.sedes set parqueadero='🚗 Parqueadero aliado (no es propio de Ámbar): Parking 106, Calle 106 #14B-46, https://maps.app.goo.gl/yfmFsBfsqdcdCnXd6. Para el descuento pide en Ámbar el sello en tu tiquete de parqueo: 1 hora $2.000 · 2 horas $3.000 · 3 horas $4.000.'
where lower(nombre) like 'bogot%' and parqueadero is null;
