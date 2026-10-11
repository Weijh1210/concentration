-- Concentration MVP. Run with Supabase CLI migrations; never embed a service key in the app.
create extension if not exists pgcrypto;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  timezone text not null default 'Asia/Shanghai' check (char_length(timezone) between 1 and 80),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0)
);
create table public.tasks (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 2000),
  estimated_minutes smallint check (estimated_minutes between 1 and 240),
  status text not null default 'open' check (status in ('open','completed')),
  completed_at timestamptz, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (id,user_id), check ((status = 'completed') = (completed_at is not null))
);
create table public.environments (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sound_key text not null check (sound_key in ('none','soft_noise')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, revision bigint not null default 1,
  unique (id,user_id)
);
create table public.focus_sessions (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid, environment_id uuid,
  status text not null check (status in ('start_mode','focusing','paused','awaiting_finish','finished','abandoned')),
  phase text not null check (phase in ('start_mode','focus')),
  started_at timestamptz not null, ended_at timestamptz,
  active_segment_started_at timestamptz, paused_at timestamptz,
  accumulated_start_ms bigint not null default 0 check (accumulated_start_ms >= 0),
  accumulated_focus_ms bigint not null default 0 check (accumulated_focus_ms >= 0),
  planned_duration_ms integer not null check (planned_duration_ms between 60000 and 14400000),
  extended boolean not null default false,
  energy text not null check (energy in ('low','medium','high')),
  start_friction text not null check (start_friction in ('low','high')),
  available_minutes smallint not null check (available_minutes in (5,15,25,45,60)),
  recommendation_reason_code text not null, recommendation_rule_version text not null,
  end_reason text check (end_reason in ('goal_reached','user_ended','interrupted')),
  clock_warning boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0), unique (id,user_id),
  foreign key (task_id,user_id) references public.tasks(id,user_id),
  foreign key (environment_id,user_id) references public.environments(id,user_id),
  check ((status in ('finished','abandoned')) = (ended_at is not null)),
  check (ended_at is null or ended_at >= started_at),
  check (active_segment_started_at is null or status in ('start_mode','focusing'))
);
create table public.session_events (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  event_type text not null check (event_type in ('created','paused','resumed','start_completed','goal_extended','finished','abandoned')),
  occurred_at timestamptz not null, payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (session_id,user_id) references public.focus_sessions(id,user_id) on delete cascade
);
create table public.session_feedback (
  session_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  perceived_focus smallint check (perceived_focus between 1 and 5),
  interruption_count smallint check (interruption_count between 0 and 2),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  foreign key (session_id,user_id) references public.focus_sessions(id,user_id) on delete cascade,
  check (perceived_focus is not null or interruption_count is not null or char_length(btrim(note)) > 0)
);
create table public.sync_operations (
  operation_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('task','session','feedback')),
  entity_id uuid not null, result_revision bigint not null,
  created_at timestamptz not null default now()
);
create index tasks_owner_updated on public.tasks(user_id,updated_at,id);
create index sessions_owner_updated on public.focus_sessions(user_id,updated_at,id);
create index feedback_owner_updated on public.session_feedback(user_id,updated_at,session_id);
create index events_owner_session on public.session_events(user_id,session_id,occurred_at);
create index environments_owner_updated on public.environments(user_id,updated_at,id);
create index sync_operations_owner on public.sync_operations(user_id,created_at);
create unique index one_active_session_per_user on public.focus_sessions(user_id)
  where status in ('start_mode','focusing','paused','awaiting_finish');

create function public.set_record_revision() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then raise exception 'owner cannot change' using errcode = '42501'; end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.revision := old.revision + 1;
  return new;
end $$;
create trigger profiles_revision before update on public.profiles for each row execute function public.set_record_revision();
create trigger tasks_revision before update on public.tasks for each row execute function public.set_record_revision();
create trigger sessions_revision before update on public.focus_sessions for each row execute function public.set_record_revision();
create trigger feedback_revision before update on public.session_feedback for each row execute function public.set_record_revision();
create trigger environments_revision before update on public.environments for each row execute function public.set_record_revision();
create function public.feedback_requires_finished() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.focus_sessions where id = new.session_id and user_id = new.user_id and status = 'finished') then
    raise exception 'feedback requires a finished session' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger feedback_finished before insert or update on public.session_feedback for each row execute function public.feedback_requires_finished();
create function public.create_profile_for_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id) values (new.id);
  return new;
end $$;
create trigger auth_user_profile after insert on auth.users for each row execute function public.create_profile_for_user();

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.session_events enable row level security;
alter table public.session_feedback enable row level security;
alter table public.environments enable row level security;
alter table public.sync_operations enable row level security;

-- Separate policies make both USING and WITH CHECK explicit. Anonymous clients have no policy.
create policy profiles_own on public.profiles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy tasks_own on public.tasks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy sessions_own on public.focus_sessions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy events_own on public.session_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy feedback_own on public.session_feedback for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy environments_own on public.environments for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy operations_own on public.sync_operations for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Event/operation audit rows are append-only for mobile clients.
revoke all on public.session_events, public.sync_operations from authenticated;
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.profiles, public.tasks, public.focus_sessions, public.session_feedback, public.environments to authenticated;
grant select on public.session_events to authenticated;


-- Record important transitions on the server so retries cannot duplicate event history.
create function public.record_session_event() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_type text;
begin
  if tg_op = 'INSERT' then v_type := 'created';
  elsif new.status = old.status and new.phase = old.phase then return new;
  elsif new.status = 'finished' then v_type := 'finished';
  elsif new.status = 'abandoned' then v_type := 'abandoned';
  elsif new.status = 'paused' then v_type := 'paused';
  elsif old.status = 'paused' then v_type := 'resumed';
  elsif old.phase = 'start_mode' and new.phase = 'focus' then v_type := 'start_completed';
  else return new;
  end if;
  insert into public.session_events(id,user_id,session_id,event_type,occurred_at)
    values(gen_random_uuid(),new.user_id,new.id,v_type,now());
  return new;
end $$;
create trigger session_event_created after insert or update on public.focus_sessions
  for each row execute function public.record_session_event();

-- Atomic compare-and-swap plus operation receipt. A retry returns the earlier revision.
create function public.apply_sync_change(p_operation_id uuid, p_entity_type text, p_payload jsonb, p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_revision bigint;
  v_receipt public.sync_operations%rowtype;
  v_task public.tasks%rowtype;
  v_session public.focus_sessions%rowtype;
  v_feedback public.session_feedback%rowtype;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_operation_id is null or p_expected_revision < 0 or p_entity_type not in ('task','session','feedback') then
    raise exception 'invalid sync request' using errcode = '22023';
  end if;
  v_id := case when p_entity_type = 'feedback' then (p_payload->>'session_id')::uuid else (p_payload->>'id')::uuid end;
  if v_id is null or (p_payload->>'user_id')::uuid is distinct from v_user then
    raise exception 'invalid owner or id' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text || p_operation_id::text, 0));
  select * into v_receipt from public.sync_operations where operation_id = p_operation_id;
  if found then
    if v_receipt.user_id <> v_user or v_receipt.entity_type <> p_entity_type or v_receipt.entity_id <> v_id then
      raise exception 'operation id reused' using errcode = '23505';
    end if;
    return v_receipt.result_revision;
  end if;
  if p_entity_type = 'task' then
    v_task := pg_catalog.jsonb_populate_record(null::public.tasks,p_payload);
    if p_expected_revision = 0 then
      insert into public.tasks(id,user_id,title,notes,estimated_minutes,status,completed_at,created_at,deleted_at)
      values(v_task.id,v_user,v_task.title,v_task.notes,v_task.estimated_minutes,v_task.status,v_task.completed_at,v_task.created_at,v_task.deleted_at)
      returning revision into v_revision;
    else
      update public.tasks set title=v_task.title, notes=v_task.notes, estimated_minutes=v_task.estimated_minutes,
        status=v_task.status, completed_at=v_task.completed_at, deleted_at=v_task.deleted_at
      where id=v_id and user_id=v_user and revision=p_expected_revision returning revision into v_revision;
    end if;
  elsif p_entity_type = 'session' then
    v_session := pg_catalog.jsonb_populate_record(null::public.focus_sessions,p_payload);
    if p_expected_revision = 0 then
      insert into public.focus_sessions(id,user_id,task_id,environment_id,status,phase,started_at,ended_at,active_segment_started_at,
        paused_at,accumulated_start_ms,accumulated_focus_ms,planned_duration_ms,extended,energy,start_friction,
        available_minutes,recommendation_reason_code,recommendation_rule_version,end_reason,clock_warning,created_at)
      values(v_session.id,v_user,v_session.task_id,v_session.environment_id,v_session.status,v_session.phase,v_session.started_at,
        v_session.ended_at,v_session.active_segment_started_at,v_session.paused_at,v_session.accumulated_start_ms,
        v_session.accumulated_focus_ms,v_session.planned_duration_ms,v_session.extended,v_session.energy,
        v_session.start_friction,v_session.available_minutes,v_session.recommendation_reason_code,
        v_session.recommendation_rule_version,v_session.end_reason,v_session.clock_warning,v_session.created_at)
      returning revision into v_revision;
    else
      update public.focus_sessions set status=v_session.status, phase=v_session.phase, ended_at=v_session.ended_at,
        active_segment_started_at=v_session.active_segment_started_at, paused_at=v_session.paused_at,
        accumulated_start_ms=v_session.accumulated_start_ms, accumulated_focus_ms=v_session.accumulated_focus_ms,
        extended=v_session.extended, end_reason=v_session.end_reason, clock_warning=v_session.clock_warning
      where id=v_id and user_id=v_user and revision=p_expected_revision returning revision into v_revision;
    end if;
  else
    v_feedback := pg_catalog.jsonb_populate_record(null::public.session_feedback,p_payload);
    if p_expected_revision = 0 then
      insert into public.session_feedback(session_id,user_id,perceived_focus,interruption_count,note,created_at)
      values(v_id,v_user,v_feedback.perceived_focus,v_feedback.interruption_count,v_feedback.note,v_feedback.created_at)
      returning revision into v_revision;
    else
      update public.session_feedback set perceived_focus=v_feedback.perceived_focus,
        interruption_count=v_feedback.interruption_count,note=v_feedback.note
      where session_id=v_id and user_id=v_user and revision=p_expected_revision returning revision into v_revision;
    end if;
  end if;
  if v_revision is null then raise exception 'revision conflict' using errcode = '40001'; end if;
  insert into public.sync_operations(operation_id,user_id,entity_type,entity_id,result_revision)
    values(p_operation_id,v_user,p_entity_type,v_id,v_revision);
  return v_revision;
end $$;
revoke all on function public.apply_sync_change(uuid,text,jsonb,bigint) from public, anon;
grant execute on function public.apply_sync_change(uuid,text,jsonb,bigint) to authenticated;
