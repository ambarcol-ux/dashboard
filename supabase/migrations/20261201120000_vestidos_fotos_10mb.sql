-- Fotos de vestidos importadas de Google Drive van sin redimensionar: el bucket admite hasta 10 MB por foto.
-- Revert: update storage.buckets set file_size_limit=3145728 where id='vestidos_fotos';
update storage.buckets set file_size_limit=10485760 where id='vestidos_fotos';
