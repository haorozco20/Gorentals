
begin;
alter table public.go_rental_reports add column if not exists payment_currency text not null default 'USD';
alter table public.go_rental_reports add column if not exists payment_original_amount numeric;
alter table public.go_rental_reports add column if not exists payment_exchange_rate numeric;
do $patch$
declare def text;
begin
 select pg_get_functiondef('public.go_employee_save_rental(jsonb,uuid)'::regprocedure) into def;
 def:=replace(def,'v_rental jsonb; v_found boolean:=false;','v_rental jsonb; v_found boolean:=false; v_currency text:=''USD''; v_original numeric; v_fx numeric:=1;');
 def:=replace(def,'v_paid:=round(v_paid,2);','v_paid:=round(v_paid,2);
 if p_payload ? ''payment_currency'' then
  v_currency:=p_payload->>''payment_currency'';
  if v_currency not in (''USD'',''NIO'') or v_currency is null then raise exception ''Invalid payment currency'';end if;
  v_fx:=case when v_currency=''NIO'' then (p_payload->>''payment_exchange_rate'')::numeric else 1 end;
  if v_fx is null or v_fx<=0 or v_fx>1000000 or v_fx::text=''NaN'' then raise exception ''Enter a valid exchange rate'';end if;
  if coalesce((p_payload->>''paid_in_full'')::boolean,false) then v_original:=round(v_total*v_fx,2);
  else v_original:=(p_payload->>''payment_original_amount'')::numeric;
   if v_original is null or v_original<0 or v_original::text=''NaN'' then raise exception ''Enter the amount collected'';end if;
   v_original:=round(v_original,2);v_paid:=round(v_original/v_fx,2);
  end if;
 else v_original:=v_paid;end if;');
 def:=replace(def,'if p_report_id is null then'||chr(10)||'  v_rentals:=', 'if p_payload ? ''payment_currency'' then
  v_rental:=v_rental||jsonb_build_object(''paymentCurrency'',v_currency,''paymentOriginalAmount'',v_original,''paymentExchangeRate'',v_fx);
 end if;
 if p_report_id is null then'||chr(10)||'  v_rentals:=');
 def:=replace(def,'dropoff_time,payment_method)','dropoff_time,payment_method,payment_currency,payment_original_amount,payment_exchange_rate)');
 def:=replace(def,'''accepted'',v_gas,v_pickup_time,v_dropoff_time,v_payment_method);','''accepted'',v_gas,v_pickup_time,v_dropoff_time,v_payment_method,v_currency,v_original,v_fx);');
 def:=replace(def,'payment_method=v_payment_method where id=v_report_id;','payment_method=v_payment_method,
 payment_currency=case when p_payload ? ''payment_currency'' then v_currency else payment_currency end,
 payment_original_amount=case when p_payload ? ''payment_currency'' then v_original else payment_original_amount end,
 payment_exchange_rate=case when p_payload ? ''payment_currency'' then v_fx else payment_exchange_rate end where id=v_report_id;');
 execute def;
 select pg_get_functiondef('public.go_employee_my_rentals()'::regprocedure) into def;
 def:=replace(def,'''paid'',r.paid,','''paid'',r.paid,''payment_currency'',r.payment_currency,''payment_original_amount'',r.payment_original_amount,''payment_exchange_rate'',r.payment_exchange_rate,');
 execute def;
end $patch$;
commit;
