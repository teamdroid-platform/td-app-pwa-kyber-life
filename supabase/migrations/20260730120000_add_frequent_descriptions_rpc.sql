-- Most frequent transaction descriptions for a user, per transaction type.
--
-- Feeds the one-tap suggestions in the capture flow, where the description is
-- required: answering it should cost a tap, not a sentence.
--
-- Aggregated in the database on purpose. Counting client-side would mean
-- transferring the whole history on every visit to the first step, and the
-- suggestions are only five rows.
CREATE OR REPLACE FUNCTION get_frequent_financial_descriptions(
    p_user_id uuid,
    p_type text DEFAULT NULL,
    p_limit integer DEFAULT 5
)
RETURNS TABLE (description text, uses bigint) AS $$
BEGIN
    RETURN QUERY
    SELECT t.description, COUNT(*) AS uses
    FROM financial_transactions t
    WHERE t.owner_user_id = p_user_id
      AND t.description IS NOT NULL
      AND btrim(t.description) <> ''
      -- Deleted and archived movements shouldn't shape today's suggestions.
      AND (t.status IS NULL OR t.status NOT IN ('DELETED', 'ARCHIVED', 'REJECTED'))
      AND (p_type IS NULL OR t.type = p_type)
    GROUP BY t.description
    ORDER BY uses DESC, MAX(t.date) DESC
    LIMIT GREATEST(p_limit, 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- The aggregate scans one user's rows of one type; this is the index for it.
CREATE INDEX IF NOT EXISTS idx_ft_owner_type_description
    ON financial_transactions (owner_user_id, type)
    INCLUDE (description);
