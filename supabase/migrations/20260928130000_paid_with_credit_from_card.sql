-- Un gasto hecho con una tarjeta de crédito es un gasto a crédito. Siempre.
--
-- La app y la base de datos lo decidían con reglas distintas. La app
-- (`isTransactionPaidWithCredit`) mira la tarjeta: si es de crédito, el gasto
-- es a crédito. La vista `bank_movements`, en cambio, solo abre la línea de
-- deuda (CHARGE) si además la marca `paid_with_credit` está en true. Cualquier
-- pantalla que guardara la tarjeta sin tocar la marca —elegirla desde la
-- edición, crear la tarjeta a mano después, unificar dos copias— dejaba un
-- consumo que el balance del periodo trataba como crédito y la deuda de la
-- tarjeta no veía: la tarjeta decía «Sin deuda» con una compra encima.
--
-- `20260826120000_backfill_paid_with_credit_from_card` ya lo arregló una vez,
-- pero solo hacia atrás: nada impedía que volviera a pasar, y volvió. Esta vez
-- la regla vive en la base, en un trigger, así que da igual quién escriba.
--
-- Solo empuja hacia TRUE, nunca hacia FALSE: una marca puesta por el texto de
-- la notificación, sin tarjeta registrada, sigue siendo válida.
--
-- Mismos tipos que la regla de la app (EXPENSE, PAYMENT, OTHER), y fuera
-- cuando la fila es un pago A una tarjeta (`bank_card_payment_id`): eso salda
-- deuda, no la crea.

CREATE OR REPLACE FUNCTION financial_transactions_credit_from_card()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.bank_card_id IS NOT NULL
       AND NEW.bank_card_payment_id IS NULL
       AND NEW.type IN ('EXPENSE', 'PAYMENT', 'OTHER')
       AND COALESCE(NEW.paid_with_credit, false) = false
       AND EXISTS (SELECT 1 FROM bank_cards c
                    WHERE c.id = NEW.bank_card_id AND c.card_type = 'CREDIT')
    THEN
        NEW.paid_with_credit := true;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS financial_transactions_credit_from_card ON financial_transactions;
CREATE TRIGGER financial_transactions_credit_from_card
    BEFORE INSERT OR UPDATE OF bank_card_id, bank_card_payment_id, type, paid_with_credit
    ON financial_transactions
    FOR EACH ROW
    EXECUTE FUNCTION financial_transactions_credit_from_card();

-- Y lo que ya quedó mal, con la misma regla.
UPDATE financial_transactions t
   SET paid_with_credit = true, updated_at = timezone('utc', now())
  FROM bank_cards c
 WHERE c.id = t.bank_card_id
   AND c.card_type = 'CREDIT'
   AND t.bank_card_payment_id IS NULL
   AND t.type IN ('EXPENSE', 'PAYMENT', 'OTHER')
   AND COALESCE(t.paid_with_credit, false) = false;
