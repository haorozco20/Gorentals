/* Owner-only employee directory. Profiles never grant or alter login permissions. */
(()=>{'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const tx=value=>window.GoUI.text(value);
 const normalize=value=>String(value||'').trim().toLowerCase();
 function linkedAccount(profile,accounts){return accounts.find(account=>normalize(account.email)===normalize(profile.email))||null}
 function validate(values){
  const value={name:String(values.name||'').trim(),email:normalize(values.email),phone:String(values.phone||'').trim(),job_title:String(values.job_title||'').trim(),notes:String(values.notes||'').trim()};
  if(!value.name||value.name.length>140)throw Error('Enter an employee name (up to 140 characters).');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)||value.email.length>254)throw Error('Enter a valid employee email address.');
  if(value.phone.length>50||value.job_title.length>100||value.notes.length>2000)throw Error('One or more fields are too long.');
  return value;
 }
 function mount({client,ownerId}){
  if(document.querySelector('#employee-profiles-button'))return;
  const trigger=document.createElement('button');trigger.id='employee-profiles-button';trigger.type='button';trigger.className='btn';trigger.textContent=tx('Employee profiles');
  document.querySelector('#team-menu').prepend(trigger);
  trigger.onclick=()=>openProfiles(client,ownerId);
 }
 async function openProfiles(client,ownerId){
  let profiles=[],accounts=[],dirty=false,busy=false;
  const overlay=document.createElement('div');overlay.className='overlay';
  overlay.innerHTML='<section class="modal employee-profiles-modal" role="dialog" aria-modal="true" aria-labelledby="employee-profiles-title"><div class="section-head"><h3 id="employee-profiles-title">'+tx('Employee profiles')+'</h3><button type="button" class="btn" data-profile-close>'+tx('Close')+'</button></div><p class="help">'+tx('Create a profile and use the same email as the employee’s login. Profiles do not create passwords or grant account access. Manage access under Team & permissions.')+'</p><div data-profile-directory><div class="actions"><label class="employee-profile-search">'+tx('Search employees')+'<input type="search" data-profile-search autocomplete="off"></label><button type="button" class="btn primary" data-profile-new>'+tx('Create profile')+'</button></div><div data-profile-list class="employee-profile-list"></div></div><div data-profile-editor hidden></div><p data-profile-status role="status" aria-live="polite"></p></section>';
  document.body.append(overlay);
  const select=selector=>overlay.querySelector(selector),status=select('[data-profile-status]'),directory=select('[data-profile-directory]'),editor=select('[data-profile-editor]');
  const message=(value,failure=false)=>{status.textContent=tx(value);status.className=failure?'warning':'help'};
  const close=()=>{if(busy)return;if(dirty&&!confirm(tx('Discard unsaved employee profile changes?')))return;overlay.remove();document.querySelector('#settings-dropdown').open=true;document.querySelector('#employee-profiles-button')?.focus()};
  select('[data-profile-close]').onclick=close;
  overlay.onclick=event=>{if(event.target===overlay)close()};
  overlay.onkeydown=event=>{if(event.key==='Escape'){event.stopPropagation();close()}};
  select('[data-profile-new]').onclick=()=>editProfile();
  select('[data-profile-search]').oninput=renderList;
  function renderList(){
   const q=normalize(select('[data-profile-search]').value),list=select('[data-profile-list]');
   const displayed=profiles.filter(p=>normalize([p.name,p.email,p.job_title].join(' ')).includes(q));
   const unprofiled=accounts.filter(a=>!profiles.some(p=>normalize(p.email)===normalize(a.email))&&normalize(a.email).includes(q));
   list.innerHTML=displayed.map(profile=>{
    const account=linkedAccount(profile,accounts),badge=account?(account.active?'Account linked':'Account disabled'):'Awaiting account approval';
    return '<button type="button" class="employee-profile-card" data-profile-edit="'+esc(profile.id)+'"><strong translate="no">'+esc(profile.name)+'</strong><span translate="no">'+esc(profile.email)+'</span><small translate="no">'+esc(profile.job_title||'')+'</small><span class="tag">'+tx(badge)+'</span><small>'+tx('Edit profile')+' →</small></button>';
   }).join('')+unprofiled.map(account=>'<button type="button" class="employee-profile-card" data-profile-email="'+esc(account.email)+'"><strong translate="no">'+esc(account.email)+'</strong><span>'+tx('Approved account without a profile')+'</span><small>'+tx('Create profile')+' →</small></button>').join('');
   if(!displayed.length&&!unprofiled.length)list.innerHTML='<p class="help">'+tx(q?'No matching employees.':'No employee profiles yet.')+'</p>';
   list.querySelectorAll('[data-profile-edit]').forEach(button=>button.onclick=()=>editProfile(profiles.find(p=>p.id===button.dataset.profileEdit)));
   list.querySelectorAll('[data-profile-email]').forEach(button=>button.onclick=()=>editProfile({email:button.dataset.profileEmail}));
  }
  async function load(){
   message('Loading employee profiles…');
   try{
    const [result,access]=await Promise.all([client.from('go_employee_profiles').select('id,name,email,phone,job_title,notes,archived,updated_at').eq('owner_id',ownerId).order('name'),client.rpc('go_owner_employee_permissions')]);
    if(result.error)throw result.error;if(access.error)throw access.error;
    profiles=result.data||[];accounts=access.data||[];renderList();message('');
   }catch(error){message('Could not load employee profiles. Close this window and try again.',true)}
  }
  function editProfile(profile={}){
   directory.hidden=true;editor.hidden=false;dirty=false;message('');
   const field=(label,name,max,type='text',required=false)=>'<label>'+tx(label)+'<input name="'+name+'" type="'+type+'" maxlength="'+max+'" '+(required?'required ':'')+'value="'+esc(profile[name]||'')+'"></label>';
   editor.innerHTML='<h3>'+tx(profile.id?'Edit profile':'Create profile')+'</h3><form data-employee-profile-form><div class="fields">'+field('Employee name','name',140,'text',true)+field('Login email','email',254,'email',true)+field('Phone number','phone',50,'tel')+field('Job title','job_title',100)+'<label class="field full">'+tx('Notes')+'<textarea name="notes" maxlength="2000">'+esc(profile.notes||'')+'</textarea></label></div><p class="help">'+tx('Job title is for your records; it does not change permissions. Changing the email links this profile to that email and does not change anyone’s login email or access.')+'</p><div class="foot"><button type="button" class="btn" data-profile-cancel>'+tx('Cancel')+'</button><button type="submit" class="btn primary">'+tx('Save profile')+'</button></div></form>';
   const form=editor.querySelector('form');form.oninput=()=>{dirty=true};
   editor.querySelector('[data-profile-cancel]').onclick=()=>{if(busy)return;if(dirty&&!confirm(tx('Discard unsaved employee profile changes?')))return;dirty=false;editor.hidden=true;directory.hidden=false;message('');select('[data-profile-new]').focus()};
   form.onsubmit=async event=>{
    event.preventDefault();if(busy)return;
    let values;try{values=validate(Object.fromEntries(new FormData(form)))}catch(error){message(error.message,true);return}
    if(profiles.some(p=>p.id!==profile.id&&normalize(p.email)===values.email)){message('An employee profile already uses this email.',true);return}
    busy=true;form.querySelectorAll('button').forEach(button=>button.disabled=true);message('Saving employee profile…');
    try{
     const payload={...values,updated_at:new Date().toISOString()};
     const query=profile.id?client.from('go_employee_profiles').update(payload).eq('owner_id',ownerId).eq('id',profile.id).eq('updated_at',profile.updated_at):client.from('go_employee_profiles').insert({...payload,owner_id:ownerId});
     const {data,error}=await query.select('id').single();if(error)throw error;if(!data)throw Error('No profile saved');
     dirty=false;editor.hidden=true;directory.hidden=false;await load();message('Employee profile saved.');select('[data-profile-new]').focus();
    }catch(error){message(error.code==='23505'?'An employee profile already uses this email.':error.code==='PGRST116'?'This profile changed elsewhere. Close and reopen Employee profiles before editing again.':'Could not save employee profile. Your changes are still in the form. Try again.',true)}
    finally{busy=false;form.querySelectorAll('button').forEach(button=>button.disabled=false)}
   };
   form.elements.name.focus();
  }
  await load();select('[data-profile-search]').focus();
 }
 window.GoEmployees={mount,validate,linkedAccount};
})();
