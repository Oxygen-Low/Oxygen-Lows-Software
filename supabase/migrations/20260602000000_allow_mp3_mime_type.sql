-- Ensure the Storage bucket accepts MP3 uploads.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg'
]
WHERE id = 'Storage';
