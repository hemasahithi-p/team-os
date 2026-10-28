import dotenv from "dotenv";
import { Pool, types } from "pg";

dotenv.config();

// return DATE columns as plain "YYYY-MM-DD" text (avoids timezone shifts)
types.setTypeParser(1082, (value: string) => value);

export const db = new Pool({ connectionString: process.env.DATABASE_URL });