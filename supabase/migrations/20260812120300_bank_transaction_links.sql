-- Enlaces desde la transacción financiera hacia el módulo Bancos, y el libro
-- mayor derivado.
--
-- La vista no tiene tabla física a propósito: la transacción sigue siendo la
-- única fuente de verdad, así que editarla o borrarla no puede desincronizar
-- ningún saldo.
--
-- bank_counterparty_observation_id se declara sin FK: la tabla
-- bank_number_observations a la que apunta llega con la identificación
-- automática. Declararla ahora evita una segunda migración sobre
-- financial_transactions.

ALTER TABLE financial_transactions
    ADD COLUMN IF NOT EXISTS bank_source_account_id           UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bank_destination_account_id      UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bank_card_id                     UUID REFERENCES bank_cards(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bank_institution_id              UUID REFERENCES bank_institutions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bank_card_statement_id           UUID REFERENCES bank_card_statements(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bank_counterparty_observation_id UUID;

CREATE INDEX IF NOT EXISTS financial_transactions_bank_source_idx
    ON financial_transactions (bank_source_account_id, date DESC);
CREATE INDEX IF NOT EXISTS financial_transactions_bank_dest_idx
    ON financial_transactions (bank_destination_account_id, date DESC);
CREATE INDEX IF NOT EXISTS financial_transactions_bank_card_idx
    ON financial_transactions (bank_card_id, date DESC);

-- Las seis reglas del libro mayor:
--   gasto con débito / transferencia saliente -> OUT en la cuenta origen
--   ingreso                                   -> IN en la cuenta destino
--   transferencia entre cuentas propias       -> OUT origen + IN destino
--   retiro en cajero                          -> OUT banco + IN efectivo (neto cero)
--   consumo con tarjeta de crédito            -> CHARGE en la tarjeta, ninguna cuenta
--   pago de la tarjeta                        -> OUT en la cuenta + PAYMENT en la tarjeta
CREATE VIEW bank_movements AS
    SELECT t.id AS transaction_id, t.owner_user_id, t.date,
           t.bank_source_account_id AS account_id, NULL::UUID AS card_id,
           'OUT'::TEXT AS direction, t.amount, t.currency,
           t.description, t.merchant, t.category_id
      FROM financial_transactions t
     WHERE t.bank_source_account_id IS NOT NULL
       AND t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE')
    UNION ALL
    SELECT t.id, t.owner_user_id, t.date,
           t.bank_destination_account_id, NULL::UUID,
           'IN', t.amount, t.currency, t.description, t.merchant, t.category_id
      FROM financial_transactions t
     WHERE t.bank_destination_account_id IS NOT NULL
       AND t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE')
    UNION ALL
    SELECT t.id, t.owner_user_id, t.date,
           NULL::UUID, t.bank_card_id,
           'CHARGE', t.amount, t.currency, t.description, t.merchant, t.category_id
      FROM financial_transactions t
      JOIN bank_cards c ON c.id = t.bank_card_id
     WHERE c.card_type = 'CREDIT' AND t.paid_with_credit = TRUE
       AND t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE')
    UNION ALL
    SELECT t.id, t.owner_user_id, t.date,
           NULL::UUID, s.card_id,
           'PAYMENT', t.amount, t.currency, t.description, t.merchant, t.category_id
      FROM financial_transactions t
      JOIN bank_card_statements s ON s.id = t.bank_card_statement_id
     WHERE t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE');

-- La vista hereda el RLS de financial_transactions en vez de correr como su
-- dueño: sin esto, cualquier usuario vería los movimientos de todos.
ALTER VIEW bank_movements SET (security_invoker = on);
