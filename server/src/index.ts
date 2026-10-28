import express from "express";
import cors from "cors";
import { db } from "./db";
import authRoutes from "./routes/auth";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", async (_req, res) => {
  const r = await db.query("SELECT 1 AS ok");
  res.json(r.rows[0]);
});

app.use("/auth", authRoutes);

app.listen(process.env.PORT, () => console.log("API on", process.env.PORT));