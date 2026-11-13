
alter table public.go_deleted_rentals add column if not exists restored_at timestamptz;
alter table public.go_deleted_rentals add column if not exists restored_by uuid;
alter table public.go_deleted_rentals add column if not exists restore_history jsonb not null default '[]'::jsonb;

create or replace function public.go_restore_deleted_rental(p_rental_id text)
returns boolean language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); own uuid; is_owner boolean;
 archive public.go_deleted_rentals%rowtype;
 st jsonb; rental jsonb; report public.go_rental_reports%rowtype;
 vehicle jsonb; customer jsonb; customer_id text;
begin
 if actor is null then raise exception 'Sign in required'; end if;
 if p_rental_id is null or length(p_rental_id)>100 then raise exception 'Invalid rental'; end if;
 is_owner:=go_private.is_confirmed_owner();
 if is_owner then own:=actor;
 else
  select owner_id into own from public.go_employee_access where employee_id=actor and active limit 1;
  if own is null or not go_private.employee_can_submit(own)
   or not public.go_employee_permission('create') or not public.go_employee_permission('edit')
  then raise exception 'You do not have permission to restore rentals'; end if;
 end if;
 -- Match the save/delete lock order to serialize against other bookings.
 select state into st from public.go_app_state where owner_id=own for update;
 if st is null then raise exception 'Owner records unavailable'; end if;
 select * into archive from public.go_deleted_rentals
 where owner_id=own and rental_id=p_rental_id for update;
 if not found then raise exception 'Deleted rental not found'; end if;
 if not is_owner and (archive.employee_id is distinct from actor or archive.deleted_by is distinct from actor)
 then raise exception 'You may only restore rentals you deleted yourself'; end if;
 if archive.restored_at is not null or exists(select 1 from jsonb_array_elements(coalesce(st->'rentals','[]')) r where r->>'id'=p_rental_id)
 then raise exception 'This rental is already active or restored'; end if;
 rental:=archive.details;
 select * into report from public.go_rental_reports where id::text=p_rental_id and owner_id=own for update;
 select v into vehicle from jsonb_array_elements(coalesce(st->'vehicles','[]')) v
 where v->>'id'=rental->>'vehicleId' or (rental->>'vehicleId' is null and upper(v->>'plate')=upper(coalesce(rental->>'vehiclePlate',report.vehicle_plate))) limit 1;
 if vehicle is null then raise exception 'Vehicle no longer exists. Ask the owner to review this rental.'; end if;
 if rental->>'pickup' is null or rental->>'dropoff' is null or rental->>'total' is null
 then raise exception 'Rental history is incomplete. Ask the owner to review it.'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(st->'rentals','[]')) r
 where r->>'vehicleId'=vehicle->>'id' and r->>'status'<>'returned' and coalesce(rental->>'status','reserved')<>'returned'
 and ((rental->>'pickup')::date+coalesce(nullif(rental->>'pickupTime','')::time,'09:00'::time))<
 ((r->>'dropoff')::date+coalesce(nullif(r->>'dropoffTime','')::time,'23:59'::time))
 and ((rental->>'dropoff')::date+coalesce(nullif(rental->>'dropoffTime','')::time,'17:00'::time))>
 ((r->>'pickup')::date+coalesce(nullif(r->>'pickupTime','')::time,'00:00'::time)))
 then raise exception 'Vehicle already booked for these dates. Resolve the conflict before restoring.'; end if;
 select c into customer from jsonb_array_elements(coalesce(st->'customers','[]')) c where c->>'id'=rental->>'customerId' limit 1;
 if customer is null then
  if coalesce(nullif(rental->>'customerName',''),report.customer_name) is null
  then raise exception 'Customer no longer exists. Ask the owner to review this rental.'; end if;
  customer_id:=gen_random_uuid()::text;
  customer:=jsonb_build_object('id',customer_id,'name',coalesce(rental->>'customerName',report.customer_name),'phone',coalesce(rental->>'phone',report.customer_phone,''),'email',coalesce(rental->>'email',report.customer_email,''));
  st:=jsonb_set(st,'{customers}',coalesce(st->'customers','[]')||jsonb_build_array(customer));
 else customer_id:=customer->>'id'; end if;
 rental:=rental||jsonb_build_object('id',p_rental_id,'vehicleId',vehicle->>'id','customerId',customer_id,'status',coalesce(rental->>'status','reserved'),'paid',coalesce(rental->'paid',to_jsonb(report.paid),'0'::jsonb));
 update public.go_app_state set state=jsonb_set(st,'{rentals}',coalesce(st->'rentals','[]')||jsonb_build_array(rental)),revision=revision+1,updated_at=now() where owner_id=own;
 update public.go_rental_reports set status='accepted' where id::text=p_rental_id and owner_id=own;
 update public.go_deleted_rentals set restored_at=now(),restored_by=actor,
 restore_history=restore_history||jsonb_build_array(jsonb_build_object('deleted_at',archive.deleted_at,'deleted_by',archive.deleted_by,'details',archive.details,'restored_at',now(),'restored_by',actor))
 where id=archive.id;
 return true;
end $$;
revoke all on function public.go_restore_deleted_rental(text) from public,anon;
grant execute on function public.go_restore_deleted_rental(text) to authenticated;

-- Refresh snapshots on repeated deletion while retaining the restoration audit.
do $patch$
declare def text;
begin
 select pg_get_functiondef('public.go_owner_delete_rental(text)'::regprocedure) into def;
 def:=replace(def,'on conflict(owner_id,rental_id) do nothing;','on conflict(owner_id,rental_id) do update set details=excluded.details,deleted_at=excluded.deleted_at,deleted_by=excluded.deleted_by,employee_id=excluded.employee_id,restored_at=null,restored_by=null;');
 execute def;
 select pg_get_functiondef('public.go_employee_delete_rental(uuid)'::regprocedure) into def;
 -- Capture the complete original rental before it is removed from the active array.
 def:=replace(def,'v_found boolean;','v_found boolean; v_snapshot jsonb;');
 def:=replace(def,'-- This rental may already', 'select r into v_snapshot from jsonb_array_elements(v_rentals) r where r->>''id''=p_report_id::text limit 1; -- This rental may already');
 def:=replace(def,'coalesce('||chr(10)||' (select x from jsonb_array_elements', 'coalesce(v_snapshot,'||chr(10)||' (select x from jsonb_array_elements');
 def:=replace(def,'on conflict(owner_id,rental_id) do nothing;','on conflict(owner_id,rental_id) do update set details=excluded.details,deleted_at=excluded.deleted_at,deleted_by=excluded.deleted_by,employee_id=excluded.employee_id,restored_at=null,restored_by=null;');
 execute def;
 select pg_get_functiondef('public.go_employee_my_deleted_rentals()'::regprocedure) into def;
 def:=replace(def,'''deleted_at'',d.deleted_at)', '''deleted_at'',d.deleted_at,''restored_at'',d.restored_at,''can_restore'',(d.deleted_by=auth.uid() and public.go_employee_permission(''create'') and public.go_employee_permission(''edit'')))');
 execute def;
end $patch$;
