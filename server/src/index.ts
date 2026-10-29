import express from "express";
import cors from "cors";
import { db } from "./db";
import authRoutes from "./routes/auth";
import workspaceRoutes from "./routes/workspaces";
import projectRoutes from "./routes/projects";
import taskRoutes from "./routes/tasks";
import commentRoutes from "./routes/comments";
import http from "http";
import { initRealtime } from "./realtime";
import notificationRoutes from "./routes/notifications";
import eventRoutes from "./routes/events";
import aiRoutes from "./routes/ai";
import riskRoutes from "./routes/risks";
import searchRoutes from "./routes/search";
import meetingRoutes from "./routes/meetings";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", async (_req, res) => {
  const r = await db.query("SELECT 1 AS ok");
  res.json(r.rows[0]);
});

app.use("/auth", authRoutes);
app.use("/workspaces", workspaceRoutes);
app.use("/workspaces/:workspaceId/projects", projectRoutes);
app.use("/workspaces/:workspaceId/tasks", taskRoutes);
app.use("/workspaces/:workspaceId/tasks/:taskId/comments", commentRoutes);
app.use("/workspaces/:workspaceId/notifications", notificationRoutes);
app.use("/workspaces/:workspaceId/events", eventRoutes);
app.use("/workspaces/:workspaceId/ai", aiRoutes);
app.use("/workspaces/:workspaceId/risks", riskRoutes);
app.use("/workspaces/:workspaceId/search", searchRoutes);
app.use("/workspaces/:workspaceId/meetings", meetingRoutes);

const server = http.createServer(app);
initRealtime(server);
server.listen(process.env.PORT, () => console.log("API on", process.env.PORT));