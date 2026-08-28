#!/usr/bin/env python3
"""
PostgreSQL Data Seeder for GigTask Platform.
Seeds realistic mock data into clients, freelancers, contracts, and wallet_audit_logs tables
using Faker while respecting PostgreSQL constraints, foreign keys, and indexes.

Handles incremental seeding up to target row counts:
- Clients: Target 50,000 rows (e.g. adds 49,000 if 1,000 exist)
- Freelancers: Target 50,000 rows
- Wallet Audit Logs: Target 100,000 rows
- Contracts: Target 100,000 rows
"""

import argparse
import logging
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from faker import Faker
import psycopg2
from psycopg2.extras import execute_values

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("postgres_seeder")


def get_db_connection(args):
    """Establish and return a PostgreSQL connection."""
    conn_params = {
        "host": args.host or os.getenv("PGHOST", os.getenv("DB_HOST", "localhost")),
        "port": args.port or int(os.getenv("PGPORT", os.getenv("DB_PORT", 5432))),
        "user": args.user or os.getenv("PGUSER", os.getenv("DB_USER", "postgres")),
        "password": args.password or os.getenv("PGPASSWORD", os.getenv("DB_PASSWORD", "postgres")),
        "dbname": args.dbname or os.getenv("PGDATABASE", os.getenv("DB_NAME", "gigtask")),
    }

    db_url = os.getenv("DATABASE_URL")
    if db_url and not any([args.host, args.user, args.password, args.dbname]):
        logger.info("Connecting to PostgreSQL using DATABASE_URL...")
        return psycopg2.connect(db_url)

    logger.info(
        f"Connecting to PostgreSQL at {conn_params['host']}:{conn_params['port']} "
        f"(Database: {conn_params['dbname']}, User: {conn_params['user']})..."
    )
    return psycopg2.connect(**conn_params)


def truncate_tables(cursor):
    """Truncate existing tables before seeding if requested."""
    logger.warning("Truncating tables: contracts, wallet_audit_logs, clients, freelancers...")
    cursor.execute("""
        TRUNCATE TABLE contracts, wallet_audit_logs, clients, freelancers CASCADE;
    """)
    logger.info("Tables truncated successfully.")


def get_table_count(cursor, table_name):
    """Get current row count of a table."""
    cursor.execute(f"SELECT COUNT(*) FROM {table_name};")
    return cursor.fetchone()[0]


def seed_clients(cursor, fake, target_count, batch_size=5000):
    """Ensure clients table reaches target_count rows."""
    current_count = get_table_count(cursor, "clients")
    logger.info(f"[Clients] Current count: {current_count:,} | Target: {target_count:,}")

    to_insert = max(0, target_count - current_count)
    if to_insert > 0:
        logger.info(f"Generating and inserting {to_insert:,} clients in batches of {batch_size:,}...")
        inserted = 0
        insert_query = """
            INSERT INTO clients (id, name, escrow_balance)
            VALUES %s
        """
        while inserted < to_insert:
            batch_count = min(batch_size, to_insert - inserted)
            batch = []
            for _ in range(batch_count):
                c_id = str(uuid.uuid4())
                name = (fake.company() if random.random() < 0.6 else fake.name())[:100]
                balance = Decimal(str(round(random.uniform(500.00, 50000.00), 2)))
                batch.append((c_id, name, balance))

            execute_values(cursor, insert_query, batch, page_size=batch_size)
            inserted += batch_count
            logger.info(f"  → Inserted {inserted:,} / {to_insert:,} clients...")

        logger.info(f"✓ Clients table now has {get_table_count(cursor, 'clients'):,} rows.")
    else:
        logger.info("✓ Clients table already satisfies target count.")

    # Retrieve all client IDs for downstream relations
    cursor.execute("SELECT id FROM clients;")
    all_client_ids = [row[0] for row in cursor.fetchall()]
    return all_client_ids


def seed_freelancers(cursor, fake, target_count, batch_size=5000):
    """Ensure freelancers table reaches target_count rows."""
    current_count = get_table_count(cursor, "freelancers")
    logger.info(f"[Freelancers] Current count: {current_count:,} | Target: {target_count:,}")

    to_insert = max(0, target_count - current_count)
    if to_insert > 0:
        logger.info(f"Generating and inserting {to_insert:,} freelancers in batches of {batch_size:,}...")
        inserted = 0
        insert_query = """
            INSERT INTO freelancers (id, name, latitude, longitude, is_available)
            VALUES %s
        """
        while inserted < to_insert:
            batch_count = min(batch_size, to_insert - inserted)
            batch = []
            for _ in range(batch_count):
                f_id = str(uuid.uuid4())
                name = fake.name()[:100]
                lat = round(float(fake.latitude()), 6)
                lon = round(float(fake.longitude()), 6)
                # Initially available
                batch.append((f_id, name, lat, lon, True))

            execute_values(cursor, insert_query, batch, page_size=batch_size)
            inserted += batch_count
            logger.info(f"  → Inserted {inserted:,} / {to_insert:,} freelancers...")

        logger.info(f"✓ Freelancers table now has {get_table_count(cursor, 'freelancers'):,} rows.")
    else:
        logger.info("✓ Freelancers table already satisfies target count.")

    cursor.execute("SELECT id FROM freelancers;")
    all_freelancer_ids = [row[0] for row in cursor.fetchall()]
    return all_freelancer_ids


def seed_wallet_audit_logs(cursor, client_ids, target_count, batch_size=5000):
    """Ensure wallet_audit_logs table reaches target_count rows distributed across client_ids."""
    current_count = get_table_count(cursor, "wallet_audit_logs")
    logger.info(f"[Wallet Audit Logs] Current count: {current_count:,} | Target: {target_count:,}")

    to_insert = max(0, target_count - current_count)
    if to_insert > 0:
        logger.info(f"Generating and inserting {to_insert:,} wallet audit records across {len(client_ids):,} clients...")
        now = datetime.now(timezone.utc)
        inserted = 0
        insert_query = """
            INSERT INTO wallet_audit_logs (id, client_id, amount_changed, action_type, balance_after, timestamp)
            VALUES %s
        """

        while inserted < to_insert:
            batch_count = min(batch_size, to_insert - inserted)
            batch = []
            for _ in range(batch_count):
                log_id = str(uuid.uuid4())
                c_id = random.choice(client_ids)
                action = random.choice(["CREDIT", "DEBIT"])
                
                if action == "CREDIT":
                    amount = Decimal(str(round(random.uniform(500.00, 10000.00), 2)))
                    amount_changed = amount
                    balance_after = Decimal(str(round(random.uniform(float(amount), 60000.00), 2)))
                else:
                    amount = Decimal(str(round(random.uniform(50.00, 3000.00), 2)))
                    amount_changed = -amount
                    balance_after = Decimal(str(round(random.uniform(10.00, 30000.00), 2)))

                # Random timestamp in the past 180 days
                days_ago = random.randint(0, 180)
                minutes_ago = random.randint(0, 1440)
                log_time = now - timedelta(days=days_ago, minutes=minutes_ago)

                batch.append((log_id, c_id, amount_changed, action, balance_after, log_time))

            execute_values(cursor, insert_query, batch, page_size=batch_size)
            inserted += batch_count
            logger.info(f"  → Inserted {inserted:,} / {to_insert:,} wallet audit logs...")

        logger.info(f"✓ Wallet audit logs table now has {get_table_count(cursor, 'wallet_audit_logs'):,} rows.")
    else:
        logger.info("✓ Wallet audit logs table already satisfies target count.")


def seed_contracts(cursor, fake, client_ids, freelancer_ids, target_count, batch_size=5000):
    """
    Ensure contracts table reaches target_count rows.
    Respects Unique Partial Index on contracts (freelancer_id) WHERE status = 'IN_PROGRESS'.
    """
    current_count = get_table_count(cursor, "contracts")
    logger.info(f"[Contracts] Current count: {current_count:,} | Target: {target_count:,}")

    # Identify freelancers who already have an IN_PROGRESS contract
    cursor.execute("SELECT freelancer_id FROM contracts WHERE status = 'IN_PROGRESS';")
    active_freelancers = set(row[0] for row in cursor.fetchall())

    to_insert = max(0, target_count - current_count)
    if to_insert > 0:
        logger.info(f"Generating and inserting {to_insert:,} contracts...")
        now = datetime.now(timezone.utc)
        inserted = 0
        insert_query = """
            INSERT INTO contracts (id, client_id, freelancer_id, budget, status, created_at)
            VALUES %s
        """

        while inserted < to_insert:
            batch_count = min(batch_size, to_insert - inserted)
            batch = []
            for _ in range(batch_count):
                contract_id = str(uuid.uuid4())
                c_id = random.choice(client_ids)
                f_id = random.choice(freelancer_ids)
                budget = Decimal(str(round(random.uniform(100.00, 10000.00), 2)))

                # Respect unique constraint on IN_PROGRESS
                if f_id not in active_freelancers and random.random() < 0.25:
                    status = "IN_PROGRESS"
                    active_freelancers.add(f_id)
                    created_at = fake.date_time_between(start_date="-30d", end_date="-1d", tzinfo=timezone.utc)
                else:
                    if random.random() < 0.70:
                        status = "COMPLETED"
                        created_at = fake.date_time_between(start_date="-365d", end_date="-31d", tzinfo=timezone.utc)
                    else:
                        status = "FUNDED"
                        created_at = fake.date_time_between(start_date="-7d", end_date="now", tzinfo=timezone.utc)

                batch.append((contract_id, c_id, f_id, budget, status, created_at))

            execute_values(cursor, insert_query, batch, page_size=batch_size)
            inserted += batch_count
            logger.info(f"  → Inserted {inserted:,} / {to_insert:,} contracts...")

        # Synchronize is_available status on freelancers based on active contracts
        logger.info("Synchronizing freelancers' availability status with active contracts...")
        cursor.execute("""
            UPDATE freelancers
            SET is_available = (
                CASE WHEN id IN (SELECT freelancer_id FROM contracts WHERE status = 'IN_PROGRESS') THEN FALSE
                ELSE TRUE END
            );
        """)
        logger.info(f"✓ Contracts table now has {get_table_count(cursor, 'contracts'):,} rows.")
    else:
        logger.info("✓ Contracts table already satisfies target count.")


def main():
    parser = argparse.ArgumentParser(
        description="Seed PostgreSQL database with mock data for the GigTask platform."
    )
    parser.add_argument("--clients", type=int, default=50000, help="Target total number of clients (default: 50000)")
    parser.add_argument("--freelancers", type=int, default=50000, help="Target total number of freelancers (default: 50000)")
    parser.add_argument("--audit-logs", type=int, default=100000, help="Target total number of wallet audit logs (default: 100000)")
    parser.add_argument("--contracts", type=int, default=100000, help="Target total number of contracts (default: 100000)")
    parser.add_argument("--batch-size", type=int, default=5000, help="Batch size for bulk insertion (default: 5000)")
    parser.add_argument("--clear", action="store_true", help="Truncate tables before seeding to start fresh")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for deterministic data generation (default: 42)")

    # Database connection parameters (default to port 5432)
    parser.add_argument("--host", type=str, default=os.getenv("PGHOST", os.getenv("DB_HOST", "localhost")), help="PostgreSQL host (default: localhost)")
    parser.add_argument("--port", type=int, default=int(os.getenv("PGPORT", os.getenv("DB_PORT", 5432))), help="PostgreSQL port (default: 5432)")
    parser.add_argument("--user", type=str, default=os.getenv("PGUSER", os.getenv("DB_USER", "postgres")), help="PostgreSQL user (default: postgres)")
    parser.add_argument("--password", type=str, default=os.getenv("PGPASSWORD", os.getenv("DB_PASSWORD", "postgres")), help="PostgreSQL password (default: postgres)")
    parser.add_argument("--dbname", type=str, default=os.getenv("PGDATABASE", os.getenv("DB_NAME", "gigtask")), help="PostgreSQL database name (default: gigtask)")

    args = parser.parse_args()

    fake = Faker()
    if args.seed is not None:
        Faker.seed(args.seed)
        random.seed(args.seed)

    try:
        conn = get_db_connection(args)
    except Exception as e:
        logger.error(f"Failed to connect to PostgreSQL: {e}")
        sys.exit(1)

    try:
        with conn.cursor() as cursor:
            if args.clear:
                truncate_tables(cursor)
                conn.commit()

            # 1. Seed clients up to target
            client_ids = seed_clients(cursor, fake, target_count=args.clients, batch_size=args.batch_size)

            # 2. Seed freelancers up to target
            freelancer_ids = seed_freelancers(cursor, fake, target_count=args.freelancers, batch_size=args.batch_size)

            # 3. Seed wallet audit logs up to target
            seed_wallet_audit_logs(cursor, client_ids=client_ids, target_count=args.audit_logs, batch_size=args.batch_size)

            # 4. Seed contracts up to target
            seed_contracts(cursor, fake, client_ids=client_ids, freelancer_ids=freelancer_ids, target_count=args.contracts, batch_size=args.batch_size)

            # 5. Refresh Materialized Views (if present)
            try:
                cursor.execute("SELECT to_regclass('public.freelancer_earnings');")
                if cursor.fetchone()[0]:
                    logger.info("Refreshing materialized view 'freelancer_earnings'...")
                    cursor.execute("REFRESH MATERIALIZED VIEW freelancer_earnings;")
                    logger.info("✓ Materialized view 'freelancer_earnings' refreshed.")
            except Exception as e:
                logger.warning(f"Could not refresh materialized view: {e}")

        conn.commit()
        logger.info("🎉 Database seeding completed successfully!")

    except Exception as e:
        conn.rollback()
        logger.error(f"Seeding failed: {e}", exc_info=True)
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
