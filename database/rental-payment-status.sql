do $patch$
declare def text;
begin
 select pg_get_functiondef('public.go_employee_save_rental(jsonb,uuid)'::regprocedure) into def;
 def:=replace(def,'v_total:=greatest(1,v_dropoff-v_pickup)*v_rate;', 'v_total:=round(greatest(1,v_dropoff-v_pickup)*v_rate,2);
 if p_payload ? ''paid_in_full'' then
  if jsonb_typeof(p_payload->''paid_in_full'')<>''boolean'' then raise exception ''Choose whether the rental is paid in full'';end if;
  if (p_payload->>''paid_in_full'')::boolean then v_paid:=v_total;
  elsif not (p_payload ? ''paid'') or nullif(p_payload->>''paid'','''') is null then raise exception ''Enter the amount paid'';
  end if;
 end if;
 v_paid:=round(v_paid,2);');
 def:=replace(def,'v_paid:=coalesce(v_old.paid,0);','if not (p_payload ? ''paid'' or p_payload ? ''paid_in_full'') then
  select coalesce((r->>''paid'')::numeric,v_old.paid,0) into v_paid from jsonb_array_elements(v_rentals) r where r->>''id''=v_rental_id limit 1;
 end if;');
 execute def;
end $patch$;