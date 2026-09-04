# GigTask Project Overview
### Team 9
- **Anuj Sharma - 2026201046**
- **Nisarg Bhojani - 2026xxxxxx**
- **Srilatha Kanchamreddy - 2026xxxxxx**
- **Vishwanth Beereddy - 2026201024**

This repository is a full-stack benchmarking and data-modeling project for a gig marketplace. It combines:

- PostgreSQL for relational data, **ER(Entity Relation)** Diagram.
- MongoDB for geo-based worker lookup and review analytics
- Python scripts for generating realistic data using **Faker** library.
- SQL and MongoDB workflow files for benchmarking and performance comparison
- Docker-based setup for local database servers(PostgreSQL, MongoDB).

Goal: To model a gig platform where clients fund work, freelancers are located by proximity, and review/earnings analytics can be queried efficiently.

---

## Repository structure

```text
GigTask-P5/
├── .env.example                  # Sample environment config for local DBs
├── .env                          # Local runtime variables (not committed in source control)
├── docker-compose.yaml           # Starts MongoDB + Mongo Express + PostgreSQL
├── README.md                     # Original assignment README
├── data_generation/              # Python scripts that generate mock dataset rows
│   ├── gigreviews_seeder.py      # Generates review records for MongoDB
│   ├── mongo_seeder.py           # Generates worker location records for MongoDB
│   ├── postgres_seeder.py        # Generates large PostgreSQL dataset
│   └── requirements.txt          # Python dependencies
├── docs/                         # Design documents and ERD
│   └── relational_erd.png        # Database schema diagram
├── mongo/                        # MongoDB collection setup and workflow scripts
│   ├── 01_collections_and_indexes.js
│   ├── 02_workflow3_geonear.js
│   └── 03_workflow4_facet.js
├── performance/                  # Benchmarking results and query-plan explanations
│   ├── mongo_execution_stats.json
│   └── postgres_explain_analyzes.txt
├── sql/                          # Relational database schema and analytics SQL
│   ├── 01_schema_ddl.sql
│   ├── 02_indexes.sql
│   ├── 03_triggers_and_audits.sql
│   ├── 04_stored_procedures.sql
│   ├── 05_materialized_views.sql
│   └── 06_window_analytics.sql
└── README_PROJECT_OVERVIEW.md    # This documentation file
```

---

## 1) SQL folder: relational core of the platform

The `sql/` folder models the transactional backbone of a gig marketplace.

### `sql/01_schema_ddl.sql`
This file creates the core tables and enum types.

```sql
-- contract_status tracks the lifecycle of a paid gig:
-- FUNDED means money is reserved, IN_PROGRESS means work is ongoing,
-- and COMPLETED means the job is done and earnings are finalized.
CREATE TYPE contract_status AS ENUM ('FUNDED', 'IN_PROGRESS', 'COMPLETED');

-- Clients hold an escrow balance that is deducted when a gig is funded.
CREATE TABLE clients(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100),
    escrow_balance DECIMAL(10,2) CHECK (escrow_balance >= 0.00)
);

-- Each contract links a client to a freelancer and stores the amount budgeted.
CREATE TABLE contracts(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id),
    freelancer_id UUID REFERENCES freelancers(id),
    budget DECIMAL(10,2),
    status contract_status NOT NULL DEFAULT 'IN_PROGRESS',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Core idea:
- `clients` holds the financial account.
- `freelancers` represents workers.
- `contracts` is the business event: a client funds a freelancer for a job.
- `wallet_audit_logs` records every movement in the escrow balance.

### `sql/02_indexes.sql`
This ensures only one active contract can exist for a freelancer at a time.

```sql
-- One active contract per freelancer prevents double-booking the same worker.
CREATE UNIQUE INDEX idx_active_contract_freelancer
ON contracts (freelancer_id)
WHERE status = 'IN_PROGRESS';
```

Why it matters:
- The project is designed around concurrency and correctness.
- A freelancer should not appear to be assigned to two active jobs at once.

### `sql/03_triggers_and_audits.sql`
This file implements an audit trail so the escrow balance cannot be silently changed without a trace.

```sql
-- Trigger function that logs every escrow change after a balance update.
CREATE OR REPLACE FUNCTION log_escrow_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO wallet_audit_logs
        (id, client_id, amount_changed, action_type, balance_after)
    VALUES
        (
            gen_random_uuid(),
            NEW.id,
            NEW.escrow_balance - OLD.escrow_balance,
            (CASE
                WHEN NEW.escrow_balance > OLD.escrow_balance
                    THEN 'CREDIT'::audit_action_type
                ELSE 'DEBIT'::audit_action_type
            END),
            NEW.escrow_balance
        );

    RETURN NEW;
END;
$$;
```

This is important because:
- The trigger captures balance deltas automatically.
- It records whether the balance went up or down.
- It makes the audit log immutable and protects the integrity of financial history.

### `sql/04_stored_procedures.sql`
This is the core transactional workflow for funding a gig atomically.

```sql
-- fund_gig performs the business rule: client pays escrow, funds are validated,
-- and a new contract is created only if enough money exists.
CREATE OR REPLACE PROCEDURE fund_gig(
    p_client_id UUID,
    p_freelancer_id UUID,
    p_budget DECIMAL(10,2)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_balance NUMERIC(10,2);
BEGIN
    IF p_budget <= 0 THEN
        RAISE EXCEPTION 'Budget must be greater than zero';
    END IF;

    -- Lock the client row to avoid race conditions when multiple transactions
    -- try to spend from the same escrow balance at the same time.
    SELECT escrow_balance
    INTO v_balance
    FROM clients
    WHERE id = p_client_id
    FOR UPDATE;

    IF v_balance < p_budget THEN
        RAISE EXCEPTION 'Insufficient escrow balance';
    END IF;

    UPDATE clients
    SET escrow_balance = escrow_balance - p_budget
    WHERE id = p_client_id;

    INSERT INTO contracts (id, client_id, freelancer_id, budget, status)
    VALUES (gen_random_uuid(), p_client_id, p_freelancer_id, p_budget, 'FUNDED');
END;
$$;
```

This procedure enforces the financial rules correctly and prevents a common distributed-system problem: double-spending the same escrow wallet.

### `sql/05_materialized_views.sql`
This precomputes freelancer earnings for fast reporting.

```sql
-- A materialized view stores aggregate results physically for rapid reads.
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
```

The project uses this pattern for dashboards and summaries where exact real-time freshness is less important than fast read performance.

### `sql/06_window_analytics.sql`
This file contains the high-value analytics queries for Workflow 2.

```sql
-- Workflow 2 Part A:
-- Sum revenue by day and apply a 7-day rolling average.
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
```

This uses window functions to smooth out trends without extra table structures. It is one of the most important analytical patterns in the repository.

```sql
-- Workflow 2 Part B:
-- Revenue per freelancer, ranked using DENSE_RANK so tied totals share rank.
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
```

This gives a leaderboard-like result without gaps in ranking, which is useful for reward or leaderboards.

---

## 2) MongoDB folder: geo and review workflows

The `mongo/` folder contains scripts that operate on a database called `GigTask`.

### `mongo/01_collections_and_indexes.js`
This is the base setup file. It creates collections and indexes used by the app workflows.

```js
// A 2dsphere index is required for MongoDB geospatial queries like nearest-location lookup.
db.WorkerLocations.createIndex({ location: "2dsphere" });

// Expire old worker location snapshots after 2 hours to keep the dataset fresh.
db.WorkerLocations.createIndex({ created_at: 1 }, { expireAfterSeconds: 7200 });

// Composite index speeds up analytics on review records by rating and recency.
db.GigReviews.createIndex({ rating: 1, created_at: -1 });
```

This creates the performance foundation for two important workflows:
- nearest freelancer detection
- review analytics by rating and skill

### `mongo/02_workflow3_geonear.js`
This script performs nearest-worker lookup using geospatial query primitives.

```js
// $geoNear finds points near a target location and optionally filters them.
const nearestFreelancer = db.WorkerLocations.aggregate([
    {
        $geoNear: {
            near: { type: "Point", coordinates: [80.2707, 13.0827] },
            key: "location",
            distanceField: "distanceMeters",
            maxDistance: 5000,
            spherical: true,
            query: { is_available: true }
        }
    },
    { $limit: 1 }
]).toArray();
```

This is the canonical “find the closest available freelancer to a job site” pattern. It is ideal for dispatching a worker near a physical work site.

### `mongo/03_workflow4_facet.js`
This script computes several analytics at once in one pipeline using `$facet`.

```js
// $facet runs multiple aggregation pipelines in parallel on the same input set.
const workflow4Pipeline = [
    { $match: { rating: { $gte: 1, $lte: 5 }, created_at: { $exists: true } } },
    {
        $facet: {
            rating_distribution: [
                { $group: { _id: "$rating", count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ],
            skill_tag_frequency: [
                { $unwind: "$skill_tags" },
                { $group: { _id: "$skill_tags", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ],
            overall_average_rating: [
                { $group: { _id: null, average_rating: { $avg: "$rating" } } }
            ]
        }
    }
];
```

This is a very efficient way to compute:
- rating distribution
- top skill tags
- average rating

all from the same collection in one pass.

---

## 3) data_generation folder: synthetic dataset generation

This folder creates realistic sample data at scale so the benchmarking workflows can be tested against meaningful volumes.

### `environment variables`
```
# PostgreSQL Database Configuration
PGHOST=host
PGPORT=5432
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=GigTask

# MongoDB Database Configuration
MONGO_URI=mongodb://user:password@host:27017/
```

### `data_generation/postgres_seeder.py`
This script seeds PostgreSQL with 50,000 clients, 50,000 freelancers, and 100,000 contracts/audit rows.

```python
# Batching is essential when inserting tens of thousands of rows:
# it keeps memory usage low and reduces transaction overhead.
while inserted < to_insert:
    batch = []
    for _ in range(batch_count):
        c_id = str(uuid.uuid4())
        name = (fake.company() if random.random() < 0.6 else fake.name())[:100]
        balance = Decimal(str(round(random.uniform(500.00, 50000.00), 2)))
        batch.append((c_id, name, balance))

    execute_values(cursor, insert_query, batch, page_size=batch_size)
    inserted += batch_count
```

This script is the dataset engine behind the SQL performance work. It generates enough data to make query planning and indexing decisions meaningful.

### `data_generation/mongo_seeder.py`
This creates worker location records that are suitable for geospatial nearest-neighbor tests.

```python
# Each worker gets a Point location with longitude and latitude.
# MongoDB stores spatial data in GeoJSON format for $geoNear and $near queries.
document = {
    "worker_id": fake.random_int(min=1, max=100000),
    "location": {
        "type": "Point",
        "coordinates": [longitude, latitude]
    },
    "created_at": datetime.now(timezone.utc),
    "is_available": fake.boolean()
}
```

This dataset supports the nearest available freelancer workflow.

### `data_generation/gigreviews_seeder.py`
This seeds review records with skill tags and ratings in MongoDB.

```python
# Reviews are large in number and varied in skill mix, which makes the
# aggregation pipeline realistic and helps benchmark facet queries.
document = {
    "freelancer_id": fake.random_int(min=1, max=100000),
    "rating": fake.random_int(min=1, max=5),
    "skill_tags": random.sample(SKILLS, number_of_skills),
    "created_at": datetime.now(timezone.utc)
}
```

This helps measure analytics like rating distribution and top skill tags.

---

## 4) performance folder: benchmarking and query-plan analysis

This folder stores the results of EXPLAIN ANALYZE and other benchmark artifacts.

### `performance/postgres_explain_analyzes.txt`
This file is extremely important because it documents why the planner chooses either an index scan or a sequential scan under certain conditions.

The key lesson is that a query with a large proportion of matching rows may still be faster with a sequential scan than with an index.

```text
-- Query A and B both scan most of the contracts table.
-- With 56% of rows matching status = 'COMPLETED', Postgres correctly prefers
-- Seq Scan because random index lookups would be more expensive than a single pass.
```

This is a great example of cost-based optimizer behavior: not every index is beneficial for every query shape.

### `performance/mongo_execution_stats.json`
This file stores MongoDB execution metrics for the geo and aggregation workflows. It helps compare index usage and runtime behavior across different queries.

---

## 5) docs folder: visual database schema

The `docs/` folder contains the relational ERD image.

- `docs/relational_erd.png` shows the main entities and their relationships.
- It helps developers understand how clients, freelancers, contracts, and audit logs are connected.

The ERD visually summarizes the same information represented in `sql/01_schema_ddl.sql`.

---

## 6) What the project tries to solve

This repository demonstrates several practical database concerns:

- Financial integrity with escrow and audit logs
- Transaction safety with row locking and validation rules
- Efficient analytics using SQL window functions
- Materialized reporting views for read-heavy workloads
- Geospatial search with MongoDB for proximity-based freelancer matching
- Multi-dimensional aggregation with MongoDB `$facet`
- Benchmarking and query-planning reasoning with EXPLAIN ANALYZE

---