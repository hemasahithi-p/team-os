-- Gemini embeddings use 768 numbers (was 1536; no vectors stored yet)
ALTER TABLE tasks DROP COLUMN embedding;
ALTER TABLE tasks ADD COLUMN embedding vector(768);

CREATE TABLE meetings (
  id SERIAL PRIMARY KEY,
  workspace_id INT REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id INT REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  decisions JSONB NOT NULL DEFAULT '[]',
  created_by INT REFERENCES users(id),
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tasks ADD COLUMN meeting_id INT REFERENCES meetings(id) ON DELETE SET NULL;

CREATE INDEX ON meetings (workspace_id, id DESC);
CREATE INDEX ON tasks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON meetings USING hnsw (embedding vector_cosine_ops);