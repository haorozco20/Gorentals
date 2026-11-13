/* Sessions belong to this tab; only the email is remembered across visits. */
(()=>{
 'use strict';
 const sessionKey='go_rentals_tab_auth_v1';
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
 // Never reuse the old browser-wide login.
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
 // Use memory if browser storage is unavailable; never fall back to localStorage.
 const memory=new Map();
 const storage={
  getItem(key){try{return sessionStorage.getItem(key)}catch{return memory.get(key)||null}},
  setItem(key,value){memory.set(key,value);try{sessionStorage.setItem(key,value)}catch{}},
  removeItem(key){memory.delete(key);try{sessionStorage.removeItem(key)}catch{}}
 };
 window.goTabAuthOptions={persistSession:true,autoRefreshToken:true,storageKey:sessionKey,storage};
})();
