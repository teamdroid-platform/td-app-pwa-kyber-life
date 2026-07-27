-- Performance indexes for the financial module.
--
-- Every dashboard/list query follows the same shape:
--   WHERE owner_user_id = ? [AND date BETWEEN ? AND ?] ORDER BY date DESC
-- but the existing indexes are single-column (owner_user_id / date / status),
-- so Postgres filters by owner and then sorts. The composite indexes below turn
-- that into a range scan with no sort step.
--
-- Note: created without CONCURRENTLY because migrations run inside a
-- transaction. At the current table sizes the exclusive lock is negligible; for
-- large tables, run these manually with CONCURRENTLY outside a transaction.

-- ── financial_transactions ────────────────────────────────────────────────

-- Main access pattern (dashboards, lists, exports).
CREATE INDEX IF NOT EXISTS idx_ft_owner_date
    ON financial_transactions (owner_user_id, date DESC);

-- The dashboards only ever read "active" transactions, so a partial index keeps
-- the hot set small and skips the discarded statuses entirely.
CREATE INDEX IF NOT EXISTS idx_ft_owner_date_active
    ON financial_transactions (owner_user_id, date DESC)
    WHERE status IN ('CONFIRMED', 'REVIEWED', 'MANUAL');

-- Foreign keys with no index: used by the category/institution breakdowns, the
-- list filters, and the per-entity counts, reassignment and merge operations.
CREATE INDEX IF NOT EXISTS idx_ft_category
    ON financial_transactions (category_id)
    WHERE category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ft_institution
    ON financial_transactions (institution_id)
    WHERE institution_id IS NOT NULL;

-- ── financial_scanner_transactions ────────────────────────────────────────
-- This table is also written by the external scanner workflow, and its live
-- schema has drifted from the initial migration (which declared `extracted_date`
-- while the app reads `date`). Create each index only if its column is actually
-- there, so this migration is safe against either shape.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'financial_scanner_transactions'
          AND column_name = 'date'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_fst_owner_date
            ON financial_scanner_transactions (owner_user_id, date);
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'financial_scanner_transactions'
          AND column_name = 'extracted_date'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_fst_owner_extracted_date
            ON financial_scanner_transactions (owner_user_id, extracted_date);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'financial_scanner_transactions'
          AND column_name = 'execution_id'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_fst_execution
            ON financial_scanner_transactions (execution_id)
            WHERE execution_id IS NOT NULL;
    END IF;
END $$;
