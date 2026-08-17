-- Cada forma distinta en que se ha visto escrito un número, con sus partes
-- parseadas. Es lo que hace que el emparejamiento mejore solo con el uso: una
-- máscara nueva se resuelve una vez y queda aprendida.
CREATE TYPE bank_number_resolution AS ENUM ('EXACT', 'INFERRED', 'MANUAL', 'EXTERNAL', 'PENDING');

CREATE TABLE bank_number_observations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    raw               TEXT NOT NULL,           -- la cadena cruda, tal cual llegó
    prefix_digits     TEXT NOT NULL DEFAULT '',
    suffix_digits     TEXT NOT NULL DEFAULT '',
    total_length      SMALLINT,
    bin               TEXT,
    brand             TEXT,
    account_type_hint TEXT,                    -- AHO, CTE
    institution_hint  TEXT,                    -- nombre embebido en la cadena
    is_complete       BOOLEAN NOT NULL DEFAULT FALSE,

    account_id        UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
    card_id           UUID REFERENCES bank_cards(id) ON DELETE SET NULL,
    resolution        bank_number_resolution NOT NULL DEFAULT 'PENDING',
    occurrences       INTEGER NOT NULL DEFAULT 1,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,

    -- Una observación apunta a una cuenta o a una tarjeta, nunca a ambas.
    CONSTRAINT bank_number_observations_one_target
        CHECK (account_id IS NULL OR card_id IS NULL)
);

-- La misma cadena cruda se ve una sola vez por usuario: es la clave del
-- aprendizaje, `occurrences` cuenta cuántas veces reapareció.
CREATE UNIQUE INDEX bank_number_observations_owner_raw_uq
    ON bank_number_observations (owner_user_id, raw);

CREATE INDEX bank_number_observations_suffix_idx
    ON bank_number_observations (owner_user_id, suffix_digits) WHERE is_deleted = FALSE;
CREATE INDEX bank_number_observations_pending_idx
    ON bank_number_observations (owner_user_id, resolution) WHERE is_deleted = FALSE;

ALTER TABLE bank_number_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bank_number_observations"   ON bank_number_observations FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own bank_number_observations" ON bank_number_observations FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own bank_number_observations" ON bank_number_observations FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own bank_number_observations" ON bank_number_observations FOR DELETE USING (auth.uid() = owner_user_id);

-- La columna se declaró sin FK en el plan anterior, porque su destino no
-- existía todavía. Ahora sí.
ALTER TABLE financial_transactions
    ADD CONSTRAINT financial_transactions_bank_counterparty_observation_fkey
    FOREIGN KEY (bank_counterparty_observation_id)
    REFERENCES bank_number_observations(id) ON DELETE SET NULL;
