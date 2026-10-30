CREATE TABLE agent_actions (
  id SERIAL PRIMARY KEY,
  workspace_id INT REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id INT REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('reschedule_task','reassign_task','nudge_owner')),
  payload JSONB NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','stale')),
  requested_by INT REFERENCES users(id),
  decided_by INT REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON agent_actions (workspace_id, status, id DESC);