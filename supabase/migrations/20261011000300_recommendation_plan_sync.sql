-- Keep the generated plan and its source when a pending local rule plan is replaced by AI.
create or replace function public.apply_recommendation_change(p_operation_id uuid, p_payload jsonb, p_expected_revision bigint)
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
    update public.focus_recommendations set plan_json=v_rec.plan_json,source=v_rec.source,
      fallback_reason=v_rec.fallback_reason,final_plan_json=v_rec.final_plan_json,decision=v_rec.decision,
      session_id=v_rec.session_id,session_status=v_rec.session_status,actual_focus_ms=v_rec.actual_focus_ms,
      feedback_focus=v_rec.feedback_focus
    where id=v_id and user_id=v_user and revision=p_expected_revision returning revision into v_revision;
  end if;
  if v_revision is null then raise exception 'revision conflict' using errcode='40001'; end if;
  insert into public.sync_operations(operation_id,user_id,entity_type,entity_id,result_revision)
    values(p_operation_id,v_user,'recommendation',v_id,v_revision);
  return v_revision;
end $$;
