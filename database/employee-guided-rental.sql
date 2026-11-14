CREATE OR REPLACE FUNCTION public.go_employee_save_rental(p_payload jsonb, p_report_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_employee uuid:=auth.uid(); v_owner uuid; v_state jsonb; v_vehicles jsonb; v_rentals jsonb; v_customers jsonb;
 v_plate text; v_name text; v_phone text; v_email text; v_notes text; v_gas text; v_payment_method text;
 v_pickup date; v_dropoff date; v_pickup_time time; v_dropoff_time time; v_rate numeric; v_paid numeric; v_total numeric;
 v_vehicle jsonb; v_customer jsonb; v_customer_id text; v_rental_id text; v_report_id uuid; v_old public.go_rental_reports%rowtype;
 v_existing jsonb; v_subtotal numeric; v_cut numeric;
 v_rental jsonb; v_found boolean:=false; v_currency text:='USD'; v_original numeric; v_fx numeric:=1;
begin
 select a.owner_id into v_owner from public.go_employee_access a where a.employee_id=v_employee and a.active limit 1;
 if v_owner is null or not go_private.employee_can_submit(v_owner) then raise exception 'Employee approval required'; end if;
 if not public.go_employee_permission(case when p_report_id is null then 'create' else 'edit' end) then raise exception 'You do not have permission to create or edit rentals'; end if;
 v_plate:=upper(trim(coalesce(p_payload->>'vehicle_plate','')));
 v_name:=trim(coalesce(p_payload->>'customer_name',''));
 v_phone:=left(trim(coalesce(p_payload->>'customer_phone','')),40);
 v_email:=lower(trim(coalesce(p_payload->>'customer_email','')));
 v_notes:=trim(coalesce(p_payload->>'notes',''));
 v_gas:=coalesce(p_payload->>'gas_level','');
 v_payment_method:=nullif(p_payload->>'payment_method','');
 if v_payment_method is null and p_report_id is not null then
  select payment_method into v_payment_method from public.go_rental_reports where id=p_report_id and employee_id=v_employee and owner_id=v_owner;
 end if;
 if v_payment_method is not null and v_payment_method not in ('cash','bank_transfer','credit_card') then raise exception 'Invalid payment method'; end if;
 if v_gas not in ('1/4','1/2','3/4','FULL') then raise exception 'Choose a valid gas level'; end if;
 if length(v_name)<2 or length(v_name)>140 or length(v_email)>254 or length(v_notes)>2000 or length(v_plate)<2 then raise exception 'Invalid rental details'; end if;
 begin
 v_pickup:=(p_payload->>'pickup')::date; v_dropoff:=(p_payload->>'dropoff')::date;
 v_pickup_time:=coalesce(nullif(p_payload->>'pickup_time','')::time,'09:00'::time);
 v_dropoff_time:=coalesce(nullif(p_payload->>'dropoff_time','')::time,'17:00'::time);
 v_rate:=(p_payload->>'rate')::numeric; v_paid:=coalesce(nullif(p_payload->>'paid','')::numeric,0);
 exception when others then raise exception 'Check dates and payment amounts'; end;
 if v_pickup is null or v_dropoff is null or (v_dropoff+v_dropoff_time)<=(v_pickup+v_pickup_time) or v_rate is null or v_rate<0 or v_rate>100000 or v_paid<0 or v_paid>1000000 then raise exception 'Invalid rental dates or amounts'; end if;
 select s.state into v_state from public.go_app_state s where s.owner_id=v_owner for update;
 if v_state is null then raise exception 'Owner state missing'; end if;
 v_vehicles:=coalesce(v_state->'vehicles','[]'::jsonb);
 select x into v_vehicle from jsonb_array_elements(v_vehicles) x where upper(trim(x->>'plate'))=v_plate limit 1;
 if v_vehicle is null then raise exception 'Vehicle not found'; end if;
 v_rentals:=coalesce(v_state->'rentals','[]'::jsonb);
 v_customers:=coalesce(v_state->'customers','[]'::jsonb);
 if p_report_id is not null then
  select * into v_old from public.go_rental_reports where id=p_report_id and employee_id=v_employee and owner_id=v_owner and status='accepted' for update;
  if not found then raise exception 'Rental not found or not editable'; end if;
  v_rental_id:=p_report_id::text;
  if not (p_payload ? 'paid' or p_payload ? 'paid_in_full') then
  select coalesce((r->>'paid')::numeric,v_old.paid,0) into v_paid from jsonb_array_elements(v_rentals) r where r->>'id'=v_rental_id limit 1;
 end if;
  if not exists(select 1 from jsonb_array_elements(v_rentals) r where r->>'id'=v_rental_id) then raise exception 'Rental was changed or removed by owner'; end if;
 else
  v_rental_id:=gen_random_uuid()::text;
 end if;
 select x into v_existing from jsonb_array_elements(v_rentals) x where x->>'id'=v_rental_id limit 1;
 v_subtotal:=round(greatest(1,v_dropoff-v_pickup)*v_rate,2);
 v_cut:=case coalesce(v_existing->>'discountType','none')
 when 'fixed' then coalesce((v_existing->>'discount')::numeric,0)
 when 'percent' then v_subtotal*coalesce((v_existing->>'discount')::numeric,0)/100 else 0 end;
 v_total:=greatest(0,v_subtotal-least(v_subtotal,greatest(0,v_cut)))+greatest(0,coalesce((v_existing->>'extras')::numeric,0));
 if p_payload ? 'paid_in_full' then
  if jsonb_typeof(p_payload->'paid_in_full')<>'boolean' then raise exception 'Choose whether the rental is paid in full';end if;
  if (p_payload->>'paid_in_full')::boolean then v_paid:=v_total;
  elsif not (p_payload ? 'paid') or nullif(p_payload->>'paid','') is null then raise exception 'Enter the amount paid';
  end if;
 end if;
 v_paid:=round(v_paid,2);
 if p_payload ? 'payment_currency' then
  v_currency:=p_payload->>'payment_currency';
  if v_currency not in ('USD','NIO') or v_currency is null then raise exception 'Invalid payment currency';end if;
  v_fx:=case when v_currency='NIO' then (p_payload->>'payment_exchange_rate')::numeric else 1 end;
  if v_fx is null or v_fx<=0 or v_fx>1000000 or v_fx::text='NaN' then raise exception 'Enter a valid exchange rate';end if;
  if coalesce((p_payload->>'paid_in_full')::boolean,false) then v_original:=round(v_total*v_fx,2);
  else v_original:=(p_payload->>'payment_original_amount')::numeric;
   if v_original is null or v_original<0 or v_original::text='NaN' then raise exception 'Enter the amount collected';end if;
   v_original:=round(v_original,2);v_paid:=round(v_original/v_fx,2);
  end if;
 else v_original:=v_paid;end if;
 if v_paid>v_total then raise exception 'Payment cannot exceed rental total'; end if;
 if exists (select 1 from jsonb_array_elements(v_rentals) r
   where r->>'vehicleId'=v_vehicle->>'id' and r->>'id'<>v_rental_id
   and r->>'status'<>'returned'
   and (v_pickup+v_pickup_time)<((r->>'dropoff')::date+coalesce(nullif(r->>'dropoffTime','')::time,'23:59'::time))
   and (v_dropoff+v_dropoff_time)>((r->>'pickup')::date+coalesce(nullif(r->>'pickupTime','')::time,'00:00'::time)))
 then raise exception 'Vehicle already booked for these dates'; end if;
 select c into v_customer from jsonb_array_elements(v_customers) c
 where (v_email<>'' and lower(coalesce(c->>'email',''))=v_email)
 or (v_phone<>'' and regexp_replace(coalesce(c->>'phone',''),'\s','','g')=regexp_replace(v_phone,'\s','','g'))
 or lower(trim(coalesce(c->>'name','')))=lower(v_name)
 limit 1;
 if p_report_id is not null then
  select c into v_customer from jsonb_array_elements(v_customers) c
  join lateral jsonb_array_elements(v_rentals) r on r->>'customerId'=c->>'id'
  where r->>'id'=v_rental_id limit 1;
 end if;
 if v_customer is null then
   v_customer_id:=gen_random_uuid()::text;
   v_customers:=v_customers||jsonb_build_array(jsonb_build_object('id',v_customer_id,'name',v_name,'phone',v_phone,'email',v_email));
 else
   v_customer_id:=v_customer->>'id';
   select coalesce(jsonb_agg(case when c->>'id'=v_customer_id
       then c||jsonb_build_object('name',v_name,'phone',case when v_phone<>'' then v_phone else coalesce(c->>'phone','') end,'email',case when v_email<>'' then v_email else coalesce(c->>'email','') end)
       else c end),'[]'::jsonb) into v_customers from jsonb_array_elements(v_customers) c;
 end if;
 v_rental:=jsonb_build_object('id',v_rental_id,'vehicleId',v_vehicle->>'id','customerId',v_customer_id,
 'phone',v_phone,'email',v_email,'pickup',v_pickup,'dropoff',v_dropoff,'pickupTime',to_char(v_pickup_time,'HH24:MI'),'dropoffTime',to_char(v_dropoff_time,'HH24:MI'),'rate',v_rate,'paid',v_paid,
 'discountType',coalesce(v_existing->>'discountType','none'),'discount',coalesce((v_existing->>'discount')::numeric,0),'extras',coalesce((v_existing->>'extras')::numeric,0),'total',v_total,'status',coalesce(v_existing->>'status','reserved'),'notes',v_notes,'gasLevel',v_gas,'paymentMethod',v_payment_method);
 if p_payload ? 'payment_currency' then
  v_rental:=v_rental||jsonb_build_object('paymentCurrency',v_currency,'paymentOriginalAmount',v_original,'paymentExchangeRate',v_fx);
 end if;
 if p_report_id is null then
  v_rentals:=v_rentals||jsonb_build_array(v_rental);
  v_report_id:=v_rental_id::uuid;
  insert into public.go_rental_reports(id,owner_id,employee_id,vehicle_plate,customer_name,customer_phone,customer_email,pickup,dropoff,rate,paid,notes,status,gas_level,pickup_time,dropoff_time,payment_method,payment_currency,payment_original_amount,payment_exchange_rate)
  values(v_report_id,v_owner,v_employee,v_plate,v_name,v_phone,v_email,v_pickup,v_dropoff,v_rate,v_paid,v_notes,'accepted',v_gas,v_pickup_time,v_dropoff_time,v_payment_method,v_currency,v_original,v_fx);
 else
  v_report_id:=p_report_id;
  select coalesce(jsonb_agg(case when r->>'id'=v_rental_id then r||v_rental else r end),'[]'::jsonb)
  into v_rentals from jsonb_array_elements(v_rentals) r;
  update public.go_rental_reports set vehicle_plate=v_plate,customer_name=v_name,customer_phone=v_phone,customer_email=v_email,pickup=v_pickup,dropoff=v_dropoff,rate=v_rate,paid=v_paid,notes=v_notes,gas_level=v_gas,pickup_time=v_pickup_time,dropoff_time=v_dropoff_time,payment_method=v_payment_method,
 payment_currency=case when p_payload ? 'payment_currency' then v_currency else payment_currency end,
 payment_original_amount=case when p_payload ? 'payment_currency' then v_original else payment_original_amount end,
 payment_exchange_rate=case when p_payload ? 'payment_currency' then v_fx else payment_exchange_rate end where id=v_report_id;
 end if;
 update public.go_app_state set state=jsonb_set(jsonb_set(state,'{customers}',v_customers),'{rentals}',v_rentals),
 revision=revision+1,updated_at=now() where owner_id=v_owner;
 return v_report_id;
end $function$;

CREATE OR REPLACE FUNCTION public.go_employee_my_rentals()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid; v jsonb;
begin
 select a.owner_id into v_owner from public.go_employee_access a where a.employee_id=auth.uid() and a.active limit 1;
 if v_owner is null or not go_private.employee_can_submit(v_owner) then raise exception 'Employee approval required'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'vehicle_plate',r.vehicle_plate,'customer_name',r.customer_name,'customer_phone',r.customer_phone,'customer_email',r.customer_email,'pickup',r.pickup,'dropoff',r.dropoff,'pickup_time',to_char(r.pickup_time,'HH24:MI'),'dropoff_time',to_char(r.dropoff_time,'HH24:MI'),'rate',r.rate,'paid',r.paid,'payment_currency',r.payment_currency,'payment_original_amount',r.payment_original_amount,'payment_exchange_rate',r.payment_exchange_rate,'gas_level',r.gas_level,'payment_method',r.payment_method,'notes',r.notes,'created_at',r.created_at)||coalesce((select jsonb_strip_nulls(jsonb_build_object('pickup',x->'pickup','dropoff',x->'dropoff','pickup_time',x->'pickupTime','dropoff_time',x->'dropoffTime','rate',x->'rate','paid',x->'paid','total',x->'total','discountType',x->'discountType','discount',x->'discount','extras',x->'extras','status',x->'status','notes',x->'notes','payment_currency',x->'paymentCurrency','payment_original_amount',x->'paymentOriginalAmount','payment_exchange_rate',x->'paymentExchangeRate','gas_level',x->'gasLevel','payment_method',x->'paymentMethod') ) from public.go_app_state s cross join lateral jsonb_array_elements(coalesce(s.state->'rentals','[]'::jsonb)) x where s.owner_id=v_owner and x->>'id'=r.id::text limit 1),'{}'::jsonb) order by r.created_at desc),'[]'::jsonb)
 into v from public.go_rental_reports r where r.employee_id=auth.uid() and r.owner_id=v_owner and r.status='accepted';
 return v;
end $function$;

create or replace function public.go_employee_vehicle_available(p_plate text,p_pickup date,p_dropoff date,p_pickup_time time,p_dropoff_time time,p_report_id uuid default null)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_owner uuid; v_state jsonb; v_vehicle text;
begin
 select a.owner_id into v_owner from public.go_employee_access a where a.employee_id=auth.uid() and a.active limit 1;
 if v_owner is null or not go_private.employee_can_submit(v_owner) then raise exception 'Employee approval required';end if;
 if p_report_id is not null and not exists(select 1 from public.go_rental_reports where id=p_report_id and employee_id=auth.uid() and owner_id=v_owner and status='accepted') then raise exception 'Rental not found';end if;
 if not public.go_employee_permission(case when p_report_id is null then 'create' else 'edit' end) then raise exception 'Rental permission required';end if;
 if p_pickup is null or p_dropoff is null or p_pickup_time is null or p_dropoff_time is null or p_dropoff+p_dropoff_time<=p_pickup+p_pickup_time then raise exception 'Invalid rental dates';end if;
 select state into v_state from public.go_app_state where owner_id=v_owner;
 select x->>'id' into v_vehicle from jsonb_array_elements(coalesce(v_state->'vehicles','[]'::jsonb)) x where upper(trim(x->>'plate'))=upper(trim(p_plate)) limit 1;
 if v_vehicle is null then raise exception 'Vehicle not found';end if;
 return not exists(select 1 from jsonb_array_elements(coalesce(v_state->'rentals','[]'::jsonb)) x
 where x->>'vehicleId'=v_vehicle and x->>'id' is distinct from p_report_id::text and coalesce(x->>'status','reserved')<>'returned'
 and p_pickup+p_pickup_time<(x->>'dropoff')::date+coalesce(nullif(x->>'dropoffTime','')::time,'23:59'::time)
 and p_dropoff+p_dropoff_time>(x->>'pickup')::date+coalesce(nullif(x->>'pickupTime','')::time,'00:00'::time));
end $$;
revoke all on function public.go_employee_vehicle_available(text,date,date,time,time,uuid) from public,anon;
grant execute on function public.go_employee_vehicle_available(text,date,date,time,time,uuid) to authenticated;