-- Módulo Bancos: enums y tabla de instituciones emisoras.
--
-- La frontera con el módulo financiero es el rol, no el nombre:
-- financial_institutions significa COMERCIO y conserva sus filas;
-- bank_institutions significa EMISOR. Un banco puede existir en las dos
-- tablas a la vez, unido por financial_institution_id.

CREATE TYPE bank_institution_kind AS ENUM ('BANK', 'COOPERATIVE', 'WALLET', 'OTHER');
CREATE TYPE bank_account_type     AS ENUM ('CHECKING', 'SAVINGS', 'CASH', 'INVESTMENT');
CREATE TYPE bank_account_status   AS ENUM ('ACTIVE', 'CLOSED');
CREATE TYPE bank_card_type        AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE bank_card_status      AS ENUM ('ACTIVE', 'BLOCKED', 'EXPIRED', 'CLOSED');
CREATE TYPE bank_snapshot_source  AS ENUM ('MANUAL', 'SCAN', 'INITIAL');
CREATE TYPE bank_statement_status AS ENUM ('OPEN', 'CLOSED', 'PAID', 'OVERDUE');

CREATE TABLE bank_institutions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name                     TEXT NOT NULL,
    short_name               TEXT,
    kind                     bank_institution_kind NOT NULL DEFAULT 'BANK',
    logo_url                 TEXT,
    color                    TEXT,
    country                  TEXT DEFAULT 'EC',
    -- Puente al comercio gemelo: un retiro en Banco del Austro conserva su
    -- comercio y además sabe su banco.
    financial_institution_id UUID REFERENCES financial_institutions(id) ON DELETE SET NULL,
    is_unconfirmed           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    is_deleted               BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX bank_institutions_owner_name_uq
    ON bank_institutions (owner_user_id, lower(name)) WHERE is_deleted = FALSE;

ALTER TABLE bank_institutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bank_institutions"   ON bank_institutions FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own bank_institutions" ON bank_institutions FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own bank_institutions" ON bank_institutions FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own bank_institutions" ON bank_institutions FOR DELETE USING (auth.uid() = owner_user_id);

-- Duplica al lado nuevo los comercios que en realidad son emisores, dejando
-- intacta la fila original: hay retiros cuyo comercio ES el banco.
INSERT INTO bank_institutions (owner_user_id, name, kind, logo_url, financial_institution_id)
SELECT fi.owner_user_id,
       fi.name,
       CASE
           WHEN fi.name ILIKE '%coop%' OR fi.name ILIKE '%COAC%' THEN 'COOPERATIVE'::bank_institution_kind
           WHEN fit.label = 'Billetera Digital' OR fi.name ILIKE '%deuna%' THEN 'WALLET'::bank_institution_kind
           ELSE 'BANK'::bank_institution_kind
       END,
       fi.logo_url,
       fi.id
FROM financial_institutions fi
LEFT JOIN financial_institution_types fit ON fit.id = fi.institution_type_id
WHERE fit.label IN ('Institución Financiera', 'Billetera Digital')
ON CONFLICT DO NOTHING;
