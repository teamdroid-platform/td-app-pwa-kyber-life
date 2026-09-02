-- Día en que empieza el mes para cada usuario, con un valor por ámbito.
--
-- Solo se guardan las excepciones: sin fila, el código aplica el defecto del
-- ámbito (22 en Finanzas, 1 en Compras). Por eso la columna no lleva DEFAULT,
-- que tendría que ser el mismo para los dos.

CREATE TABLE user_period_settings (
    owner_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scope           TEXT NOT NULL CHECK (scope IN ('FINANCIAL', 'MARKET')),
    cycle_start_day SMALLINT NOT NULL CHECK (cycle_start_day BETWEEN 1 AND 31),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    PRIMARY KEY (owner_user_id, scope)
);

ALTER TABLE user_period_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own user_period_settings"   ON user_period_settings FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own user_period_settings" ON user_period_settings FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own user_period_settings" ON user_period_settings FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own user_period_settings" ON user_period_settings FOR DELETE USING (auth.uid() = owner_user_id);
