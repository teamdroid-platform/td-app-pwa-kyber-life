-- Cortes de saldo y estados de cuenta.
--
-- El escaneo solo ve lo que llega por correo o SMS, así que la suma de
-- movimientos deriva del saldo real. El corte manual permite re-anclar sin
-- reescribir historia: saldo = último corte + movimientos posteriores.
--
-- En los estados de cuenta se guardan dos cifras a propósito: computed_amount
-- es lo que sumó la app, total_amount lo que declara el banco. La diferencia
-- entre ambas mide cuánto se le escapó al escaneo ese mes.

CREATE TABLE bank_account_balance_snapshots (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id    UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    balance       NUMERIC(14,2) NOT NULL,
    as_of         TIMESTAMPTZ NOT NULL,
    source        bank_snapshot_source NOT NULL DEFAULT 'MANUAL',
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    is_deleted    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX bank_snapshots_account_asof_idx
    ON bank_account_balance_snapshots (account_id, as_of DESC) WHERE is_deleted = FALSE;

CREATE TABLE bank_card_statements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id         UUID NOT NULL REFERENCES bank_cards(id) ON DELETE CASCADE,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    due_date        DATE NOT NULL,
    computed_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_amount    NUMERIC(14,2),
    paid_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    status          bank_statement_status NOT NULL DEFAULT 'OPEN',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT bank_card_statements_period_order CHECK (period_end >= period_start)
);

CREATE UNIQUE INDEX bank_card_statements_card_period_uq
    ON bank_card_statements (card_id, period_start) WHERE is_deleted = FALSE;

ALTER TABLE bank_account_balance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bank_snapshots"   ON bank_account_balance_snapshots FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own bank_snapshots" ON bank_account_balance_snapshots FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own bank_snapshots" ON bank_account_balance_snapshots FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own bank_snapshots" ON bank_account_balance_snapshots FOR DELETE USING (auth.uid() = owner_user_id);

ALTER TABLE bank_card_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bank_card_statements"   ON bank_card_statements FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own bank_card_statements" ON bank_card_statements FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own bank_card_statements" ON bank_card_statements FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own bank_card_statements" ON bank_card_statements FOR DELETE USING (auth.uid() = owner_user_id);
