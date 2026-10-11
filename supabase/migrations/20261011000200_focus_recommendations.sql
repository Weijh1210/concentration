-- AI/rule recommendation decisions and per-user model call budget.
create table public.focus_recommendations (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid, task_type text not null check (task_type in ('study','reading','writing','practice','review','general')),
  input_json jsonb not null check (jsonb_typeof(input_json) = 'object'),
  plan_json jsonb not null check (jsonb_typeof(plan_json) = 'object'),
  final_plan_json jsonb check (final_plan_json is null or jsonb_typeof(final_plan_json) = 'object'),
  source text not null check (source in ('rule','ai')),
  fallback_reason text check (char_length(fallback_reason) <= 120),
  decision text not null check (decision in ('pending','accepted','modified','rejected')),
  session_id uuid, session_status text check (session_status in ('start_mode','focusing','paused','awaiting_finish','finished','abandoned')),
  actual_focus_ms bigint check (actual_focus_ms >= 0), feedback_focus smallint check (feedback_focus between 1 and 5),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  foreign key (task_id,user_id) references public.tasks(id,user_id),
  foreign key (session_id,user_id) references public.focus_sessions(id,user_id),
  check ((decision in ('accepted','modified')) = (session_id is not null)),
  check ((decision in ('accepted','modified')) = (final_plan_json is not null))
);
create index recommendations_owner_created on public.focus_recommendations(user_id,created_at desc);
create index recommendations_owner_session on public.focus_recommendations(user_id,session_id);
create trigger recommendations_revision before update on public.focus_recommendations
  for each row execute function public.set_record_revision();
alter table public.focus_recommendations enable row level security;
create policy recommendations_own on public.focus_recommendations for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.focus_recommendations from anon;
grant select,insert,update,delete on public.focus_recommendations to authenticated;

alter table public.sync_operations drop constraint sync_operations_entity_type_check;
alter table public.sync_operations add constraint sync_operations_entity_type_check
  check (entity_type in ('task','session','feedback','recommendation'));
create function public.apply_recommendation_change(p_operation_id uuid, p_payload jsonb, p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid; v_revision bigint;
  v_receipt public.sync_operations%rowtype;
  v_rec public.focus_recommendations%rowtype;
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_operation_id is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'invalid sync request' using errcode='22023';
  end if;
  v_id := (p_payload->>'id')::uuid;
  if v_id is null or (p_payload->>'user_id')::uuid is distinct from v_user then
    raise exception 'invalid owner or id' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text || p_operation_id::text,0));
  select * into v_receipt from public.sync_operations where operation_id=p_operation_id;
  if found then
    if v_receipt.user_id <> v_user or v_receipt.entity_type <> 'recommendation' or v_receipt.entity_id <> v_id then
      raise exception 'operation id reused' using errcode='23505';
    end if;
    return v_receipt.result_revision;
  end if;
  v_rec := pg_catalog.jsonb_populate_record(null::public.focus_recommendations,p_payload);
  if p_expected_revision = 0 then
    insert into public.focus_recommendations(id,user_id,task_id,task_type,input_json,plan_json,final_plan_json,
      source,fallback_reason,decision,session_id,session_status,actual_focus_ms,feedback_focus,created_at)
    values(v_id,v_user,v_rec.task_id,v_rec.task_type,v_rec.input_json,v_rec.plan_json,v_rec.final_plan_json,
      v_rec.source,v_rec.fallback_reason,v_rec.decision,v_rec.session_id,v_rec.session_status,
      v_rec.actual_focus_ms,v_rec.feedback_focus,v_rec.created_at)
    returning revision into v_revision;
  else
    update public.focus_recommendations set final_plan_json=v_rec.final_plan_json,decision=v_rec.decision,
      session_id=v_rec.session_id,session_status=v_rec.session_status,actual_focus_ms=v_rec.actual_focus_ms,
      feedback_focus=v_rec.feedback_focus
    where id=v_id and user_id=v_user and revision=p_expected_revision returning revision into v_revision;
  end if;
  if v_revision is null then raise exception 'revision conflict' using errcode='40001'; end if;
  insert into public.sync_operations(operation_id,user_id,entity_type,entity_id,result_revision)
    values(p_operation_id,v_user,'recommendation',v_id,v_revision);
  return v_revision;
end $$;
revoke all on function public.apply_recommendation_change(uuid,jsonb,bigint) from public,anon;
grant execute on function public.apply_recommendation_change(uuid,jsonb,bigint) to authenticated;

create table public.ai_recommendation_requests (
  request_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index ai_requests_owner_created on public.ai_recommendation_requests(user_id,created_at desc);
alter table public.ai_recommendation_requests enable row level security;
revoke all on public.ai_recommendation_requests from anon,authenticated;
create function public.reserve_ai_recommendation(p_request_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null or p_request_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,1));
  if exists(select 1 from public.ai_recommendation_requests where request_id=p_request_id) then return false; end if;
  delete from public.ai_recommendation_requests where user_id=v_user and created_at < now()-interval '30 days';
  if (select count(*) from public.ai_recommendation_requests where user_id=v_user and created_at >= now()-interval '1 minute') >= 1
    or (select count(*) from public.ai_recommendation_requests where user_id=v_user and created_at >= date_trunc('day',now())) >= 10 then
    raise exception 'rate_limited' using errcode='P0001';
  end if;
  insert into public.ai_recommendation_requests(request_id,user_id) values(p_request_id,v_user);
  return true;
end $$;
revoke all on function public.reserve_ai_recommendation(uuid) from public,anon;
grant execute on function public.reserve_ai_recommendation(uuid) to authenticated;
