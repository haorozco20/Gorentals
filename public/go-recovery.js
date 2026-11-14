/* Email recovery uses the existing root callback URL and never opens business records. */
(()=>{'use strict';
 const initialHash=new URLSearchParams(location.hash.slice(1));
 let active=initialHash.get('type')==='recovery'||initialHash.get('error_code')==='otp_expired';
 const text=value=>window.GoUI.text(value);
 function mount(client){
  const login=document.querySelector('#go-login-form,#login'),email=document.querySelector('#go-email,#email');
  const forgot=document.createElement('button');forgot.type='button';forgot.className='btn recovery-link';forgot.textContent=text('Forgot password?');login.after(forgot);
  const feedback=document.createElement('p');feedback.className='help';feedback.setAttribute('role','status');forgot.after(feedback);
  forgot.onclick=async()=>{
   if(!email.reportValidity()||!email.value.trim())return;
   forgot.disabled=true;feedback.classList.remove('warning');feedback.textContent=text('Sending recovery email…');
   try{
    const {error}=await client.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:location.origin+'/'});
    if(error)throw error;
    feedback.textContent=text('If an account exists for this email, you will receive a password reset link. Check your inbox and spam folder.');
   }catch(error){feedback.classList.add('warning');feedback.textContent=window.GoUI.error(error)}finally{forgot.disabled=false}
  };
  let panel;
  function recoveryForm(){
   active=true;if(panel)return;
   panel=document.createElement('div');panel.className='recovery-screen';
   panel.innerHTML='<section class="go-login-card"><h1>GO Rentals</h1><h2>'+text('Reset password')+'</h2><form id="recovery-form"><label>'+text('New password')+'<input name="password" type="password" autocomplete="new-password" minlength="8" required></label><label>'+text('Confirm password')+'<input name="confirmation" type="password" autocomplete="new-password" minlength="8" required></label><p class="help">'+text('Use at least 8 characters.')+'</p><button class="btn primary" type="submit">'+text('Save new password')+'</button></form><p id="recovery-status" role="status"></p><a href="/">'+text('Back to sign in')+'</a></section>';
   document.body.append(panel);
   const form=panel.querySelector('form'),status=panel.querySelector('#recovery-status');
   if(initialHash.get('error')||initialHash.get('error_description')){status.textContent=text('This recovery link has expired or is invalid. Request a new link from the sign-in page.');status.className='warning'}
   form.onsubmit=async event=>{
    event.preventDefault();status.className='';
    const password=form.elements.password.value;
    if(password!==form.elements.confirmation.value){status.textContent=text('Passwords do not match.');status.className='warning';return}
    const button=form.querySelector('button');button.disabled=true;
    try{
     const {data,error:sessionError}=await client.auth.getSession();if(sessionError)throw sessionError;
     if(!data.session)throw new Error('This recovery link has expired or is invalid. Request a new link from the sign-in page.');
     const {error}=await client.auth.updateUser({password});if(error)throw error;
     form.reset();form.hidden=true;status.textContent=text('Password updated. You can now sign in with your new password.');
     await client.auth.signOut();history.replaceState(null,'',location.pathname);
    }catch(error){status.textContent=window.GoUI.error(error);status.className='warning'}finally{button.disabled=false}
   };
   form.elements.password.focus();
  }
  client.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')recoveryForm()});
  if(active)recoveryForm();
 }
 window.GoRecovery={mount,get active(){return active}};
})();
