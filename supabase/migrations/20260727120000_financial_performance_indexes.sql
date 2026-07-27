-- Índices de rendimiento del módulo financiero.
--
-- Verificado contra el esquema vivo antes de aplicarlo: la base ya tenía varios
-- índices que no estaban en estas migraciones (el esquema real ha derivado,
-- porque el workflow externo del escáner también escribe en la BD). En concreto
-- ya existían:
--   - idx_financial_transactions_owner_date  → (owner_user_id, date DESC)
--   - idx_financial_transactions_owner_status, ..._owner_merchant, ..._tags_gin
--   - idx_fst_execution_id, idx_fst_date, idx_fst_user_status
--
-- Por eso aquí solo se crea lo que faltaba de verdad. Aplicado con
-- `IF NOT EXISTS`, así que es idempotente y seguro de re-ejecutar.

-- Estas dos FK de financial_transactions no tenían índice. Al volumen actual
-- (~300 filas) no cambian los tiempos de consulta, pero una FK sin indexar
-- penaliza los borrados/actualizaciones de la tabla padre —categorías e
-- instituciones, que se eliminan y se fusionan— y prepara el crecimiento.
CREATE INDEX IF NOT EXISTS idx_ft_category
    ON financial_transactions (category_id)
    WHERE category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ft_institution
    ON financial_transactions (institution_id)
    WHERE institution_id IS NOT NULL;

-- Los conteos por día del escáner filtran por dueño + rango de fecha; los
-- índices existentes cubrían (owner_user_id, status) y (date) por separado.
CREATE INDEX IF NOT EXISTS idx_fst_owner_date
    ON financial_scanner_transactions (owner_user_id, date);
