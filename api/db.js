
const { Pool } = require("pg");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

const mongoClient = new MongoClient(process.env.MONGO_URI);

let mongoDb;

async function connectDatabases() {
  // Test the PostgreSQL connection
  await pool.query("SELECT 1");
  console.log("PostgreSQL connected successfully");

  // Connect to MongoDB
  await mongoClient.connect();
  mongoDb = mongoClient.db(process.env.MONGO_DATABASE);
  await mongoDb.command({ ping: 1 });
  console.log("MongoDB connected successfully");
}

function getMongoDb() {
  if (!mongoDb) {
    throw new Error("MongoDB is not connected");
  }
  return mongoDb;
}

async function closeDatabases() {
  await pool.end();
  await mongoClient.close();
}

module.exports = {
  pool,
  connectDatabases,
  getMongoDb,
  closeDatabases,
};

