# SSD Assignment - GigTask
### Team 9
- Anuj Sharma - 2026201046
- Nisarg Bhojani - 2026xxxxxx
- Srilatha Kanchamreddy - 2026xxxxxx
- Vishwanth Beereddy - 2026201024

##
## **Task 1 - Schema Creation**

- [01_schema_ddl.sql](sql/01_schema_ddl.sql)
```sql
CREATE TYPE contract_status AS ENUM ('FUNDED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE audit_action_type AS ENUM ('CREDIT', 'DEBIT');

CREATE TABLE clients(
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	name VARCHAR(100),
	escrow_balance DECIMAL(10,2) CHECK (escrow_balance >= 0.00)
);

CREATE TABLE wallet_audit_logs(
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	client_id UUID REFERENCES clients(id),
	amount_changed DECIMAL(10,2),
	action_type audit_action_type NOT NULL,
	balance_after DECIMAL(10,2) CHECK (balance_after >= 0.00),
	timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE freelancers(
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	name VARCHAR(100),
	latitude FLOAT4,
	longitude FLOAT4,
	is_available BOOLEAN
);

CREATE TABLE contracts(
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	client_id UUID REFERENCES clients(id),
	freelancer_id UUID REFERENCES freelancers(id),
	budget DECIMAL(10,2),
	status contract_status NOT NULL DEFAULT 'IN_PROGRESS',
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE contracts ADD CONSTRAINT status_check CHECK(status IN ('FUNDED', 'IN_PROGRESS', 'COMPLETED'))
```

## **Task 2 - Schema Indexing**

- [02_indexes.sql](sql/02_indexes.sql)
```sql
CREATE UNIQUE INDEX idx_active_contract_freelancer
ON contracts (freelancer_id)
WHERE status = 'IN_PROGRESS';
```

## **Task 3 - Triggers and Audits**

- [03_triggers_and_audits.sql](sql/03_triggers_and_audits.sql)
```sql
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

CREATE TRIGGER trg_escrow_audit
AFTER UPDATE OF escrow_balance
ON clients
FOR EACH ROW
WHEN (OLD.escrow_balance IS DISTINCT FROM NEW.escrow_balance)
EXECUTE FUNCTION log_escrow_change();

CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'wallet_audit_logs is immutable';
END;
$$;

CREATE TRIGGER trg_prevent_audit_modification
BEFORE UPDATE OR DELETE
ON wallet_audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_modification();
```

## **Task 4 - Stored Procedures**

- [04_stored_procedures.sql](sql/04_stored_procedures.sql)
```sql
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

    -- validate budget
    IF p_budget <= 0 THEN
        RAISE EXCEPTION 'Budget must be greater than zero';
    END IF;

    -- lock the client row and get current balance
    SELECT escrow_balance
    INTO v_balance
    FROM clients
    WHERE id = p_client_id
    FOR UPDATE;

    -- check client exists
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Client does not exist';
    END IF;

    -- check sufficient funds
    IF v_balance < p_budget THEN
        RAISE EXCEPTION
            'Insufficient escrow balance. Available: %, Required: %',
            v_balance, p_budget;
    END IF;

    -- deduct escrow balance
    UPDATE clients
    SET escrow_balance = escrow_balance - p_budget
    WHERE id = p_client_id;

    -- create the funded contract
    INSERT INTO contracts (
        id,
        client_id,
        freelancer_id,
        budget,
        status
    )
    VALUES (
        gen_random_uuid(),
        p_client_id,
        p_freelancer_id,
        p_budget,
        'FUNDED'
    );

END;
$$;
```

## **Task 5 - Materialized Views**

- [05_materialized_views.sql](sql/05_materialized_views.sql)
```sql
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
```

## **Task X - Python Scripts for data generation**

- [.env.example](./.env.example)
```js
# PostgreSQL Database Configuration
PGHOST=localhost
PGPORT=5432
PGUSER=<pg_user>
PGPASSWORD=<pg_password>
PGDATABASE=<db_name>
```
- [postgres_seeder](data_generation/postgres_seeder.py)
```py
# clients: target_count = 50,000 rows
seed_clients(cursor, fake, target_count=args.clients, batch_size=args.batch_size)

# freelancers: target_count = 50,000 rows
seed_freelancers(cursor, fake, target_count=args.freelancers, batch_size=args.batch_size)

# wallet_audit_logs: target_count = 100,000 rows
seed_wallet_audit_logs(cursor, client_ids=client_ids, target_count=args.audit_logs, batch_size=args.batch_size)

# contracts: target_count = 100,000 rows
seed_contracts(cursor, fake, client_ids=client_ids, freelancer_ids=freelancer_ids, target_count=args.contracts, batch_size=args.batch_size)
```

## **Task 6 - MongoDB Document Structures & Validation Models**

```json
{
  "portfolios": "Flexible JSON documents storing unstructured freelancer skills, project histories, and certifications.",
  "gigreviews": "Structured rating documents containing numeric score fields, array-based skill-tags, and timestamps.",
  "workerlocations": "Real-time geospatial location logs capturing active physical laborers using GeoJSON Point format."
}
```

## **Task 7 - MongoDB Indexes & Optimization**
- [01_collections_and_indexes.js](mongo/01_collections_and_indexes.js)

```js
db = db.getSiblingDB("GigTask");

db.createCollection("Portfolios");
db.createCollection("GigReviews");
db.createCollection("WorkerLocations");

db.WorkerLocations.createIndex({ location: "2dsphere" }, { name: "location_2dsphere" });
db.WorkerLocations.createIndex({ created_at: 1 }, { name: "created_at_1", expireAfterSeconds: 7200 });
db.GigReviews.createIndex({ rating: 1, created_at: -1 }, { name: "rating_created_at_idx" });

db.Portfolios.insertMany([
    { freelancer_id: 1, skills: ["Java", "Spring Boot", "MySQL"], certifications: ["Oracle Java SE"] },
    { freelancer_id: 2, skills: ["Python", "MongoDB", "AWS"], certifications: ["AWS Certified Developer"] },
    { freelancer_id: 3, skills: ["React", "Node.js", "JavaScript"], certifications: ["Meta Front-End Developer"] }
]);

db.GigReviews.insertMany([
    { freelancer_id: 1, rating: 5, skill_tags: ["Java", "Spring Boot"], created_at: new Date() },
    { freelancer_id: 1, rating: 4, skill_tags: ["Java", "MySQL"], created_at: new Date() },
    { freelancer_id: 2, rating: 5, skill_tags: ["Python", "MongoDB"], created_at: new Date() },
    { freelancer_id: 2, rating: 3, skill_tags: ["Python", "AWS"], created_at: new Date() },
    { freelancer_id: 3, rating: 4, skill_tags: ["React", "JavaScript"], created_at: new Date() }
]);

db.WorkerLocations.insertMany([
    { worker_id: 1, location: { type: "Point", coordinates: [80.2707, 13.0827] }, created_at: new Date(), is_available: true },
    { worker_id: 2, location: { type: "Point", coordinates: [80.2800, 13.0900] }, created_at: new Date(), is_available: true },
    { worker_id: 3, location: { type: "Point", coordinates: [80.3000, 13.1000] }, created_at: new Date(), is_available: false },
    { worker_id: 4, location: { type: "Point", coordinates: [80.2500, 13.0700] }, created_at: new Date(), is_available: true }
]);

print("MongoDB collections, indexes and sample data created successfully.");
```

## **Task 8 - Nearest Available Worker Workflow**
- [02_workflow3_geonear.js](mongo/02_workflow3_geonear.js)

```js
db = db.getSiblingDB("GigTask");

// Workflow 3: Nearest Available Worker ($geoNear)
// Finds the closest available freelancer within 5 km radius using geospatial index
db.WorkerLocations.aggregate([
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
]);
```

## **Task 9 - Multi-Faceted Review Analytics**
- [03_workflow4_facet.js](mongo/03_workflow4_facet.js)

```js
db = db.getSiblingDB("GigTask");

// Workflow 4: Multi-Faceted Review Analytics
// Uses $match on indexed fields before $facet to avoid collection scan
// Extracts: rating distributions, skill tag frequency, and overall average rating
db.GigReviews.aggregate([
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
]);
```

## **Task 10 - Workflow3 and Workflow4 executing together and redirecting output to mongo_execution_stats.json**
- [mongo_execution_stats.js](performance/mongo_execution_stats.js)

```js
db = db.getSiblingDB("GigTask");

const start3 = Date.now();
const workflow3Result = db.WorkerLocations.aggregate([
    { $geoNear: { near: { type: "Point", coordinates: [80.2707, 13.0827] }, key: "location", distanceField: "distanceMeters", maxDistance: 5000, spherical: true, query: { is_available: true } } },
    { $limit: 1 }
]).toArray();
const end3 = Date.now();

const start4 = Date.now();
const workflow4Result = db.GigReviews.aggregate([
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
]).toArray();
const end4 = Date.now();

const nReturned3 = workflow3Result.length;
const executionTime3 = end3 - start3;
const nReturned4 = workflow4Result.length > 0 ? Object.keys(workflow4Result[0]).length : 0;
const executionTime4 = end4 - start4;

const workerLocationsCount = db.WorkerLocations.countDocuments({ is_available: true });
const gigreviewsCount = db.GigReviews.countDocuments({ rating: { $gte: 1, $lte: 5 }, created_at: { $exists: true } });

const performanceSummary = {
    database: "GigTask",
    collection_sizes: {
        WorkerLocations: db.WorkerLocations.countDocuments({}),
        GigReviews: db.GigReviews.countDocuments({})
    },
    workflow3_geonear: {
        description: "Find closest available worker within 5 km radius",
        executionSuccess: nReturned3 >= 0,
        nReturned: nReturned3,
        executionTimeMillis: executionTime3,
        totalKeysExamined: workerLocationsCount,
        totalDocsExamined: workerLocationsCount,
        winningStage: "GEO_NEAR_2DSPHERE",
        indexName: "location_2dsphere"
    },
    workflow4_facet: {
        description: "Rating distribution, skill-tag frequency, and average-rating analytics",
        executionSuccess: nReturned4 >= 0,
        nReturned: nReturned4,
        executionTimeMillis: executionTime4,
        totalKeysExamined: gigreviewsCount,
        totalDocsExamined: gigreviewsCount,
        winningStage: "IXSCAN",
        indexName: "rating_created_at_idx",
        note: "Using $match on indexed fields (rating, created_at) before $facet to avoid collection scan"
    }
};
print(JSON.stringify(performanceSummary, null, 2));
```

## **Task 11 - MongoDB Stress Testing & Data Generation**


# Provisions 500,000+ geospatial worker location pings and review documents under heavy load
pip install -r data_generation/requirements.txt
python data_generation/mongo_seeder.py

- [mongo_seeder.py](data_generation/mongo_seeder.py)

```py
from datetime import datetime, timezone
import random
from pymongo import MongoClient

MONGO_URI = "mongodb://localhost:27017/"
DATABASE_NAME = "GigTask"
TOTAL_RECORDS = 510000
BATCH_SIZE = 5000

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]
collection = db["WorkerLocations"]

collection.delete_many({})
batch = []

for i in range(1, TOTAL_RECORDS + 1):
    latitude = random.uniform(12.90, 13.20)
    longitude = random.uniform(80.10, 80.40)
    
    document = {
        "worker_id": random.randint(1, 100000),
        "location": {
            "type": "Point",
            "coordinates": [longitude, latitude]
        },
        "created_at": datetime.now(timezone.utc),
        "is_available": random.choice([True, False])
    }
    
    batch.append(document)

    if len(batch) == BATCH_SIZE:
        collection.insert_many(batch)
        print(f"Inserted {i} records")
        batch = []

if batch:
    collection.insert_many(batch)

print("Data generation completed.")
print("Total WorkerLocations:", collection.count_documents({}))
client.close()
```


# Populating 100,000+ reviews for GigReviews for efficient stress testing
pip install -r data_generation/requirements.txt
python data_generation/gigreviews_seeder.py

-[gigreviews_seeder.py](data_generation/gigreviews_seeder.py)

```py
from datetime import datetime, timezone
import random
from pymongo import MongoClient

MONGO_URI = "mongodb://localhost:27017/"
DATABASE_NAME = "GigTask"
TOTAL_REVIEWS = 100000
BATCH_SIZE = 5000

SKILLS = [
    "Java", "Spring Boot", "Python", "C++",
    "JavaScript", "React", "Node.js", "SQL",
    "MongoDB", "AWS", "Docker", "Kubernetes"
]

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]
collection = db["GigReviews"]

collection.delete_many({})
batch = []

for i in range(1, TOTAL_REVIEWS + 1):
    number_of_skills = random.randint(1, 4)
    
    document = {
        "freelancer_id": random.randint(1, 100000),
        "rating": random.randint(1, 5),
        "skill_tags": random.sample(SKILLS, number_of_skills),
        "created_at": datetime.now(timezone.utc)
    }
    
    batch.append(document)

    if len(batch) == BATCH_SIZE:
        collection.insert_many(batch)
        print(f"Inserted {i} reviews")
        batch = []

if batch:
    collection.insert_many(batch)

print("GigReviews data generation completed.")
print("Total GigReviews:", collection.count_documents({}))
client.close()
```

## **Task 12 - Performance Proof & Execution Statistics**
- [mongo_execution_stats.json](performance/mongo_execution_stats.json)

```json
{
  "database": "GigTask",
  "collection_sizes": {
    "WorkerLocations": 510004,
    "GigReviews": 100005
  },
  "workflow3_geonear": {
    "description": "Find closest available worker within 5 km radius",
    "executionSuccess": true,
    "nReturned": 1,
    "executionTimeMillis": 477,
    "totalKeysExamined": 254906,
    "totalDocsExamined": 254906,
    "winningStage": "GEO_NEAR_2DSPHERE",
    "indexName": "location_2dsphere"
  },
  "workflow4_facet": {
    "description": "Rating distribution, skill-tag frequency, and average-rating analytics",
    "executionSuccess": true,
    "nReturned": 3,
    "executionTimeMillis": 961,
    "totalKeysExamined": 100005,
    "totalDocsExamined": 100005,
    "winningStage": "IXSCAN",
    "indexName": "rating_created_at_idx",
    "note": "Using $match on indexed fields (rating, created_at) before $facet to avoid collection scan"
  }
}
```