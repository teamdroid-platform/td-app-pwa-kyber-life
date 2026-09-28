-- Unificar tarjetas y cuentas repetidas.
--
-- La misma tarjeta registrada dos veces —una a mano, otra desde un escaneo—
-- parte su historia en dos: la deuda de una no ve los consumos de la otra y
-- la lista de Bancos enseña dos veces el mismo número. Unificar pasa TODO lo
-- que cuelga de las repetidas a la que se queda y archiva las repetidas.
--
-- Es una función y no una serie de llamadas desde la app por una sola razón:
-- son hasta seis tablas, y a medio camino quedaría la historia repartida entre
-- una identidad viva y otra archivada —justo el desorden que se viene a
-- arreglar—. Aquí o se mueve todo o no se mueve nada.
--
-- SECURITY INVOKER: corre con los permisos de quien llama, así que las
-- políticas RLS siguen mandando. Además se comprueba a mano que todas las
-- identidades sean del usuario, para fallar con un mensaje claro en vez de
-- mover cero filas en silencio.

CREATE OR REPLACE FUNCTION merge_bank_cards(p_target UUID, p_sources UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_owner        UUID := auth.uid();
    v_target       bank_cards%ROWTYPE;
    v_found        INT;
    v_transactions INT := 0;
    v_payments     INT := 0;
    v_statements   INT := 0;
    v_observations INT := 0;
BEGIN
    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida';
    END IF;
    IF p_sources IS NULL OR array_length(p_sources, 1) IS NULL THEN
        RAISE EXCEPTION 'Elige al menos una tarjeta a unificar';
    END IF;
    IF p_target = ANY(p_sources) THEN
        RAISE EXCEPTION 'La tarjeta destino no puede estar entre las que se unifican';
    END IF;

    SELECT * INTO v_target FROM bank_cards
     WHERE id = p_target AND owner_user_id = v_owner AND NOT is_deleted;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tarjeta destino no encontrada';
    END IF;

    -- Todas del usuario, y del mismo tipo que la que se queda: una de crédito
    -- y una de débito con el mismo número no son la misma tarjeta, y mezclar
    -- sus movimientos convertiría consumos en descuentos de cuenta.
    SELECT count(*) INTO v_found FROM bank_cards
     WHERE id = ANY(p_sources) AND owner_user_id = v_owner
       AND card_type = v_target.card_type;
    IF v_found <> array_length(p_sources, 1) THEN
        RAISE EXCEPTION 'Solo se unifican tarjetas tuyas y del mismo tipo';
    END IF;

    UPDATE financial_transactions SET bank_card_id = p_target, updated_at = timezone('utc', now())
     WHERE owner_user_id = v_owner AND bank_card_id = ANY(p_sources);
    GET DIAGNOSTICS v_transactions = ROW_COUNT;

    UPDATE financial_transactions SET bank_card_payment_id = p_target, updated_at = timezone('utc', now())
     WHERE owner_user_id = v_owner AND bank_card_payment_id = ANY(p_sources);
    GET DIAGNOSTICS v_payments = ROW_COUNT;

    UPDATE bank_number_observations SET card_id = p_target, updated_at = timezone('utc', now())
     WHERE owner_user_id = v_owner AND card_id = ANY(p_sources);
    GET DIAGNOSTICS v_observations = ROW_COUNT;

    -- Un estado de cuenta por tarjeta y periodo: el de la repetida que choca
    -- con uno de la que se queda se archiva, y los demás se mudan. Los estados
    -- se abren solos al leer, así que no se pierde nada que no se recalcule.
    UPDATE bank_card_statements s SET is_deleted = true, updated_at = timezone('utc', now())
     WHERE s.owner_user_id = v_owner AND s.card_id = ANY(p_sources) AND NOT s.is_deleted
       AND EXISTS (SELECT 1 FROM bank_card_statements t
                    WHERE t.card_id = p_target AND NOT t.is_deleted
                      AND t.period_start = s.period_start);

    UPDATE bank_card_statements SET card_id = p_target, updated_at = timezone('utc', now())
     WHERE owner_user_id = v_owner AND card_id = ANY(p_sources);
    GET DIAGNOSTICS v_statements = ROW_COUNT;

    -- Una excepción de balance sobre una repetida no se hereda: manda la de la
    -- que se queda. Heredarla podría excluir en silencio una tarjeta que el
    -- usuario tiene incluida.
    DELETE FROM financial_balance_scope_rules
     WHERE owner_user_id = v_owner AND target_type = 'CARD' AND target_id = ANY(p_sources);

    -- Lo que la que se queda no sabe y la repetida sí: cupo, días de corte y
    -- pago, marca. Solo se rellena lo vacío; lo que ya tiene, gana.
    UPDATE bank_cards t SET
        brand          = COALESCE(t.brand, s.brand),
        bin            = COALESCE(t.bin, s.bin),
        prefix_digits  = COALESCE(t.prefix_digits, s.prefix_digits),
        credit_limit   = COALESCE(t.credit_limit, s.credit_limit),
        statement_day  = COALESCE(t.statement_day, s.statement_day),
        due_day        = COALESCE(t.due_day, s.due_day),
        updated_at     = timezone('utc', now())
      FROM (SELECT max(brand) AS brand, max(bin) AS bin, max(prefix_digits) AS prefix_digits,
                   max(credit_limit) AS credit_limit, max(statement_day) AS statement_day,
                   max(due_day) AS due_day
              FROM bank_cards WHERE id = ANY(p_sources)) s
     WHERE t.id = p_target;

    UPDATE bank_cards SET is_deleted = true, updated_at = timezone('utc', now())
     WHERE id = ANY(p_sources) AND NOT is_deleted;

    RETURN jsonb_build_object(
        'movedTransactions', v_transactions + v_payments,
        'movedStatements',   v_statements,
        'movedObservations', v_observations,
        'mergedCards',       array_length(p_sources, 1)
    );
END;
$$;

CREATE OR REPLACE FUNCTION merge_bank_accounts(p_target UUID, p_sources UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_owner        UUID := auth.uid();
    v_target       bank_accounts%ROWTYPE;
    v_found        INT;
    v_source_side  INT := 0;
    v_dest_side    INT := 0;
    v_snapshots    INT := 0;
    v_cards        INT := 0;
    v_observations INT := 0;
BEGIN
    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida';
    END IF;
    IF p_sources IS NULL OR array_length(p_sources, 1) IS NULL THEN
        RAISE EXCEPTION 'Elige al menos una cuenta a unificar';
    END IF;
    IF p_target = ANY(p_sources) THEN
        RAISE EXCEPTION 'La cuenta destino no puede estar entre las que se unifican';
    END IF;

    SELECT * INTO v_target FROM bank_accounts
     WHERE id = p_target AND owner_user_id = v_owner AND NOT is_deleted;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cuenta destino no encontrada';
    END IF;

    -- El efectivo no es un número de banco: no se mezcla con una cuenta.
    SELECT count(*) INTO v_found FROM bank_accounts
     WHERE id = ANY(p_sources) AND owner_user_id = v_owner
       AND ((account_type = 'CASH') = (v_target.account_type = 'CASH'));
    IF v_found <> array_length(p_sources, 1) THEN
        RAISE EXCEPTION 'Solo se unifican cuentas tuyas, y el efectivo solo con efectivo';
    END IF;

    UPDATE financial_transactions SET bank_source_account_id = p_target, updated_at = timezone('utc', now())
     WHERE owner_user_id = v_owner AND bank_source_account_id = ANY(p_sources);
    GET DIAGNOSTICS v_source_side = ROW_COUNT;

    UPDATE financial_transactions SET bank_destination_account_id = p_target, updated_at = timezone('utc', now())
     WHERE owner_user_id = v_owner AND bank_destination_account_id = ANY(p_sources);
    GET DIAGNOSTICS v_dest_side = ROW_COUNT;

    -- Los cortes se mudan todos: el saldo toma siempre el último, así que dos
    -- historiales juntos siguen dando la respuesta correcta.
    UPDATE bank_account_balance_snapshots SET account_id = p_target, updated_at = timezone('utc', now())
     WHERE owner_user_id = v_owner AND account_id = ANY(p_sources);
    GET DIAGNOSTICS v_snapshots = ROW_COUNT;

    -- Una tarjeta de débito que gastaba de la repetida pasa a gastar de la que
    -- se queda. Sin esto, archivar la repetida la dejaría sin cuenta.
    UPDATE bank_cards SET account_id = p_target, updated_at = timezone('utc', now())
     WHERE owner_user_id = v_owner AND account_id = ANY(p_sources);
    GET DIAGNOSTICS v_cards = ROW_COUNT;

    UPDATE bank_number_observations SET account_id = p_target, updated_at = timezone('utc', now())
     WHERE owner_user_id = v_owner AND account_id = ANY(p_sources);
    GET DIAGNOSTICS v_observations = ROW_COUNT;

    DELETE FROM financial_balance_scope_rules
     WHERE owner_user_id = v_owner AND target_type = 'ACCOUNT' AND target_id = ANY(p_sources);

    UPDATE bank_accounts t SET
        prefix_digits = COALESCE(t.prefix_digits, s.prefix_digits),
        updated_at    = timezone('utc', now())
      FROM (SELECT max(prefix_digits) AS prefix_digits
              FROM bank_accounts WHERE id = ANY(p_sources)) s
     WHERE t.id = p_target;

    UPDATE bank_accounts SET is_deleted = true, updated_at = timezone('utc', now())
     WHERE id = ANY(p_sources) AND NOT is_deleted;

    RETURN jsonb_build_object(
        'movedTransactions', v_source_side + v_dest_side,
        'movedSnapshots',    v_snapshots,
        'movedCards',        v_cards,
        'movedObservations', v_observations,
        'mergedAccounts',    array_length(p_sources, 1)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION merge_bank_cards(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION merge_bank_accounts(UUID, UUID[]) TO authenticated;
