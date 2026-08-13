-- Cuentas y tarjetas del módulo Bancos.
--
-- En Ecuador la tarjeta de débito golpea el saldo de la cuenta a la que está
-- atada; la de crédito la emite la institución directo al cliente y no cuelga
-- de ninguna cuenta. Los CHECK hacen imposible escribir el estado inválido.

CREATE TABLE bank_accounts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    institution_id UUID REFERENCES bank_institutions(id) ON DELETE RESTRICT,
    name           TEXT NOT NULL,
    account_type   bank_account_type NOT NULL,
    last_four      TEXT,
    prefix_digits  TEXT,
    currency       TEXT NOT NULL DEFAULT 'USD',
    status         bank_account_status NOT NULL DEFAULT 'ACTIVE',
    is_unconfirmed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,

    -- El efectivo no tiene emisor; toda otra cuenta sí
    CONSTRAINT bank_accounts_cash_has_no_institution
        CHECK ((account_type = 'CASH') = (institution_id IS NULL))
);

CREATE UNIQUE INDEX bank_accounts_one_cash_per_owner
    ON bank_accounts (owner_user_id) WHERE account_type = 'CASH' AND is_deleted = FALSE;
CREATE INDEX bank_accounts_owner_lastfour_idx
    ON bank_accounts (owner_user_id, last_four) WHERE is_deleted = FALSE;

CREATE TABLE bank_cards (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES bank_institutions(id) ON DELETE RESTRICT,
    account_id     UUID REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    name           TEXT NOT NULL,
    card_type      bank_card_type NOT NULL,
    brand          TEXT,
    bin            TEXT,
    last_four      TEXT,
    prefix_digits  TEXT,
    currency       TEXT NOT NULL DEFAULT 'USD',
    credit_limit   NUMERIC(14,2),
    statement_day  SMALLINT CHECK (statement_day BETWEEN 1 AND 31),
    due_day        SMALLINT CHECK (due_day BETWEEN 1 AND 31),
    status         bank_card_status NOT NULL DEFAULT 'ACTIVE',
    is_unconfirmed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,

    -- El débito vive sobre una cuenta; el crédito lo emite la institución
    CONSTRAINT bank_cards_debit_requires_account
        CHECK (card_type <> 'DEBIT' OR account_id IS NOT NULL),
    CONSTRAINT bank_cards_credit_has_no_account
        CHECK (card_type <> 'CREDIT' OR account_id IS NULL),
    -- Solo el crédito tiene cupo y ciclo
    CONSTRAINT bank_cards_debit_has_no_credit_fields
        CHECK (card_type <> 'DEBIT'
               OR (credit_limit IS NULL AND statement_day IS NULL AND due_day IS NULL))
);

CREATE INDEX bank_cards_owner_lastfour_idx
    ON bank_cards (owner_user_id, last_four) WHERE is_deleted = FALSE;

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bank_accounts"   ON bank_accounts FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own bank_accounts" ON bank_accounts FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own bank_accounts" ON bank_accounts FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own bank_accounts" ON bank_accounts FOR DELETE USING (auth.uid() = owner_user_id);

ALTER TABLE bank_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bank_cards"   ON bank_cards FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own bank_cards" ON bank_cards FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own bank_cards" ON bank_cards FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own bank_cards" ON bank_cards FOR DELETE USING (auth.uid() = owner_user_id);
