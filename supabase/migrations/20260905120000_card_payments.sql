-- Un pago a una tarjeta necesita decirlo por sí mismo.
--
-- Hasta ahora la vista solo reconocía como PAYMENT lo que traía
-- `bank_card_statement_id`, un campo que pone un único camino de la app y que
-- exige que la tarjeta tenga estado de cuenta abierto. Los pagos que llegan por
-- el escáner nunca lo traen, así que la deuda de una tarjeta no bajaba nunca.
--
-- `bank_card_id` no sirve para esto: hoy significa «con esta tarjeta se pagó», y
-- reusarlo con `paid_with_credit = false` lo haría significar también «a esta
-- tarjeta se le pagó», que es lo contrario, distinguido por un booleano que
-- sirve para otra cosa.

ALTER TABLE financial_transactions
    ADD COLUMN bank_card_payment_id      UUID REFERENCES bank_cards(id) ON DELETE SET NULL,
    ADD COLUMN card_payment_dismissed_at TIMESTAMPTZ;

COMMENT ON COLUMN financial_transactions.bank_card_payment_id IS
    'Tarjeta a la que esta transacción le paga. Distinto de bank_card_id, que es la tarjeta con la que se pagó.';
COMMENT ON COLUMN financial_transactions.card_payment_dismissed_at IS
    'Cuándo el usuario descartó esta transacción como candidata a pago de tarjeta.';

CREATE INDEX financial_transactions_bank_card_payment_id_idx
    ON financial_transactions (bank_card_payment_id)
    WHERE bank_card_payment_id IS NOT NULL;

-- No se paga una tarjeta con el crédito de esa misma tarjeta.
ALTER TABLE financial_transactions
    ADD CONSTRAINT financial_transactions_payment_not_on_credit
    CHECK (bank_card_payment_id IS NULL OR COALESCE(paid_with_credit, FALSE) = FALSE);

-- ─── La vista ───────────────────────────────────────────────────────────────
--
-- Solo cambia la última rama, la de PAYMENT. El resto se reproduce igual porque
-- CREATE OR REPLACE VIEW exige la definición entera.

DROP VIEW IF EXISTS bank_movements;

CREATE VIEW bank_movements AS
    SELECT t.id AS transaction_id, t.owner_user_id, t.date,
           COALESCE(t.bank_destination_account_id, t.bank_source_account_id) AS account_id,
           NULL::UUID AS card_id,
           'IN'::TEXT AS direction, t.amount, t.currency,
           t.description, t.merchant, t.category_id
      FROM financial_transactions t
     WHERE t.type IN ('INCOME', 'DEPOSIT', 'REFUND')
       AND COALESCE(t.bank_destination_account_id, t.bank_source_account_id) IS NOT NULL
       AND t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE')
    UNION ALL
    SELECT t.id, t.owner_user_id, t.date,
           t.bank_source_account_id, NULL::UUID,
           'OUT', t.amount, t.currency, t.description, t.merchant, t.category_id
      FROM financial_transactions t
     WHERE t.type IN ('TRANSFER', 'WITHDRAWAL')
       AND t.bank_source_account_id IS NOT NULL
       AND t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE')
    UNION ALL
    SELECT t.id, t.owner_user_id, t.date,
           t.bank_destination_account_id, NULL::UUID,
           'IN', t.amount, t.currency, t.description, t.merchant, t.category_id
      FROM financial_transactions t
     WHERE t.type IN ('TRANSFER', 'WITHDRAWAL')
       AND t.bank_destination_account_id IS NOT NULL
       AND t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE')
    UNION ALL
    SELECT t.id, t.owner_user_id, t.date,
           COALESCE(t.bank_source_account_id, t.bank_destination_account_id), NULL::UUID,
           'OUT', t.amount, t.currency, t.description, t.merchant, t.category_id
      FROM financial_transactions t
     WHERE t.type NOT IN ('INCOME', 'DEPOSIT', 'REFUND', 'TRANSFER', 'WITHDRAWAL')
       AND COALESCE(t.bank_source_account_id, t.bank_destination_account_id) IS NOT NULL
       AND COALESCE(t.paid_with_credit, FALSE) = FALSE
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
    -- Pago a una tarjeta: baja su deuda. La salida de la cuenta pagadora entra
    -- por la rama de gastos, como cualquier otro pago.
    --
    -- LEFT JOIN con COALESCE, y no dos ramas unidas con UNION ALL: un pago que
    -- abona un estado lleva las dos columnas puestas, y con dos ramas restaría
    -- la deuda por duplicado.
    SELECT t.id, t.owner_user_id, t.date,
           NULL::UUID,
           COALESCE(t.bank_card_payment_id, s.card_id),
           'PAYMENT', t.amount, t.currency, t.description, t.merchant, t.category_id
      FROM financial_transactions t
      LEFT JOIN bank_card_statements s ON s.id = t.bank_card_statement_id
     WHERE COALESCE(t.bank_card_payment_id, s.card_id) IS NOT NULL
       AND t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE');

ALTER VIEW bank_movements SET (security_invoker = on);
