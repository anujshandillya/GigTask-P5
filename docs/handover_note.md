# Handover Note — Inherited GigTask Database (Part A)

## Overview

The inherited GigTask repository contains a PostgreSQL database for relational and transactional workflows, a MongoDB database for document and geospatial workflows, SQL/MongoDB setup scripts, data-generation scripts, and performance-related artifacts. The main database components are clients, freelancers, contracts, wallet audit records, freelancer earnings analytics, worker locations, reviews, and portfolios.

## What worked

- The PostgreSQL schema and SQL scripts (`sql/01_schema_ddl.sql` through `sql/06_window_analytics.sql`) provide the structure for the relational workflows, constraints/indexes, auditing, funding, and analytics.
- The funding workflow uses the `fund_gig` stored procedure. In local verification, a funding request successfully created a contract, reduced the client's balance, and produced a corresponding wallet audit record.
- Wallet audit records include the change amount, action type, and balance after the event. The audit mechanism is intended to preserve a trace of wallet changes.
- The freelancer earnings materialized view and ranking/moving-average analytics support the reporting workflows. The materialized view can be refreshed using the provided database function and the required unique index.
- MongoDB scripts cover worker-location search using a geospatial index and `$geoNear`, and review aggregation using `$facet`. Portfolio documents are also part of the MongoDB data model.
- The backend's representative database-backed workflows were exercised locally, and the funding workflow returned the expected balance, contract, and audit information.

## Issues and limitations observed

- Database configuration needs careful checking: the inherited Compose configuration and environment template have used different PostgreSQL database names (`mydb` and `GigTask`). A mismatch can prevent the application from connecting to the database that was initialized. The database name, ports, and credentials should be consistent across Compose, `.env.example`, and the local `.env`.
- The available local data is a small development dataset, not the full performance-scale dataset described for the project. The verified working sample contained about 500 clients, 500 freelancers, 1,000 contracts/audit records, 4 worker-location documents, 5 reviews, and 3 portfolio documents. This is sufficient for basic functional checks, but it does not establish performance at the intended larger scale.
- Some MongoDB workflows can return empty results when the requested worker coordinates are not within 5 km of an available seeded worker, or when the requested freelancer has no matching portfolio document. These cases should be distinguished from connection or query failures.
- No additional database logic failure was confirmed during the representative checks. Full-scale performance and every edge case should not be considered verified based only on these checks.

## Changes made and why

- The database scripts were applied in the local development setup and the PostgreSQL and MongoDB services were configured for the application to use.
- A consistent local connection configuration was set for the API and the running database services so that the backend could connect to the intended PostgreSQL and MongoDB databases.
- A small seed dataset was used for functional development and testing. The purpose was to verify application workflows without loading the full performance-scale dataset during routine development.
- The backend was connected to the existing stored procedure, audit records, analytics, and MongoDB workflows rather than reimplementing these database operations in the frontend.

## Recommendations to the original authors

1. Keep the database name, port, and credential examples consistent across Docker Compose, environment templates, and setup instructions.
2. Document the exact order for running SQL scripts, MongoDB setup/index scripts, and seeders, including how to verify successful initialization.
3. Clearly separate small functional seed data from performance-scale data, and document the commands and expected record counts for each.
4. Include reproducible test commands and sample inputs for funding, audit history, analytics, geospatial search, review aggregation, and portfolio lookup.
5. Record the expected behavior for empty query results, invalid inputs, and rejected contract transitions so that users can distinguish valid business outcomes from failures.

## Verification scope

This note reflects the local setup and representative functional checks described above. It does not claim that every edge case or the full performance-scale workload has been tested. Re-run the project's performance scripts against the intended dataset before drawing conclusions about scalability.
