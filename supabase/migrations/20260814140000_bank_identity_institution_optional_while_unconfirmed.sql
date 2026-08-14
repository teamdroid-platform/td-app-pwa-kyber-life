-- Una identidad recién detectada puede no saber todavía quién la emitió.
--
-- El emisor se deducía del comercio del movimiento, y eso solo funciona cuando
-- el comercio ES el banco (un retiro, una transferencia). En una compra el
-- correo lo manda el banco pero el comercio extraído es la tienda: «GOOGLE
-- *CHATGPT MOUNTAIN VIEW» no dice qué banco emitió la Mastercard 8361, así que
-- la tarjeta no podía crearse — y esas compras son la mayoría de los escaneos.
--
-- Se permite el mismo estado intermedio que ya se permite para la cuenta de una
-- tarjeta de débito: detectada, sin confirmar y sin emisor, a la espera de que
-- el usuario la asigne desde Bancos. Confirmarla sigue exigiendo emisor, porque
-- una identidad revisada que no dice de qué banco es no sirve para agrupar
-- nada. El efectivo mantiene su regla intacta: nunca tiene institución.

ALTER TABLE public.bank_cards
    ALTER COLUMN institution_id DROP NOT NULL;

ALTER TABLE public.bank_cards
    ADD CONSTRAINT bank_cards_institution_required_once_confirmed
    CHECK (institution_id IS NOT NULL OR is_unconfirmed);

ALTER TABLE public.bank_accounts
    DROP CONSTRAINT bank_accounts_cash_has_no_institution;

ALTER TABLE public.bank_accounts
    ADD CONSTRAINT bank_accounts_cash_has_no_institution
    CHECK (
        CASE
            WHEN account_type = 'CASH'::bank_account_type THEN institution_id IS NULL
            ELSE institution_id IS NOT NULL OR is_unconfirmed
        END
    );
