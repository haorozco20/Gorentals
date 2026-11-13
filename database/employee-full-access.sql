
begin;
alter table public.go_employee_access add column if not exists full_access boolean not null default false;

create or replace function go_private.workspace_owner()
returns uuid language sql stable security definer set search_path='' as $$
 select case when go_private.is_confirmed_owner() then auth.uid() else
 (select a.owner_id from public.go_employee_access a join auth.users u on u.id=a.employee_id
 where a.employee_id=auth.uid() and a.active and a.full_access and u.email_confirmed_at is not null
 order by a.created_at limit 1) end
$$;
revoke all on function go_private.workspace_owner() from public,anon;
grant execute on function go_private.workspace_owner() to authenticated;

create or replace function go_private.can_manage_workspace(p_owner uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and p_owner=go_private.workspace_owner()
$$;
revoke all on function go_private.can_manage_workspace(uuid) from public,anon;
grant execute on function go_private.can_manage_workspace(uuid) to authenticated;

create or replace function public.go_workspace_access()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('owner_id',go_private.workspace_owner(),'is_owner',go_private.is_confirmed_owner(),'full_access',go_private.workspace_owner() is not null)
$$;
revoke all on function public.go_workspace_access() from public,anon;
grant execute on function public.go_workspace_access() to authenticated;

create policy go_full_access_state_read on public.go_app_state for select to authenticated using(go_private.can_manage_workspace(owner_id));
create policy go_full_access_state_update on public.go_app_state for update to authenticated using(go_private.can_manage_workspace(owner_id)) with check(go_private.can_manage_workspace(owner_id));
create policy go_full_access_history_read on public.go_state_history for select to authenticated using(go_private.can_manage_workspace(owner_id));
create policy go_full_access_deleted_read on public.go_deleted_rentals for select to authenticated using(go_private.can_manage_workspace(owner_id));
create policy go_full_access_reports_read on public.go_rental_reports for select to authenticated using(go_private.can_manage_workspace(owner_id));
create policy go_full_access_reports_update on public.go_rental_reports for update to authenticated using(go_private.can_manage_workspace(owner_id)) with check(go_private.can_manage_workspace(owner_id));
create policy go_full_access_photos_read on storage.objects for select to authenticated
 using(bucket_id='go-rental-photos' and split_part(name,'/',1)=go_private.workspace_owner()::text);

create table if not exists go_private.employee_access_audit(
 id bigint generated always as identity primary key,
 owner_id uuid not null,employee_id uuid not null,changed_by uuid not null,
 changed_at timestamptz not null default now(),previous_access jsonb not null,new_access jsonb not null
);
alter table go_private.employee_access_audit enable row level security;
revoke all on go_private.employee_access_audit from public,anon,authenticated;

create or replace function public.go_owner_set_employee_access(
 p_employee_id uuid,p_active boolean,p_full_access boolean,p_create boolean,p_edit boolean,p_delete boolean,p_photos boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare oldrow public.go_employee_access%rowtype; newrow public.go_employee_access%rowtype;
begin
 if not go_private.is_confirmed_owner() then raise exception 'Only the owner can change employee access'; end if;
 if p_employee_id=auth.uid() then raise exception 'Owner permissions cannot be changed here'; end if;
 if p_active is null or p_full_access is null or p_create is null or p_edit is null or p_delete is null or p_photos is null then raise exception 'All permission settings are required'; end if;
 select * into oldrow from public.go_employee_access where employee_id=p_employee_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Employee not found'; end if;
 update public.go_employee_access set active=p_active,full_access=p_full_access,
 can_create_rentals=p_create,can_edit_rentals=p_edit,can_delete_rentals=p_delete,can_upload_photos=p_photos
 where employee_id=p_employee_id and owner_id=auth.uid() returning * into newrow;
 insert into go_private.employee_access_audit(owner_id,employee_id,changed_by,previous_access,new_access)
 values(auth.uid(),p_employee_id,auth.uid(),to_jsonb(oldrow),to_jsonb(newrow));
 return true;
end $$;
revoke all on function public.go_owner_set_employee_access(uuid,boolean,boolean,boolean,boolean,boolean,boolean) from public,anon;
grant execute on function public.go_owner_set_employee_access(uuid,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;

do $patch$
declare def text;
begin
 select pg_get_functiondef('public.go_owner_employee_permissions()'::regprocedure) into def;
 def:=replace(def,'''active'',a.active,','''active'',a.active,''full_access'',a.full_access,');execute def;
 select pg_get_functiondef('public.go_employee_my_permissions()'::regprocedure) into def;
 def:=replace(def,'''active'',a.active,','''active'',a.active,''full_access'',(a.active and a.full_access),');execute def;
 select pg_get_functiondef('public.go_employee_permission(text)'::regprocedure) into def;
 def:=replace(def,'return case p_permission','if v_access.full_access then return p_permission in (''create'',''edit'',''delete'',''photos'');end if; return case p_permission');execute def;
 select pg_get_functiondef('public.go_owner_delete_rental(text)'::regprocedure) into def;
 def:=replace(def,'v_owner uuid:=auth.uid();','v_owner uuid:=go_private.workspace_owner();');
 def:=replace(def,'not go_private.is_confirmed_owner()','not go_private.can_manage_workspace(v_owner)');
 def:=replace(def,'values(v_owner,p_rental_id,v_employee,v_owner,v_rental)','values(v_owner,p_rental_id,v_employee,auth.uid(),v_rental)');execute def;
 select pg_get_functiondef('public.go_restore_deleted_rental(text)'::regprocedure) into def;
 def:=replace(def,'is_owner:=go_private.is_confirmed_owner();','is_owner:=go_private.workspace_owner() is not null;');
 def:=replace(def,'if is_owner then own:=actor;','if is_owner then own:=go_private.workspace_owner();');execute def;
end $patch$;
commit;

create policy employee_access_audit_no_direct_access on go_private.employee_access_audit for all to authenticated using(false) with check(false);
