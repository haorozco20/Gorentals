/* User-scoped unfinished form drafts. Passwords and files are never stored. */
(()=>{
 let user=null;
 const prefix=()=>user?'go_form_draft_v1:'+user+':':null;
 function read(key){try{return JSON.parse(localStorage.getItem(prefix()+key)||'null')}catch{return null}}
 function write(key,value){if(!user)return;try{localStorage.setItem(prefix()+key,JSON.stringify(value))}catch{}}
 function clear(key,expectedUpdatedAt){if(!user)return;if(expectedUpdatedAt!==undefined&&read(key)?.updatedAt!==expectedUpdatedAt)return;try{localStorage.removeItem(prefix()+key)}catch{}}
 function bind(form,key,metadata={}){
  if(!form)return;
  const capture=()=>{const fields={};for(const input of form.elements){if(!input.name||['password','file','submit','button'].includes(input.type))continue;fields[input.name]=input.type==='checkbox'?input.checked:input.value}write(key,{fields,metadata,updatedAt:Date.now()})};
  form.addEventListener('input',capture);form.addEventListener('change',capture);
 }
 function restore(form,draft){
  if(!form||!draft?.fields)return false;
  for(const [name,value] of Object.entries(draft.fields)){
   const input=form.elements.namedItem(name);if(!input||['file','password'].includes(input.type))continue;
   if(input.type==='checkbox')input.checked=Boolean(value);else input.value=String(value);
  }return true;
 }
 window.GoDraft={setUser(id){user=id},read,clear,bind,restore,clearAll(){if(!user)return;try{const keys=Object.keys(localStorage).filter(k=>k.startsWith(prefix()));keys.forEach(k=>localStorage.removeItem(k))}catch{}}};
})();
