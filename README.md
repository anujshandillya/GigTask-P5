# SSD Assignment - GigTask
### Team 9
- Anuj Sharma - 2026201046
- Nisarg Bhojani - 2026xxxxxx
- Srilatha Kanchamreddy - 2026xxxxxx
- Vishwanth Beereddy - 2026xxxxxx

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