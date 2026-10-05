-- Categorías base que nadie usó: Impuestos, Mascotas, Regalos y Donaciones y
-- Seguros. Venían con `20260603090234_add_base_financial_categories` y solo
-- engordaban el selector.
--
-- Son compartidas (owner_user_id NULL), así que se borran solo si ninguna
-- transacción de ningún usuario las usa ni cuelga de ellas otra categoría.
-- Una base donde alguien ya las usó las conserva.
DELETE FROM financial_categories c
 WHERE c.owner_user_id IS NULL
   AND c.name IN ('Impuestos', 'Mascotas', 'Regalos y Donaciones', 'Seguros')
   AND NOT EXISTS (SELECT 1 FROM financial_transactions t WHERE t.category_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM financial_categories h WHERE h.parent_id = c.id);
