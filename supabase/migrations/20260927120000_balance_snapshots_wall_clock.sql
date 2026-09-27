-- Los cortes de saldo pasan a la misma convención de fecha que todo lo demás
-- en Finanzas: **hora de pared etiquetada como UTC**.
--
-- Un gasto de las 19:25 se guarda `19:25Z`, sin convertir. Los cortes, en
-- cambio, se venían guardando como instante real: el formulario convertía la
-- medianoche local a UTC y escribía `05:00Z`. Como el saldo de una cuenta se
-- calcula comparando esas dos fechas —último corte, más lo que se movió
-- después—, la comparación mezclaba dos convenciones y metía cinco horas de
-- desfase. En la práctica dejaba movimientos enteros del lado equivocado y el
-- saldo se quedaba clavado en lo declarado.
--
-- La conversión lleva cada corte a la medianoche de su día **en la zona de la
-- app** y la vuelve a etiquetar como UTC, que es exactamente lo que escribirá
-- el formulario a partir de ahora:
--
--   2026-09-03 05:00:00+00  ->  2026-09-03 00:00:00+00   (medianoche local)
--   2026-09-26 00:12:09+00  ->  2026-09-25 00:00:00+00   (era el día 25 aquí)
--
-- Se pasa por 'America/Guayaquil' en vez de restar cinco horas a pelo para que
-- siga siendo correcto si algún día la zona cambia o se usa otra con horario
-- de verano.

UPDATE bank_account_balance_snapshots
   SET as_of = (date_trunc('day', as_of AT TIME ZONE 'America/Guayaquil') AT TIME ZONE 'UTC'),
       updated_at = timezone('utc', now())
 WHERE as_of <> (date_trunc('day', as_of AT TIME ZONE 'America/Guayaquil') AT TIME ZONE 'UTC');
