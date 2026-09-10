-- Merge one stage's progress in a single statement.
--
-- Two reasons this moved out of the application:
--
--   1. updateStage() used to SELECT the row, merge in JS, then UPDATE — two
--      network round trips on every progress tick, and there are dozens per job.
--   2. Renders now run concurrently, so read-modify-write in the app raced:
--      two scenes finishing together would each merge onto the same snapshot and
--      one update would be lost. SELECT ... FOR UPDATE serialises them here.

create or replace function public.update_job_stage(
  p_job_id uuid,
  p_stage  text,
  p_patch  jsonb
)
returns void
language plpgsql
as $$
declare
  v_weights   jsonb := '{"web_research":5,"lecture_planning":15,"code_generation":20,
                         "rendering":35,"voiceover":15,"stitching":10}'::jsonb;
  v_stages    jsonb;
  v_stage     jsonb;
  v_started   double precision;
  v_finished  double precision;
  v_now       double precision := extract(epoch from now());
  v_job_start timestamptz;
  v_progress  int := 0;
  v_key       text;
  v_weight    int;
  v_entry     jsonb;
begin
  select stages, started_at
    into v_stages, v_job_start
    from public.jobs
   where id = p_job_id
     for update;

  if not found then
    return;
  end if;

  v_stages := coalesce(v_stages, '{}'::jsonb);
  v_stage  := coalesce(v_stages -> p_stage, '{}'::jsonb);

  -- started_at is stamped on the first transition into running and never moves.
  v_started := nullif(v_stage ->> 'started_at', '')::double precision;
  if (p_patch ->> 'status') = 'running' and v_started is null then
    v_started := v_now;
  end if;

  v_finished := nullif(v_stage ->> 'finished_at', '')::double precision;
  if (p_patch ->> 'status') in ('done', 'failed', 'skipped') then
    v_finished := v_now;
  end if;

  v_stage := v_stage || p_patch || jsonb_build_object(
    'started_at',  to_jsonb(v_started),
    'finished_at', to_jsonb(v_finished),
    'elapsed_seconds',
      case
        when v_started is not null and v_finished is not null
          then to_jsonb(greatest(0, v_finished - v_started))
        else coalesce(v_stage -> 'elapsed_seconds', 'null'::jsonb)
      end
  );

  v_stages := v_stages || jsonb_build_object(p_stage, v_stage);

  for v_key, v_weight in select key, value::int from jsonb_each_text(v_weights) loop
    v_entry := v_stages -> v_key;
    if v_entry is null then
      continue;
    end if;
    if (v_entry ->> 'status') in ('done', 'skipped') then
      v_progress := v_progress + v_weight;
    elsif (v_entry ->> 'status') = 'running' then
      v_progress := v_progress + round(
        v_weight * least(100, greatest(0, coalesce((v_entry ->> 'pct')::numeric, 0))) / 100
      );
    end if;
  end loop;

  update public.jobs
     set stages           = v_stages,
         overall_progress = least(100, v_progress),
         current_stage    = case when (p_patch ->> 'status') = 'running'
                                 then p_stage else current_stage end,
         elapsed_seconds  = case when v_job_start is not null
                                 then extract(epoch from (now() - v_job_start))
                                 else elapsed_seconds end,
         updated_at       = now()
   where id = p_job_id;
end;
$$;

-- security invoker (the default): a caller holding only the anon/authenticated
-- role still cannot touch another user's row, because the UPDATE inside is
-- subject to the same RLS policy as a direct write would be.
grant execute on function public.update_job_stage(uuid, text, jsonb) to authenticated, service_role;
