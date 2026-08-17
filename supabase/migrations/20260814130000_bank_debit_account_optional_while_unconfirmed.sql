-- Una tarjeta de débito recién detectada puede no tener cuenta todavía.
--
-- El CHECK exigía cuenta a toda tarjeta de débito. Como un correo de retiro
-- nombra la tarjeta pero nunca la cuenta, esa tarjeta no podía nacer de un
-- escaneo: quedaba como observación repetida —una llegó a 43 ocurrencias— sin
-- llegar nunca a ser nada.
--
-- La regla se mantiene para lo confirmado, que es donde importa: una tarjeta de
-- débito ya revisada por el usuario sí debe decir de qué cuenta gasta, porque
-- sin ella su consumo no baja ningún saldo. Lo que se permite es el estado
-- intermedio: detectada, sin confirmar y sin cuenta asignada, a la espera de
-- que el usuario la ate desde Bancos.

ALTER TABLE public.bank_cards
    DROP CONSTRAINT bank_cards_debit_requires_account;

ALTER TABLE public.bank_cards
    ADD CONSTRAINT bank_cards_debit_requires_account
    CHECK (
        card_type <> 'DEBIT'::bank_card_type
        OR account_id IS NOT NULL
        OR is_unconfirmed
    );
