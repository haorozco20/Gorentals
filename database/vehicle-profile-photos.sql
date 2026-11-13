create policy go_workspace_vehicle_photo_upload on storage.objects for insert to authenticated with check(
 bucket_id='go-rental-photos'
 and split_part(name,'/',1)=go_private.workspace_owner()::text
 and split_part(name,'/',2)='vehicles'
 and array_length(string_to_array(name,'/'),1)=4
 and split_part(name,'/',4) ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'
 and exists(select 1 from public.go_app_state s cross join lateral jsonb_array_elements(s.state->'vehicles') v
 where s.owner_id=go_private.workspace_owner() and v->>'id'=split_part(name,'/',3))
);