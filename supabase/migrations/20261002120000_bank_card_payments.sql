-- Pagos de tarjeta registrados desde Bancos: en la tarjeta, no como transacción.
--
-- El botón «Pagar» de una tarjeta creaba una transacción de tipo PAYMENT. Pero
-- el dinero que sale de la cuenta para pagar la tarjeta el usuario ya lo
-- registra por su lado —lo trae el escaneo del banco, o lo anota como gasto—,
-- así que cada pago hecho desde Bancos aparecía dos veces en la lista de
-- transacciones y restaba dos veces del balance del periodo.
--
-- Desde Bancos lo único que se quiere decir es «esta deuda ya está pagada».
-- Eso vive ahora en su propia tabla: baja la deuda de la tarjeta y abona el
-- estado de cuenta, y no toca ni la lista de transacciones ni el balance ni el
-- saldo de ninguna cuenta.

CREATE TABLE bank_card_payments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id       UUID NOT NULL REFERENCES bank_cards(id) ON DELETE CASCADE,
    -- El estado de cuenta al que se abonó, si había uno abierto.
    statement_id  UUID REFERENCES bank_card_statements(id) ON DELETE SET NULL,
    -- Mismo tipo que financial_transactions.amount: la vista une las dos y no
    -- admite que la columna cambie de tipo.
    amount        NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency      TEXT NOT NULL DEFAULT 'USD',
    -- Hora de pared etiquetada como UTC, como todas las fechas de Finanzas.
    date          TIMESTAMPTZ NOT NULL,
    description   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    is_deleted    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX bank_card_payments_owner_idx ON bank_card_payments (owner_user_id);
CREATE INDEX bank_card_payments_card_idx  ON bank_card_payments (card_id) WHERE NOT is_deleted;

ALTER TABLE bank_card_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bank_card_payments"   ON bank_card_payments FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own bank_card_payments" ON bank_card_payments FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own bank_card_payments" ON bank_card_payments FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own bank_card_payments" ON bank_card_payments FOR DELETE USING (auth.uid() = owner_user_id);

-- La vista suma una rama: cada pago de la tabla es una línea PAYMENT de su
-- tarjeta. `card_payment_id` va al final —una vista solo admite columnas
-- nuevas al final— y es lo que permite a la pantalla saber que esa línea es
-- un pago de Bancos, que se borra desde la tarjeta y no desde Transacciones.
-- Las seis ramas anteriores no cambian.
CREATE OR REPLACE VIEW bank_movements WITH (security_invoker = on) AS
 SELECT t.id AS transaction_id, t.owner_user_id, t.date,
    COALESCE(t.bank_destination_account_id, t.bank_source_account_id) AS account_id,
    NULL::uuid AS card_id, 'IN'::text AS direction, t.amount, t.currency, t.description, t.merchant, t.category_id,
    NULL::uuid AS card_payment_id
   FROM financial_transactions t
  WHERE (t.type = ANY (ARRAY['INCOME'::financial_transaction_type, 'DEPOSIT'::financial_transaction_type, 'REFUND'::financial_transaction_type]))
    AND COALESCE(t.bank_destination_account_id, t.bank_source_account_id) IS NOT NULL
    AND (t.status <> ALL (ARRAY['REJECTED'::financial_transaction_status, 'DELETED'::financial_transaction_status, 'DUPLICATE'::financial_transaction_status]))
UNION ALL
 SELECT t.id, t.owner_user_id, t.date, t.bank_source_account_id, NULL::uuid, 'OUT'::text,
    t.amount, t.currency, t.description, t.merchant, t.category_id, NULL::uuid
   FROM financial_transactions t
  WHERE (t.type = ANY (ARRAY['TRANSFER'::financial_transaction_type, 'WITHDRAWAL'::financial_transaction_type]))
    AND t.bank_source_account_id IS NOT NULL
    AND (t.status <> ALL (ARRAY['REJECTED'::financial_transaction_status, 'DELETED'::financial_transaction_status, 'DUPLICATE'::financial_transaction_status]))
UNION ALL
 SELECT t.id, t.owner_user_id, t.date, t.bank_destination_account_id, NULL::uuid, 'IN'::text,
    t.amount, t.currency, t.description, t.merchant, t.category_id, NULL::uuid
   FROM financial_transactions t
  WHERE (t.type = ANY (ARRAY['TRANSFER'::financial_transaction_type, 'WITHDRAWAL'::financial_transaction_type]))
    AND t.bank_destination_account_id IS NOT NULL
    AND (t.status <> ALL (ARRAY['REJECTED'::financial_transaction_status, 'DELETED'::financial_transaction_status, 'DUPLICATE'::financial_transaction_status]))
UNION ALL
 SELECT t.id, t.owner_user_id, t.date, COALESCE(t.bank_source_account_id, t.bank_destination_account_id), NULL::uuid, 'OUT'::text,
    t.amount, t.currency, t.description, t.merchant, t.category_id, NULL::uuid
   FROM financial_transactions t
  WHERE (t.type <> ALL (ARRAY['INCOME'::financial_transaction_type, 'DEPOSIT'::financial_transaction_type, 'REFUND'::financial_transaction_type, 'TRANSFER'::financial_transaction_type, 'WITHDRAWAL'::financial_transaction_type]))
    AND COALESCE(t.bank_source_account_id, t.bank_destination_account_id) IS NOT NULL
    AND COALESCE(t.paid_with_credit, false) = false
    AND (t.status <> ALL (ARRAY['REJECTED'::financial_transaction_status, 'DELETED'::financial_transaction_status, 'DUPLICATE'::financial_transaction_status]))
UNION ALL
 SELECT t.id, t.owner_user_id, t.date, NULL::uuid, t.bank_card_id, 'CHARGE'::text,
    t.amount, t.currency, t.description, t.merchant, t.category_id, NULL::uuid
   FROM financial_transactions t
     JOIN bank_cards c ON c.id = t.bank_card_id
  WHERE c.card_type = 'CREDIT'::bank_card_type AND t.paid_with_credit = true
    AND (t.status <> ALL (ARRAY['REJECTED'::financial_transaction_status, 'DELETED'::financial_transaction_status, 'DUPLICATE'::financial_transaction_status]))
UNION ALL
 SELECT t.id, t.owner_user_id, t.date, NULL::uuid, COALESCE(t.bank_card_payment_id, s.card_id), 'PAYMENT'::text,
    t.amount, t.currency, t.description, t.merchant, t.category_id, NULL::uuid
   FROM financial_transactions t
     LEFT JOIN bank_card_statements s ON s.id = t.bank_card_statement_id
  WHERE COALESCE(t.bank_card_payment_id, s.card_id) IS NOT NULL
    AND (t.status <> ALL (ARRAY['REJECTED'::financial_transaction_status, 'DELETED'::financial_transaction_status, 'DUPLICATE'::financial_transaction_status]))
UNION ALL
 SELECT p.id, p.owner_user_id, p.date, NULL::uuid, p.card_id, 'PAYMENT'::text,
    p.amount, p.currency, p.description, NULL::text, NULL::uuid, p.id
   FROM bank_card_payments p
  WHERE NOT p.is_deleted;

-- Unificar dos tarjetas también tiene que mudar sus pagos registrados en
-- Bancos: si no, la deuda de la que se queda no vería lo que ya se pagó en la
-- repetida. Misma función que `20260928120000_merge_bank_identities`, con un
-- UPDATE más.
CREATE OR REPLACE FUNCTION merge_bank_cards(p_target UUID, p_sources UUID[])
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    v_owner UUID := auth.uid(); v_target bank_cards%ROWTYPE; v_found INT;
    v_transactions INT := 0; v_payments INT := 0; v_card_payments INT := 0;
    v_statements INT := 0; v_observations INT := 0;
BEGIN
    IF v_owner IS NULL THEN RAISE EXCEPTION 'Sesión no válida'; END IF;
    IF p_sources IS NULL OR array_length(p_sources, 1) IS NULL THEN RAISE EXCEPTION 'Elige al menos una tarjeta a unificar'; END IF;
    IF p_target = ANY(p_sources) THEN RAISE EXCEPTION 'La tarjeta destino no puede estar entre las que se unifican'; END IF;
    SELECT * INTO v_target FROM bank_cards WHERE id = p_target AND owner_user_id = v_owner AND NOT is_deleted;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tarjeta destino no encontrada'; END IF;
    SELECT count(*) INTO v_found FROM bank_cards WHERE id = ANY(p_sources) AND owner_user_id = v_owner AND card_type = v_target.card_type;
    IF v_found <> array_length(p_sources, 1) THEN RAISE EXCEPTION 'Solo se unifican tarjetas tuyas y del mismo tipo'; END IF;

    UPDATE financial_transactions SET bank_card_id = p_target, updated_at = timezone('utc', now())
     WHERE owner_user_id = v_owner AND bank_card_id = ANY(p_sources);
    GET DIAGNOSTICS v_transactions = ROW_COUNT;
    UPDATE financial_transactions SET bank_card_payment_id = p_target, updated_at = timezone('utc', now())
     WHERE owner_user_id = v_owner AND bank_card_payment_id = ANY(p_sources);
    GET DIAGNOSTICS v_payments = ROW_COUNT;
    UPDATE bank_card_payments SET card_id = p_target, updated_at = timezone('utc', now())
     WHERE owner_user_id = v_owner AND card_id = ANY(p_sources);
    GET DIAGNOSTICS v_card_payments = ROW_COUNT;
    UPDATE bank_number_observations SET card_id = p_target, updated_at = timezone('utc', now())
     WHERE owner_user_id = v_owner AND card_id = ANY(p_sources);
    GET DIAGNOSTICS v_observations = ROW_COUNT;

    UPDATE bank_card_statements s SET is_deleted = true, updated_at = timezone('utc', now())
     WHERE s.owner_user_id = v_owner AND s.card_id = ANY(p_sources) AND NOT s.is_deleted
       AND EXISTS (SELECT 1 FROM bank_card_statements t WHERE t.card_id = p_target AND NOT t.is_deleted AND t.period_start = s.period_start);
    UPDATE bank_card_statements SET card_id = p_target, updated_at = timezone('utc', now())
     WHERE owner_user_id = v_owner AND card_id = ANY(p_sources);
    GET DIAGNOSTICS v_statements = ROW_COUNT;

    DELETE FROM financial_balance_scope_rules
     WHERE owner_user_id = v_owner AND target_type = 'CARD' AND target_id = ANY(p_sources);

    UPDATE bank_cards t SET brand = COALESCE(t.brand, s.brand), bin = COALESCE(t.bin, s.bin),
        prefix_digits = COALESCE(t.prefix_digits, s.prefix_digits), credit_limit = COALESCE(t.credit_limit, s.credit_limit),
        statement_day = COALESCE(t.statement_day, s.statement_day), due_day = COALESCE(t.due_day, s.due_day),
        updated_at = timezone('utc', now())
      FROM (SELECT max(brand) AS brand, max(bin) AS bin, max(prefix_digits) AS prefix_digits, max(credit_limit) AS credit_limit,
                   max(statement_day) AS statement_day, max(due_day) AS due_day FROM bank_cards WHERE id = ANY(p_sources)) s
     WHERE t.id = p_target;
    UPDATE bank_cards SET is_deleted = true, updated_at = timezone('utc', now())
     WHERE id = ANY(p_sources) AND NOT is_deleted;

    RETURN jsonb_build_object('movedTransactions', v_transactions + v_payments + v_card_payments,
        'movedStatements', v_statements, 'movedObservations', v_observations,
        'mergedCards', array_length(p_sources, 1));
END; $$;

-- Los pagos que el botón «Pagar» ya creó como transacción se mudan a la tabla
-- nueva y la transacción se da por borrada (recuperable: solo cambia el
-- estado). Se reconocen por cómo los escribía ese botón —tipo PAYMENT, estado
-- MANUAL, atados a una tarjeta y sin escaneo—, así que los pagos reales que
-- el usuario ató a una tarjeta desde la conciliación siguen siendo
-- transacciones: esos sí son dinero saliendo de una cuenta.
INSERT INTO bank_card_payments (id, owner_user_id, card_id, statement_id, amount, currency, date, description, created_at, updated_at)
SELECT t.id, t.owner_user_id, t.bank_card_payment_id, t.bank_card_statement_id, t.amount, t.currency, t.date, t.description,
       t.created_at, timezone('utc', now())
  FROM financial_transactions t
 WHERE t.type = 'PAYMENT' AND t.status = 'MANUAL'
   AND t.bank_card_payment_id IS NOT NULL AND t.execution_id IS NULL;

UPDATE financial_transactions t
   SET status = 'DELETED', updated_at = timezone('utc', now())
 WHERE t.type = 'PAYMENT' AND t.status = 'MANUAL'
   AND t.bank_card_payment_id IS NOT NULL AND t.execution_id IS NULL
   AND EXISTS (SELECT 1 FROM bank_card_payments p WHERE p.id = t.id);
