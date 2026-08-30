-- La dirección de un movimiento la decide el TIPO de la transacción, no cuál de
-- los dos campos de cuenta esté lleno.
--
-- La vista anterior traducía `bank_source_account_id` a OUT y
-- `bank_destination_account_id` a IN, sin mirar nada más. Pero esos campos no
-- dicen hacia dónde fue el dinero: dicen de qué lado del comprobante apareció
-- la cuenta. El escáner marca como «origen» la cuenta protagonista del
-- documento, así que un sueldo recibido llegaba con la cuenta del usuario en
-- `source` y la vista lo restaba del saldo. En la base de este proyecto eran
-- nueve ingresos: el saldo de esas cuentas se iba al doble de su importe, en
-- negativo.
--
-- Las reglas nuevas, por familia de tipo:
--
--   INCOME · DEPOSIT · REFUND      la cuenta ligada recibe dinero  → IN
--   TRANSFER · WITHDRAWAL          origen entrega, destino recibe  → OUT / IN
--   el resto (gastos)              la cuenta ligada entrega dinero → OUT
--
-- Las transferencias y los retiros se quedan con la regla posicional porque son
-- los únicos donde los dos extremos son cuentas del usuario y el signo depende
-- de cuál se mire: un retiro saca del banco y mete en efectivo.
--
-- Toda cuenta registrada en Bancos es del usuario —las de terceros se quedan en
-- observaciones y nunca se fundan—, así que «la cuenta ligada» siempre es suya
-- y la familia del tipo basta para saber el signo.

DROP VIEW IF EXISTS bank_movements;

CREATE VIEW bank_movements AS
    -- Ingresos: entra a la cuenta, esté anotada como origen o como destino.
    -- Manda el destino cuando está puesto —ahí es donde aterrizó el dinero— y
    -- el origen solo cubre el caso torcido: la cuenta anotada de ese lado
    -- porque el comprobante la ponía primero, sin ninguna otra.
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
    -- Transferencias y retiros: sale de una punta y entra en la otra.
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
    -- Gastos: sale de la cuenta ligada, esté en el campo que esté.
    SELECT t.id, t.owner_user_id, t.date,
           COALESCE(t.bank_source_account_id, t.bank_destination_account_id), NULL::UUID,
           'OUT', t.amount, t.currency, t.description, t.merchant, t.category_id
      FROM financial_transactions t
     WHERE t.type NOT IN ('INCOME', 'DEPOSIT', 'REFUND', 'TRANSFER', 'WITHDRAWAL')
       AND COALESCE(t.bank_source_account_id, t.bank_destination_account_id) IS NOT NULL
       -- Lo pagado con una tarjeta de crédito no sale de ninguna cuenta hasta
       -- que se paga el estado, y ese pago llega como su propia transacción.
       AND COALESCE(t.paid_with_credit, FALSE) = FALSE
       AND t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE')
    UNION ALL
    -- Consumo con tarjeta de crédito: engorda la deuda, no toca cuentas.
    SELECT t.id, t.owner_user_id, t.date,
           NULL::UUID, t.bank_card_id,
           'CHARGE', t.amount, t.currency, t.description, t.merchant, t.category_id
      FROM financial_transactions t
      JOIN bank_cards c ON c.id = t.bank_card_id
     WHERE c.card_type = 'CREDIT' AND t.paid_with_credit = TRUE
       AND t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE')
    UNION ALL
    -- Pago del estado de cuenta: baja la deuda de la tarjeta. Su salida de la
    -- cuenta pagadora entra por la rama de gastos, como cualquier otro pago.
    SELECT t.id, t.owner_user_id, t.date,
           NULL::UUID, s.card_id,
           'PAYMENT', t.amount, t.currency, t.description, t.merchant, t.category_id
      FROM financial_transactions t
      JOIN bank_card_statements s ON s.id = t.bank_card_statement_id
     WHERE t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE');

-- La vista hereda el RLS de financial_transactions en vez de correr como su
-- dueño: sin esto, cualquier usuario vería los movimientos de todos.
ALTER VIEW bank_movements SET (security_invoker = on);

-- ─── Normalización de lo ya guardado ────────────────────────────────────────
--
-- La vista de arriba ya lee bien un ingreso con la cuenta en `source`, pero
-- dejar el dato torcido obliga a que cada consumidor futuro conozca la
-- excepción. Un ingreso guarda su cuenta donde le corresponde: el destino.
UPDATE financial_transactions
   SET bank_destination_account_id = bank_source_account_id,
       bank_source_account_id = NULL
 WHERE type IN ('INCOME', 'DEPOSIT', 'REFUND')
   AND bank_source_account_id IS NOT NULL
   AND bank_destination_account_id IS NULL;
