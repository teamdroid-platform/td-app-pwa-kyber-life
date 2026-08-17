-- Puebla las observaciones desde el historial de escaneos.
--
-- No liga ninguna identidad: eso lo decide el servicio, que sabe de
-- compatibilidad entre huellas. Aquí solo se registra qué cadenas se han visto
-- y cuántas veces. Todas quedan en PENDING; `reparseAll` las completa después.
--
-- Idempotente por el índice único (owner_user_id, raw).
--
-- Nota: financial_scanner_transactions.owner_user_id es TEXT, no uuid, así que
-- el join contra auth.users compara por texto y descarta lo que no sea un
-- usuario real. Resultado medido al aplicarla:
--
--   164 filas (owner, raw) — 98 cadenas distintas vistas por 2 usuarios; la
--       misma máscara para dos personas son dos cuentas distintas, y el RLS
--       las separa, así que duplicarlas por dueño es lo correcto.
--   730 ocurrencias de las 739 del historial. Las 9 que faltan son de owners
--       que no existen en auth.users: 7 de owner_user_id = 'test' (datos de
--       desarrollo) y 2 de una fila con owner nulo.

INSERT INTO bank_number_observations (owner_user_id, raw, occurrences, resolution)
SELECT owner.id,
       x.raw,
       count(*),
       'PENDING'
FROM (
    SELECT s.owner_user_id AS scanner_owner,
           jsonb_array_elements(s.accounts)->>'account' AS raw
    FROM financial_scanner_transactions s
    WHERE s.accounts IS NOT NULL AND jsonb_array_length(s.accounts) > 0
) x
CROSS JOIN LATERAL (
    SELECT u.id FROM auth.users u WHERE u.id::text = x.scanner_owner
) owner
WHERE x.raw IS NOT NULL AND btrim(x.raw) <> ''
GROUP BY owner.id, x.raw
ON CONFLICT (owner_user_id, raw) DO NOTHING;
