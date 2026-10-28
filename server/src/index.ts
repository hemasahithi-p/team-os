import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();
export const db = new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", async (_req, res) => {
  const r = await db.query("SELECT 1 AS ok");
  res.json(r.rows[0]);
});

app.listen(process.env.PORT, () => console.log("API on", process.env.PORT));