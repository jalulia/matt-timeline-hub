CREATE TABLE public.timeline_docs (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{"milestones":[],"projects":[]}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.timeline_docs ENABLE ROW LEVEL SECURITY;

-- Shared timeline: anyone (anon + authenticated) can read and write the single shared doc.
CREATE POLICY "Anyone can read timelines"
  ON public.timeline_docs FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert timelines"
  ON public.timeline_docs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update timelines"
  ON public.timeline_docs FOR UPDATE
  USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.timeline_docs;
ALTER TABLE public.timeline_docs REPLICA IDENTITY FULL;

INSERT INTO public.timeline_docs (id, data) VALUES ('shared', '{"milestones":[],"projects":[]}'::jsonb)
  ON CONFLICT (id) DO NOTHING;