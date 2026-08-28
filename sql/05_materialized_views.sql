DROP MATERIALIZED VIEW IF EXISTS freelancer_earnings;

CREATE MATERIALIZED VIEW freelancer_earnings AS
SELECT
    f.id AS freelancer_id,
    f.name AS freelancer_name,
    COUNT(c.id) AS completed_contracts,
    COALESCE(SUM(c.budget), 0) AS total_earnings
FROM freelancers f
LEFT JOIN contracts c
    ON c.freelancer_id = f.id
   AND c.status = 'COMPLETED'
GROUP BY f.id, f.name;

CREATE UNIQUE INDEX idx_freelancer_earnings_id
ON freelancer_earnings (freelancer_id);

CREATE OR REPLACE FUNCTION refresh_freelancer_earnings()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY freelancer_earnings;
END;
$$;
