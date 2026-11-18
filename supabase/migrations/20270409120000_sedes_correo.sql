-- Correo de cada sede (Configuración › Sedes › Contacto para clientas): goes in the Plan Ahorro XV contract signed by the store's owner;
-- without one, the brand's general email stays. Reversible: alter table public.sedes drop column correo;
alter table public.sedes add column if not exists correo text check (correo is null or correo ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$');
