-- Configuración de balances: qué balance se muestra por defecto y qué bancos,
-- cuentas y tarjetas alimentan los dos balances de periodo.
--
-- Solo se guardan las EXCEPCIONES. Sin ninguna fila el usuario tiene el
-- comportamiento por defecto: modo PERIOD y todo incluido. Esa es la razón de
-- que una cuenta creada mañana por el escáner entre sola al balance de su banco.

CREATE TABLE financial_balance_settings (
    owner_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    default_mode  TEXT NOT NULL DEFAULT 'PERIOD'
                  CHECK (default_mode IN ('TOTAL', 'PERIOD', 'PERIOD_WITH_CREDIT')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE financial_balance_scope_rules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_type   TEXT NOT NULL CHECK (target_type IN ('INSTITUTION', 'ACCOUNT', 'CARD')),
    -- Sin FK a propósito: apunta a bank_institutions, bank_accounts o
    -- bank_cards según target_type. Una regla que quede apuntando a algo
    -- borrado se ignora al resolver, y no afecta a ningún cálculo.
    target_id     UUID NOT NULL,
    included      BOOLEAN NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT financial_balance_scope_rules_target_uq
        UNIQUE (owner_user_id, target_type, target_id)
);

CREATE INDEX financial_balance_scope_rules_owner_idx
    ON financial_balance_scope_rules (owner_user_id);

ALTER TABLE financial_balance_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own financial_balance_settings"   ON financial_balance_settings FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own financial_balance_settings" ON financial_balance_settings FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own financial_balance_settings" ON financial_balance_settings FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own financial_balance_settings" ON financial_balance_settings FOR DELETE USING (auth.uid() = owner_user_id);

ALTER TABLE financial_balance_scope_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own financial_balance_scope_rules"   ON financial_balance_scope_rules FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own financial_balance_scope_rules" ON financial_balance_scope_rules FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own financial_balance_scope_rules" ON financial_balance_scope_rules FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own financial_balance_scope_rules" ON financial_balance_scope_rules FOR DELETE USING (auth.uid() = owner_user_id);
