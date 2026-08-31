-- Partial covering index supporting this workflow's analytics queries.
-- Only indexes COMPLETED contracts (the subset Workflow 2 cares about) and
-- includes budget so point-lookup queries (e.g. one freelancer's contract
-- history) are index-only. See performance/postgres_explain_analyzes.txt
-- for why the two aggregate queries below still choose a sequential scan
-- (56% of contracts are COMPLETED, past that selectivity Postgres correctly
-- prefers Seq Scan) while a selective single-freelancer lookup uses this
-- index directly.
CREATE INDEX IF NOT EXISTS idx_contracts_completed_analytics
ON contracts (status, freelancer_id, created_at)
INCLUDE (budget)
WHERE status = 'COMPLETED';

-- Workflow 2 Part A: platform-wide daily revenue with a 7-day moving average
WITH daily_revenue AS (
    SELECT
        created_at::date AS revenue_date,
        SUM(budget) AS daily_total
    FROM contracts
    WHERE status = 'COMPLETED'
    GROUP BY created_at::date
)
SELECT
    revenue_date,
    daily_total,
    ROUND(
        AVG(daily_total) OVER (
            ORDER BY revenue_date
            ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        ),
    2) AS moving_avg_7day
FROM daily_revenue
ORDER BY revenue_date;

-- Workflow 2 Part B: revenue per freelancer, ranked with DENSE_RANK so tied
-- earners share a rank instead of skipping positions
WITH freelancer_revenue AS (
    SELECT
        f.id AS freelancer_id,
        f.name AS freelancer_name,
        COUNT(c.id) AS completed_contracts,
        COALESCE(SUM(c.budget), 0) AS total_revenue
    FROM freelancers f
    JOIN contracts c
        ON c.freelancer_id = f.id
       AND c.status = 'COMPLETED'
    GROUP BY f.id, f.name
)
SELECT
    freelancer_id,
    freelancer_name,
    completed_contracts,
    total_revenue,
    DENSE_RANK() OVER (ORDER BY total_revenue DESC) AS revenue_rank
FROM freelancer_revenue
ORDER BY revenue_rank, freelancer_name
LIMIT 100;
