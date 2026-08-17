-- Retira financial_accounts.
--
-- La tabla existía con su UI desde el arranque del módulo financiero pero
-- nunca se usó: 0 filas, y financial_transactions.account_id siempre en null.
-- Las cuentas ahora viven en bank_accounts, bajo la institución que
-- realmente las emite.
--
-- Verificado antes de aplicar:
--   SELECT count(*) FROM financial_accounts                              -> 0
--   SELECT count(*) FROM financial_transactions WHERE account_id IS NOT NULL -> 0

ALTER TABLE financial_transactions DROP COLUMN IF EXISTS account_id;
DROP TABLE IF EXISTS financial_accounts;
