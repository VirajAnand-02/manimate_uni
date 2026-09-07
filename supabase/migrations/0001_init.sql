-- Manimate: job state + generated-artifact storage.
-- Replaces the on-disk generations/{jobId}/*.json store.

create table if not exists public.jobs (
  id                uuid primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  topic             text not null,
  status            text not null default 'pending',
  overall_progress  int  not null default 0,
  current_stage     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  started_at        timestamptz,
  finished_at       timestamptz,
  elapsed_seconds   double precision,
  error             text,
  -- Storage object key (e.g. "<user_id>/<job_id>/video.mp4"), never a URL:
  -- signed URLs expire, so they are minted per request instead of persisted.
  final_video_path  text,
  options           jsonb not null default '{}'::jsonb,
  stages            jsonb not null default '{}'::jsonb,
  lecture_plan      jsonb,
  quiz              jsonb,
  constraint jobs_status_check
    check (status in ('pending', 'queued', 'running', 'completed', 'failed'))
);

create index if not exists jobs_user_created_idx
  on public.jobs (user_id, created_at desc);

-- Lets the boot-time reaper find jobs orphaned by a restart.
create index if not exists jobs_active_idx
  on public.jobs (status) where status in ('pending', 'queued', 'running');

alter table public.jobs enable row level security;

drop policy if exists "own jobs" on public.jobs;
create policy "own jobs" on public.jobs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep updated_at honest even for writes that forget it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_touch_updated_at on public.jobs;
create trigger jobs_touch_updated_at
  before update on public.jobs
  for each row execute function public.touch_updated_at();

-- ─── Storage ─────────────────────────────────────────────────────────
-- Private bucket. Only the final video and the generated Python land here;
-- media/, tts/ and voiceover_videos/ stay on the container's scratch disk.

insert into storage.buckets (id, name, public)
values ('generations', 'generations', false)
on conflict (id) do nothing;

drop policy if exists "own objects" on storage.objects;
create policy "own objects" on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'generations'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'generations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
