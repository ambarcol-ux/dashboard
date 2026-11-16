-- WhatsApp 304: fotos de las clientas guardadas la primera vez que se abren (antes se descargaban de Meta en cada apertura del chat
-- y Meta las borra a los 30 días). Privado: solo el servidor sube y firma enlaces de 1 hora para quien puede ver el chat.
-- Reversión: delete from storage.objects where bucket_id='whatsapp_fotos'; delete from storage.buckets where id='whatsapp_fotos';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('whatsapp_fotos','whatsapp_fotos',false,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;
