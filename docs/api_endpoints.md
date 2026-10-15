# GigTask API Endpoints

**Base URL:** `http://localhost:3000`  
**Content-Type for JSON requests:** `application/json`

This document describes the routes currently present in `api/server.js`. They should be verified against the local PostgreSQL and MongoDB databases before final submission.

## Start the API

From the repository root:

```bash
cd api
npm install
npm run dev
```

Ensure PostgreSQL and MongoDB are running and `api/.env` contains the correct local connection settings. Never commit `.env`.

Test the API:

```bash
curl -i http://localhost:3000/api/health
```

Expected response:

```json
{
  "status": "ok",
  "postgres": "connected",
  "mongodb": "connected"
}
```

## Common conventions

- List endpoints return a `data` array and pagination metadata where noted.
- `page` defaults to `1`.
- `limit` defaults to `20` and is capped at `100`.
- Use real IDs returned by the API/database; example IDs below are placeholders.
- Frontend screens should handle loading, empty, success, and error states.
- Common errors: `400` invalid input, `404` missing route/resource where handled, `409` business-rule conflict, `500` unexpected server/database error.

---

## 1. Health Check

### `GET /api/health`

Checks connectivity to PostgreSQL and MongoDB.

```http
GET http://localhost:3000/api/health
```

Success (`200 OK`):

```json
{
  "status": "ok",
  "postgres": "connected",
  "mongodb": "connected"
}
```

## 2. Browse Clients

### `GET /api/clients`

Returns clients with optional search and pagination.

| Parameter | Required | Description |
|---|---|---|
| `page` | No | Page number; default `1` |
| `limit` | No | Results per page; default `20`, maximum `100` |
| `search` | No | Case-insensitive partial match on client name |

Example:

```http
GET http://localhost:3000/api/clients?page=1&limit=10&search=Acosta
```

Response shape:

```json
{
  "data": [
    {
      "id": "CLIENT_UUID",
      "name": "Example Client",
      "escrow_balance": "1200.00"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1
  }
}
```

Example values are illustrative.

## 3. Browse Freelancers

### `GET /api/freelancers`

Supports `page`, `limit`, and optional case-insensitive `search` on freelancer name.

Example:

```http
GET http://localhost:3000/api/freelancers?page=1&limit=10&search=Aaron
```

Returns `data` and `pagination`. The current route selects all columns from the `freelancers` table.

## 4. Browse Contracts

### `GET /api/contracts`

Supports `page`, `limit`, optional `search`, and optional `status`.

- `search` matches contract ID text, client name, or freelancer name.
- `status` must be `FUNDED`, `IN_PROGRESS`, or `COMPLETED`.

Example:

```http
GET http://localhost:3000/api/contracts?page=1&limit=10&status=FUNDED&search=Acosta
```

An invalid status should return `400 Bad Request`.

## 5. Fund a Gig

### `POST /api/fund-gig`

Calls the PostgreSQL `fund_gig` stored procedure.

Request body:

```json
{
  "clientId": "CLIENT_UUID_FROM_API",
  "freelancerId": "FREELANCER_UUID_FROM_API",
  "budget": 100
}
```

Success (`201 Created`) is intended to include `message`, `balanceBefore`, `balanceAfter`, `contract`, and `audit`.

Possible errors:
- `400`: invalid IDs/budget or stored-procedure validation error.
- `404`: client or freelancer does not exist.
- `409`: uniqueness/business-rule conflict.
- `500`: unexpected error.

**Important:** Funding changes database state. Do not retry automatically after a timeout; check the balance, contract list, and audit history first.

## 6. Client Audit History

### `GET /api/clients/:id/audit`

Returns audit entries for one client with optional date filters and pagination.

Example:

```http
GET http://localhost:3000/api/clients/CLIENT_UUID/audit?page=1&limit=10&from=2026-10-01T00:00:00Z&to=2026-10-31T23:59:59Z
```

Query parameters: `page`, `limit`, `from`, and `to`. Dates should be valid ISO date/time strings.

Response includes `clientId`, `data`, and `pagination`; rows include fields such as `amount_changed`, `action_type`, `balance_after`, and `timestamp`.

**Backend verification note:** the current `net_change` field is a cumulative sum over the filtered audit rows, so it is not a true account balance when date filters are used. Use stored `balance_after` as the recorded balance until the backend running-balance calculation is fixed.

## 7. Seven-Day Moving-Average Revenue

### `GET /api/analytics/moving-average`

Returns completed-contract revenue by freelancer and observed revenue date, including `daily_revenue` and `moving_avg_7day`.

Example:

```http
GET http://localhost:3000/api/analytics/moving-average
```

**Implementation note:** the current query averages up to seven observed revenue dates (current row and up to six preceding rows); it does not generate missing calendar dates with zero revenue. Confirm the assignment's exact definition before final submission.

## 8. Freelancer Earnings Leaderboard

### `GET /api/analytics/rankings`

Returns leaderboard data from `freelancer_earnings`, ranked by `total_earnings` using PostgreSQL `DENSE_RANK`.

```http
GET http://localhost:3000/api/analytics/rankings
```

Rows include `freelancer_id`, `freelancer_name`, `completed_contracts`, `total_earnings`, and `revenue_rank`.

## 9. Analytics Summary

### `GET /api/analytics/summary`

Returns aggregate values from `freelancer_earnings`: freelancer count, completed contracts, total earnings, average earnings, and `lastRefreshedAt`.

```http
GET http://localhost:3000/api/analytics/summary
```

The current `lastRefreshedAt` value is held in server memory and resets when the API process restarts.

## 10. Refresh Analytics

### `POST /api/analytics/refresh`

Refreshes the `freelancer_earnings` materialized view. No request body is required.

```http
POST http://localhost:3000/api/analytics/refresh
```

The materialized view needs the appropriate unique index for `REFRESH MATERIALIZED VIEW CONCURRENTLY` to work.

## 11. Nearby Available Workers

### `GET /api/workers/nearby`

Returns available workers within 5,000 metres using MongoDB `$geoNear`.

Required query parameters:
- `lat`: latitude from `-90` to `90`.
- `lng`: longitude from `-180` to `180`.

Example:

```http
GET http://localhost:3000/api/workers/nearby?lat=17.3850&lng=78.4867
```

Use coordinates near a seeded worker. MongoDB GeoJSON coordinates are stored as `[longitude, latitude]`, while the API query uses `lat` and `lng`. An empty `data` array is possible if no available worker is within 5 km. Invalid coordinates should return `400`.

## 12. Review Analytics

### `GET /api/reviews/analytics`

Uses MongoDB `$facet` to return:
- `rating_distribution`: count per rating.
- `skill_tag_frequency`: most frequent skill tags.
- `overall_average_rating`: average rating.

```http
GET http://localhost:3000/api/reviews/analytics
```

## 13. Freelancer Portfolio

### `GET /api/portfolios/:freelancerId`

Returns portfolio documents matching `freelancer_id` in MongoDB.

Example:

```http
GET http://localhost:3000/api/portfolios/57408
```

The current route searches `freelancer_id` as a string and, for numeric IDs, also as a number. Use the ID format present in the seeded documents.

Response shape:

```json
{
  "freelancerId": "57408",
  "data": []
}
```

The empty array is illustrative.

## 14. Update Contract Status

### `PATCH /api/contracts/:id/status`

Allowed transitions:
- `FUNDED` → `IN_PROGRESS`
- `IN_PROGRESS` → `COMPLETED`

Request body:

```json
{
  "status": "IN_PROGRESS"
}
```

Example URL:

```http
PATCH http://localhost:3000/api/contracts/CONTRACT_UUID/status
```

Possible responses:
- `200`: status updated.
- `400`: invalid UUID or status.
- `404`: contract not found.
- `409`: invalid transition or a database uniqueness rule prevents the update.

A `409` can be correct if the freelancer already has another `IN_PROGRESS` contract.

## Frontend Integration Checklist

- Use `http://localhost:3000` as the local API base URL.
- Use IDs returned by the API rather than hardcoded example IDs.
- Show loading, empty, and error states.
- Do not automatically retry a funding request that times out.
- Test nearby workers with coordinates near seeded data.
- Report bugs with method, full URL, HTTP status, and response body.

## Verification Status

This guide reflects the routes in the current `api/server.js`; it does not claim every route has passed live integration tests. Final backend checks include audit running-balance behavior, MongoDB geospatial and portfolio results, materialized-view refresh, and contract transitions.
