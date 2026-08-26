-- Alinea `paid_with_credit` con el tipo de la tarjeta ligada.
--
-- El inbox del escáner resolvía `paid_with_credit` con la heurística de texto
-- *antes* de identificar la cuenta, y el vínculo `bank_card_id` se escribía
-- después. Un consumo que terminaba ligado a una tarjeta CREDIT quedaba con
-- `paid_with_credit = false`: el gasto se restaba del balance como si fuera
-- efectivo, y el detalle mostraba el switch "Pagado con tarjeta" apagado.
--
-- El código ya resuelve esto en lectura (`isTransactionPaidWithCredit` recibe
-- los ids de las tarjetas CREDIT) y en escritura (el inbox vuelve a decidir
-- después de resolver el vínculo). Esta migración corrige las filas viejas para
-- que la columna almacenada coincida con lo que muestran las pantallas.
--
-- Se excluyen los pagos *a* la tarjeta (saldar la deuda): son salida real de
-- efectivo, no un consumo diferido — el mismo guard que aplica el código.
--
-- Idempotente: repetirla no cambia nada más.
--
-- Medido al aplicarla: 10 filas, $371.26 en total.

UPDATE financial_transactions t
SET paid_with_credit = true,
    updated_at = NOW()
FROM bank_cards c
WHERE c.id = t.bank_card_id
  AND c.card_type = 'CREDIT'
  AND t.paid_with_credit IS DISTINCT FROM true
  AND t.type IN ('EXPENSE', 'PAYMENT', 'OTHER')
  AND COALESCE(t.description, '') !~* '(pago|abono|cancelaci[oó]n|transferencia)[[:space:][:alnum:]]{0,30}(a|de|hacia|para|por) +(la +)?tarjeta[s]? +(de +)?cr[eé]dito';
