-- El saldo corriente de la lista de transacciones: bajo cada monto, el saldo
-- acumulado del rango, como un libro diario.
--
-- Va en los ajustes de balance porque sigue exactamente al balance elegido:
-- con 'PERIOD' los consumos con tarjeta no mueven el saldo, con
-- 'PERIOD_WITH_CREDIT' sí.
--
-- Apagado por defecto, también para las filas que ya existen: es un dato de
-- más en cada fila y nadie lo pidió antes de que existiera la opción.

ALTER TABLE financial_balance_settings
    ADD COLUMN IF NOT EXISTS show_running_balance BOOLEAN NOT NULL DEFAULT FALSE;
