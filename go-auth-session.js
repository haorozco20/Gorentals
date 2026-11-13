/* Remember login across tabs and browser restarts; explicit sign-out clears it. */
(()=>{
 'use strict';
 const sessionKey='go_rentals_persistent_auth_v2';
 const oldTabKey='go_rentals_tab_auth_v1';
 const emailKey='go_rentals_login_email';
 const legacyKey='sb-wfbwstaxrqkilmkzwbzz-auth-token';
 let remembered='';
 try{
  remembered=localStorage.getItem(emailKey)||'';
  if(!remembered){
   const legacy=JSON.parse(localStorage.getItem(legacyKey)||'null');
   remembered=legacy?.user?.email||'';
   if(remembered)localStorage.setItem(emailKey,remembered);
  }
 }catch{}
 // Migrate existing sessions once, preserving the currently signed-in account.
 try{if(!localStorage.getItem(sessionKey)){const previous=sessionStorage.getItem(oldTabKey)||localStorage.getItem(legacyKey);if(previous)localStorage.setItem(sessionKey,previous)}sessionStorage.removeItem(oldTabKey)}catch{}
 // Retire superseded keys after migration.
 try{localStorage.removeItem(legacyKey);localStorage.removeItem(legacyKey+'-code-verifier');localStorage.removeItem(legacyKey+'-user')}catch{}
 const input=document.querySelector('#go-email, #email');
 const rememberEmail=()=>{
  const value=input?.value.trim().toLowerCase()||'';
  try{if(value)localStorage.setItem(emailKey,value);else localStorage.removeItem(emailKey)}catch{}
 };
 if(input){
  input.value=remembered;
  input.addEventListener('change',rememberEmail);
  input.form?.addEventListener('submit',rememberEmail,true);
 }
 // If browser storage is blocked, keep this session in memory.
 const memory=new Map();
 const storage={
  getItem(key){try{return localStorage.getItem(key)}catch{return memory.get(key)||null}},
  setItem(key,value){memory.set(key,value);try{localStorage.setItem(key,value)}catch{}},
  removeItem(key){memory.delete(key);try{localStorage.removeItem(key)}catch{}}
 };
 window.goTabAuthOptions={persistSession:true,autoRefreshToken:true,storageKey:sessionKey,storage};
})();
