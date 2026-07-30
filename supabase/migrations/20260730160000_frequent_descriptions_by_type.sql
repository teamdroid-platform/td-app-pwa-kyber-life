-- Most frequent transaction descriptions, top N **per transaction type**, in a
-- single call.
--
-- The previous version answered for one type, so the capture flow issued a new
-- request every time the user tapped a different type chip — and each request
-- paid its own auth round-trip. The database was never the cost (the aggregate
-- runs in under a millisecond); the requests were. Ranking every type in one
-- pass lets the client fetch once and switch types instantly.
--
-- `type` and `status` are enums, so they are compared and returned as text.
DROP FUNCTION IF EXISTS get_frequent_financial_descriptions(uuid, text, integer);

CREATE OR REPLACE FUNCTION get_frequent_financial_descriptions(
    p_user_id uuid,
    p_limit integer DEFAULT 5
)
RETURNS TABLE (type text, description text, uses bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH counted AS (
        SELECT
            t.type::text AS type,
            t.description AS description,
            COUNT(*) AS uses,
            MAX(t.date) AS last_used
        FROM financial_transactions t
        WHERE t.owner_user_id = p_user_id
          AND btrim(t.description) <> ''
          -- Discarded movements shouldn't shape today's suggestions.
          AND t.status::text NOT IN ('DELETED', 'ARCHIVED', 'REJECTED')
        GROUP BY t.type, t.description
    ),
    ranked AS (
        SELECT
            c.type,
            c.description,
            c.uses,
            -- Most used first; ties broken by the most recent use.
            ROW_NUMBER() OVER (
                PARTITION BY c.type
                ORDER BY c.uses DESC, c.last_used DESC
            ) AS position
        FROM counted c
    )
    SELECT r.type, r.description, r.uses
    FROM ranked r
    WHERE r.position <= GREATEST(p_limit, 1)
    ORDER BY r.type, r.uses DESC;
$$;
