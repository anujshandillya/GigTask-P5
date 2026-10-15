
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { pool, connectDatabases, closeDatabases, getMongoDb } = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;
const MAX_LIMIT = 100;

let lastAnalyticsRefresh = null;

function pagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(query.limit, 10) || 20)
  );
  return { page, limit, offset: (page - 1) * limit };
}

function validUuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validDate(value) {
  return !value || !Number.isNaN(Date.parse(value));
}

function handleError(res, error, message = "Request failed") {
  console.error(message + ":", error.message);

  if (error.code === "23503") {
    return res.status(400).json({ error: "A referenced client, freelancer, or record does not exist." });
  }
  if (error.code === "23505") {
    return res.status(409).json({ error: "This change conflicts with an existing active contract." });
  }
  if (error.code === "P0001" || error.code === "P0002") {
    return res.status(400).json({ error: error.message });
  }
  if (error.code === "22P02") {
    return res.status(400).json({ error: "An ID or value has an invalid format." });
  }

  return res.status(500).json({ error: message });
}

// 1. Health check
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    await getMongoDb().command({ ping: 1 });
    res.json({ status: "ok", postgres: "connected", mongodb: "connected" });
  } catch (error) {
    handleError(res, error, "Health check failed");
  }
});

// 2. Browse clients: search + pagination
app.get("/api/clients", async (req, res) => {
  try {
    const { page, limit, offset } = pagination(req.query);
    const search = String(req.query.search || "").trim();
    const pattern = `%${search}%`;

    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM clients
       WHERE name ILIKE $1`,
      [pattern]
    );

    const result = await pool.query(
      `SELECT id, name, escrow_balance
       FROM clients
       WHERE name ILIKE $1
       ORDER BY name, id
       LIMIT $2 OFFSET $3`,
      [pattern, limit, offset]
    );

    res.json({
      data: result.rows,
      pagination: { page, limit, total: count.rows[0].total }
    });
  } catch (error) {
    handleError(res, error, "Unable to fetch clients");
  }
});

// 3. Browse freelancers: search + pagination
app.get("/api/freelancers", async (req, res) => {
  try {
    const { page, limit, offset } = pagination(req.query);
    const search = `%${String(req.query.search || "").trim()}%`;

    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM freelancers
       WHERE name ILIKE $1`,
      [search]
    );

    const result = await pool.query(
      `SELECT *
       FROM freelancers
       WHERE name ILIKE $1
       ORDER BY name, id
       LIMIT $2 OFFSET $3`,
      [search, limit, offset]
    );

    res.json({
      data: result.rows,
      pagination: { page, limit, total: count.rows[0].total }
    });
  } catch (error) {
    handleError(res, error, "Unable to fetch freelancers");
  }
});

// 4. Browse contracts: search + status filter + pagination
app.get("/api/contracts", async (req, res) => {
  try {
    const { page, limit, offset } = pagination(req.query);
    const search = `%${String(req.query.search || "").trim()}%`;
    const status = String(req.query.status || "").toUpperCase();

    const allowedStatuses = ["FUNDED", "IN_PROGRESS", "COMPLETED"];
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "status must be FUNDED, IN_PROGRESS, or COMPLETED"
      });
    }

    const params = [search];
    let where = `
      (c.id::text ILIKE $1 OR cl.name ILIKE $1 OR f.name ILIKE $1)
    `;

    if (status) {
      params.push(status);
      where += ` AND c.status = $${params.length}`;
    }

    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM contracts c
       JOIN clients cl ON cl.id = c.client_id
       JOIN freelancers f ON f.id = c.freelancer_id
       WHERE ${where}`,
      params
    );

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT c.id, c.client_id, cl.name AS client_name,
              c.freelancer_id, f.name AS freelancer_name,
              c.budget, c.status, c.created_at
       FROM contracts c
       JOIN clients cl ON cl.id = c.client_id
       JOIN freelancers f ON f.id = c.freelancer_id
       WHERE ${where}
       ORDER BY c.created_at DESC, c.id
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      data: result.rows,
      pagination: { page, limit, total: count.rows[0].total }
    });
  } catch (error) {
    handleError(res, error, "Unable to fetch contracts");
  }
});

// 5. Fund a gig using the existing PostgreSQL stored procedure
app.post("/api/fund-gig", async (req, res) => {
  const { clientId, freelancerId, budget } = req.body;
  const amount = Number(budget);

  if (!validUuid(clientId) || !validUuid(freelancerId) ||
      budget === undefined || budget === null || budget === "" ||
      !Number.isFinite(amount) || amount <= 0 || amount > 99999999.99) {
    return res.status(400).json({
      error: "Valid clientId, freelancerId, and a positive budget are required."
    });
  }

  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");

    const clientResult = await dbClient.query(
      `SELECT id, name, escrow_balance
       FROM clients WHERE id = $1 FOR UPDATE`,
      [clientId]
    );

    if (clientResult.rowCount === 0) {
      await dbClient.query("ROLLBACK");
      return res.status(404).json({ error: "Client does not exist." });
    }

    const freelancerResult = await dbClient.query(
      "SELECT id, name FROM freelancers WHERE id = $1",
      [freelancerId]
    );

    if (freelancerResult.rowCount === 0) {
      await dbClient.query("ROLLBACK");
      return res.status(404).json({ error: "Freelancer does not exist." });
    }

    const balanceBefore = Number(clientResult.rows[0].escrow_balance);

    // Snapshot existing matching contracts and audit records so we can
    // identify the records created by this call.
    const oldContracts = await dbClient.query(
      `SELECT id FROM contracts
       WHERE client_id = $1 AND freelancer_id = $2
         AND budget = $3 AND status = 'FUNDED'`,
      [clientId, freelancerId, amount]
    );
    const oldAudits = await dbClient.query(
      `SELECT id FROM wallet_audit_logs WHERE client_id = $1`,
      [clientId]
    );

    const oldContractIds = oldContracts.rows.map(row => row.id);
    const oldAuditIds = oldAudits.rows.map(row => row.id);

    await dbClient.query(
      "CALL fund_gig($1::uuid, $2::uuid, $3::decimal)",
      [clientId, freelancerId, amount]
    );

    const balanceResult = await dbClient.query(
      "SELECT escrow_balance FROM clients WHERE id = $1",
      [clientId]
    );

    const newContract = await dbClient.query(
      `SELECT id, client_id, freelancer_id, budget, status, created_at
       FROM contracts
       WHERE client_id = $1 AND freelancer_id = $2
         AND budget = $3 AND status = 'FUNDED'
         AND NOT (id = ANY($4::uuid[]))
       ORDER BY created_at DESC
       LIMIT 1`,
      [clientId, freelancerId, amount, oldContractIds]
    );

    const newAudit = await dbClient.query(
      `SELECT id, client_id, amount_changed, action_type,
              balance_after, timestamp
       FROM wallet_audit_logs
       WHERE client_id = $1
         AND NOT (id = ANY($2::uuid[]))
       ORDER BY timestamp DESC
       LIMIT 1`,
      [clientId, oldAuditIds]
    );

    await dbClient.query("COMMIT");

    res.status(201).json({
      message: "Gig funded successfully",
      balanceBefore,
      balanceAfter: Number(balanceResult.rows[0].escrow_balance),
      contract: newContract.rows[0] || null,
      audit: newAudit.rows[0] || null
    });
  } catch (error) {
    try {
      await dbClient.query("ROLLBACK");
    } catch (_) {}
    handleError(res, error, "Unable to fund gig");
  } finally {
    dbClient.release();
  }
});

// 6. Read-only client audit history with date filters and running balance
app.get("/api/clients/:id/audit", async (req, res) => {
  const clientId = req.params.id;
  const { from, to } = req.query;

  if (!validUuid(clientId)) {
    return res.status(400).json({ error: "Invalid client ID." });
  }
  if (!validDate(from) || !validDate(to)) {
    return res.status(400).json({ error: "Invalid from/to date." });
  }

  try {
    const { page, limit, offset } = pagination(req.query);
    const params = [clientId];
    let where = "client_id = $1";

    if (from) {
      params.push(from);
      where += ` AND timestamp >= $${params.length}::timestamptz`;
    }
    if (to) {
      params.push(to);
      where += ` AND timestamp <= $${params.length}::timestamptz`;
    }

    const count = await pool.query(
      `SELECT COUNT(*)::int AS total FROM wallet_audit_logs WHERE ${where}`,
      params
    );

    // The running balance is calculated over all entries for this client,
    // then the requested date window is applied to the visible results.
    const runningParams = [clientId];
    const runningConditions = ["client_id = $1"];

    if (from) {
      runningParams.push(from);
      runningConditions.push(`timestamp >= $${runningParams.length}::timestamptz`);
    }
    if (to) {
      runningParams.push(to);
      runningConditions.push(`timestamp <= $${runningParams.length}::timestamptz`);
    }

    runningParams.push(limit, offset);
    const result = await pool.query(
      `WITH history AS (
         SELECT id, client_id, amount_changed, action_type,
                balance_after, timestamp,
                SUM(amount_changed) OVER (
                  PARTITION BY client_id
                  ORDER BY timestamp, id
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS net_change
         FROM wallet_audit_logs
         WHERE ${runningConditions.join(" AND ")}
       )
       SELECT * FROM history
       ORDER BY timestamp DESC, id
       LIMIT $${runningParams.length - 1}
       OFFSET $${runningParams.length}`,
      runningParams
    );

    res.json({
      clientId,
      data: result.rows,
      pagination: { page, limit, total: count.rows[0].total }
    });
  } catch (error) {
    handleError(res, error, "Unable to fetch audit history");
  }
});

// 7. Seven-day moving average revenue
app.get("/api/analytics/moving-average", async (req, res) => {
  const freelancerId = req.query.freelancer_id;

  try {
    let query, params;
    
    if (!freelancerId || freelancerId === 'all') {
      // OVERALL PLATFORM: Dense Calendar
      query = `
        WITH DateRange AS (
            SELECT generate_series(
                (SELECT MIN(DATE(created_at)) FROM contracts WHERE status = 'COMPLETED'),
                (SELECT MAX(DATE(created_at)) FROM contracts WHERE status = 'COMPLETED'),
                '1 day'::interval
            )::date AS calendar_date
        ),
        DailyRevenue AS (
            SELECT 
                d.calendar_date AS revenue_date,
                COALESCE(SUM(c.budget), 0) AS daily_total
            FROM DateRange d
            LEFT JOIN contracts c 
                ON d.calendar_date = DATE(c.created_at)
                AND c.status = 'COMPLETED'
            GROUP BY d.calendar_date
        )
        SELECT 
            'Whole Platform' AS freelancer_name,
            revenue_date,
            daily_total,
            ROUND(AVG(daily_total) OVER (
                ORDER BY revenue_date 
                ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
            ), 2) AS moving_avg_7day
        FROM DailyRevenue
        ORDER BY revenue_date
      `;
      params = [];
    } else {
      // SINGLE FREELANCER: Dense Calendar
      query = `
        WITH DateRange AS (
            SELECT generate_series(
                (SELECT MIN(DATE(created_at)) FROM contracts WHERE status = 'COMPLETED'),
                (SELECT MAX(DATE(created_at)) FROM contracts WHERE status = 'COMPLETED'),
                '1 day'::interval
            )::date AS calendar_date
        ),
        FreelancerDates AS (
            SELECT f.id AS freelancer_id, f.name AS freelancer_name, d.calendar_date
            FROM freelancers f
            CROSS JOIN DateRange d
            WHERE f.id = $1
        ),
        DailyRevenue AS (
            SELECT 
                fd.freelancer_id,
                fd.freelancer_name,
                fd.calendar_date AS revenue_date,
                COALESCE(SUM(c.budget), 0) AS daily_total
            FROM FreelancerDates fd
            LEFT JOIN contracts c 
                ON fd.freelancer_id = c.freelancer_id 
                AND fd.calendar_date = DATE(c.created_at)
                AND c.status = 'COMPLETED'
            GROUP BY fd.freelancer_id, fd.freelancer_name, fd.calendar_date
        )
        SELECT 
            freelancer_id,
            freelancer_name,
            revenue_date,
            daily_total,
            ROUND(AVG(daily_total) OVER (
                ORDER BY revenue_date 
                ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
            ), 2) AS moving_avg_7day
        FROM DailyRevenue
        ORDER BY revenue_date
      `;
      params = [freelancerId];
    }

    const result = await pool.query(query, params);
    res.json({ data: result.rows });
  } catch (error) {
    handleError(res, error, "Unable to fetch moving-average analytics");
  }
});

// // 7. Seven-day moving average revenue per freelancer (Filtered by ID)
// app.get("/api/analytics/moving-average", async (req, res) => {
//   const freelancerId = req.query.freelancer_id;

//   if (!freelancerId) {
//     return res.status(400).json({ error: "freelancer_id query parameter is required." });
//   }

//   try {
//     const result = await pool.query(`
//       WITH DateRange AS (
//           SELECT generate_series(
//               (SELECT MIN(DATE(created_at)) FROM contracts WHERE status = 'COMPLETED'),
//               (SELECT MAX(DATE(created_at)) FROM contracts WHERE status = 'COMPLETED'),
//               '1 day'::interval
//           )::date AS calendar_date
//       ),
//       FreelancerDates AS (
//           SELECT f.id AS freelancer_id, f.name AS freelancer_name, d.calendar_date
//           FROM freelancers f
//           CROSS JOIN DateRange d
//           WHERE f.id = $1  -- ONLY generate dates for the requested freelancer
//       ),
//       DailyRevenue AS (
//           SELECT 
//               fd.freelancer_id,
//               fd.freelancer_name,
//               fd.calendar_date AS revenue_date,
//               COALESCE(SUM(c.budget), 0) AS daily_total
//           FROM FreelancerDates fd
//           LEFT JOIN contracts c 
//               ON fd.freelancer_id = c.freelancer_id 
//               AND fd.calendar_date = DATE(c.created_at)
//               AND c.status = 'COMPLETED'
//           GROUP BY fd.freelancer_id, fd.freelancer_name, fd.calendar_date
//       )
//       SELECT 
//           freelancer_id,
//           freelancer_name,
//           revenue_date,
//           daily_total,
//           ROUND(AVG(daily_total) OVER (
//               ORDER BY revenue_date 
//               ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
//           ), 2) AS moving_avg_7day
//       FROM DailyRevenue
//       ORDER BY revenue_date
//     `, [freelancerId]); // Safely pass the ID into the query

//     res.json({ data: result.rows });
//   } catch (error) {
//     handleError(res, error, "Unable to fetch moving-average analytics");
//   }
// });

// // 7. Seven-day moving average revenue per freelancer
// app.get("/api/analytics/moving-average", async (req, res) => {
//   try {
//     const result = await pool.query(`
//       WITH daily AS (
//         SELECT freelancer_id, created_at::date AS revenue_date,
//                SUM(budget) AS daily_revenue
//         FROM contracts
//         WHERE status = 'COMPLETED'
//         GROUP BY freelancer_id, created_at::date
//       ),
//       moving AS (
//         SELECT freelancer_id, revenue_date, daily_revenue,
//                ROUND(AVG(daily_revenue) OVER (
//                  PARTITION BY freelancer_id
//                  ORDER BY revenue_date
//                  ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
//                ), 2) AS moving_avg_7day
//         FROM daily
//       )
//       SELECT m.freelancer_id, f.name AS freelancer_name,
//              m.revenue_date, m.daily_revenue, m.moving_avg_7day
//       FROM moving m
//       JOIN freelancers f ON f.id = m.freelancer_id
//       ORDER BY m.revenue_date, f.name
//       LIMIT 5000
//     `);
//     res.json({ data: result.rows });
//   } catch (error) {
//     handleError(res, error, "Unable to fetch moving-average analytics");
//   }
// });

// 8. Freelancer earnings ranking using DENSE_RANK
app.get("/api/analytics/rankings", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT freelancer_id, freelancer_name, completed_contracts,
             total_earnings,
             DENSE_RANK() OVER (ORDER BY total_earnings DESC) AS revenue_rank
      FROM freelancer_earnings
      ORDER BY revenue_rank, freelancer_name
      LIMIT 100
    `);
    res.json({ data: result.rows });
  } catch (error) {
    handleError(res, error, "Unable to fetch freelancer rankings");
  }
});

// 9. Summary from materialized view
app.get("/api/analytics/summary", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*)::int AS freelancer_count,
             COALESCE(SUM(completed_contracts), 0)::bigint AS completed_contracts,
             COALESCE(SUM(total_earnings), 0)::numeric(14,2) AS total_earnings,
             COALESCE(AVG(total_earnings), 0)::numeric(14,2) AS average_earnings
      FROM freelancer_earnings
    `);
    res.json({
      ...result.rows[0],
      lastRefreshedAt: lastAnalyticsRefresh
    });
  } catch (error) {
    handleError(res, error, "Unable to fetch analytics summary");
  }
});

// 10. Refresh materialized view
// Execute REFRESH directly; CONCURRENTLY cannot run inside a transaction block.
app.post("/api/analytics/refresh", async (req, res) => {
  try {
    await pool.query("REFRESH MATERIALIZED VIEW CONCURRENTLY freelancer_earnings");
    lastAnalyticsRefresh = new Date().toISOString();
    res.json({
      message: "Freelancer earnings refreshed successfully",
      lastRefreshedAt: lastAnalyticsRefresh
    });
  } catch (error) {
    handleError(res, error, "Unable to refresh analytics");
  }
});

// 11. Nearby available workers within 5 km
app.get("/api/workers/nearby", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (req.query.lat === undefined || req.query.lng === undefined ||
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({
      error: "Provide valid latitude (lat) and longitude (lng)."
    });
  }

  try {
    const mongo = getMongoDb();
    const data = await mongo.collection("WorkerLocations").aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [lng, lat] },
          key: "location",
          distanceField: "distanceMeters",
          maxDistance: 5000,
          spherical: true,
          query: { is_available: true }
        }
      },
      { $limit: 100 },
      {
        $project: {
          worker_id: 1,
          location: 1,
          created_at: 1,
          is_available: 1,
          distanceMeters: 1
        }
      }
    ]).toArray();

    res.json({ origin: { lat, lng }, radiusMeters: 5000, data });
  } catch (error) {
    handleError(res, error, "Unable to find nearby workers");
  }
});

// 12. Review analytics using MongoDB $facet
app.get("/api/reviews/analytics", async (req, res) => {
  try {
    const mongo = getMongoDb();
    const result = await mongo.collection("GigReviews").aggregate([
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

    res.json(result[0] || {
      rating_distribution: [],
      skill_tag_frequency: [],
      overall_average_rating: []
    });
  } catch (error) {
    handleError(res, error, "Unable to fetch review analytics");
  }
});

// 12.5 Get all individual platform reviews
app.get("/api/reviews", async (req, res) => {
  try {
    const mongo = getMongoDb();
    const reviews = await mongo.collection("GigReviews")
      .find({ rating: { $exists: true } }) // Ensures we only get actual reviews
      .sort({ _id: -1 }) // Sort newest first
      .limit(50)
      .toArray();

    res.json({ data: reviews });
  } catch (error) {
    handleError(res, error, "Unable to fetch individual reviews");
  }
});

// 13. Portfolio/catalog documents for a freelancer
app.get("/api/portfolios/:freelancerId", async (req, res) => {
  const freelancerId = req.params.freelancerId;

  try {
    const mongo = getMongoDb();
    const collection = mongo.collection("Portfolios");
    const candidates = [{ freelancer_id: freelancerId }];

    if (/^\d+$/.test(freelancerId)) {
      candidates.push({ freelancer_id: Number(freelancerId) });
    }

    const data = await collection.find({ $or: candidates }).limit(100).toArray();
    res.json({ freelancerId, data });
  } catch (error) {
    handleError(res, error, "Unable to fetch portfolio");
  }
});

// 14. Update contract status while respecting the active-contract index
app.patch("/api/contracts/:id/status", async (req, res) => {
  const contractId = req.params.id;
  const newStatus = String(req.body.status || "").toUpperCase();

  if (!validUuid(contractId)) {
    return res.status(400).json({ error: "Invalid contract ID." });
  }

  const allowedTransitions = {
    FUNDED: ["IN_PROGRESS"],
    IN_PROGRESS: ["COMPLETED"],
    COMPLETED: []
  };

  if (!["FUNDED", "IN_PROGRESS", "COMPLETED"].includes(newStatus)) {
    return res.status(400).json({
      error: "status must be FUNDED, IN_PROGRESS, or COMPLETED"
    });
  }

  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");

    const current = await dbClient.query(
      "SELECT id, status FROM contracts WHERE id = $1 FOR UPDATE",
      [contractId]
    );

    if (current.rowCount === 0) {
      await dbClient.query("ROLLBACK");
      return res.status(404).json({ error: "Contract not found." });
    }

    const oldStatus = current.rows[0].status;

    if (!allowedTransitions[oldStatus]?.includes(newStatus)) {
      await dbClient.query("ROLLBACK");
      return res.status(409).json({
        error: `Cannot change contract status from ${oldStatus} to ${newStatus}.`
      });
    }

    const updated = await dbClient.query(
      `UPDATE contracts SET status = $1
       WHERE id = $2
       RETURNING id, client_id, freelancer_id, budget, status, created_at`,
      [newStatus, contractId]
    );

    // FIX: Update freelancer availability based on contract status
    const freelancerId = updated.rows[0].freelancer_id;
    const isNowAvailable = (newStatus !== 'IN_PROGRESS');
    
    await dbClient.query(
      `UPDATE freelancers SET is_available = $1 WHERE id = $2`,
      [isNowAvailable, freelancerId]
    );

    await dbClient.query("COMMIT");
    res.json({
      message: "Contract status updated successfully",
      contract: updated.rows[0]
    });
  } catch (error) {
    try {
      await dbClient.query("ROLLBACK");
    } catch (_) {}
    handleError(res, error, "Unable to update contract status");
  } finally {
    dbClient.release();
  }
});
// Unknown endpoint
app.use((req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});

// Start only after both databases connect
async function startServer() {
  try {
    await connectDatabases();
    app.listen(PORT, () => {
      console.log(`API server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start API:", error.message);
    process.exitCode = 1;
  }
}

startServer();

process.on("SIGINT", async () => {
  await closeDatabases();
  process.exit(0);
});

