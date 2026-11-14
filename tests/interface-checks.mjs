import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const source=await fs.readFile(new URL('index.html',root),'utf8');
const employee=await fs.readFile(new URL('employee.html',root),'utf8');
for(const file of ['index.html','employee.html','go-ui.js','go-recovery.js']){
 const content=await fs.readFile(new URL(file,root),'utf8');
 if(file.endsWith('.html'))for(const script of content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(script[1]);
 else new vm.Script(content);
}
for(const file of ['index.html','employee.html','theme.css','go-ui.js','go-recovery.js'])assert.equal(await fs.readFile(new URL(file,root),'utf8'),await fs.readFile(new URL('public/'+file,root),'utf8'));
// Language changes preserve user-entered values and restore canonical labels.
let nodes=[{nodeValue:'Password / Contraseña',parentElement:{closest:()=>false}},{nodeValue:'Guardar nueva contraseña',parentElement:{closest:()=>false}}];
const callbacks=[];const storage=new Map();
const context={window:{alert(){},confirm(){}},location:{pathname:'/'},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},document:{body:{},documentElement:{},addEventListener(){},createTreeWalker(){let i=0;return {nextNode:()=>nodes[i++]};},querySelectorAll:()=>[],querySelector:()=>null},NodeFilter:{SHOW_TEXT:4},MutationObserver:class{observe(){}},queueMicrotask:fn=>callbacks.push(fn)};
vm.createContext(context);vm.runInContext(await fs.readFile(new URL('go-ui.js',root),'utf8'),context);
const flush=()=>{while(callbacks.length)callbacks.shift()()};flush();
const ui=context.window.GoUI;ui.setLanguage('es');flush();assert.equal(nodes[0].nodeValue,'Contraseña');assert.equal(ui.text('Payments collected'),'Pagos recibidos');
ui.setLanguage('en');flush();assert.equal(nodes[0].nodeValue,'Password');assert.equal(nodes[1].nodeValue,'Save new password');assert.equal(ui.text('Gas level / Nivel de combustible'),'Gas level');
ui.setLanguage('es');assert.equal(ui.error({code:'invalid_credentials'}),'Correo o contraseña incorrectos.');
// Financial breakdowns use per-rental balances; overpayments cannot erase another debt.
const rentals=[{total:100,paid:40},{total:100,paid:110},{total:80,paid:80}];
let modal={innerHTML:''};const moneyContext={db:{language:'en',rentals},monthlyRents:()=>rentals.slice(0,2),document:{querySelector:s=>s==='#modalRoot'?modal:{focus(){}}},table:(headers,rows)=>rows,t:s=>s,esc:String,vname:()=>'',byId:()=>null,usd:n=>'$'+n};vm.createContext(moneyContext);
vm.runInContext(source.slice(source.indexOf('function dashboardMoneyDetails('),source.indexOf('\nfunction render(){')),moneyContext);
moneyContext.dashboardMoneyDetails('payments');assert.ok(modal.innerHTML.includes('Total: $150')||modal.innerHTML.includes('amount: $150'));assert.ok(modal.innerHTML.includes('Payments may have been received on other dates.'));
moneyContext.dashboardMoneyDetails('balance');assert.ok(modal.innerHTML.includes('amount: $60'));assert.ok(modal.innerHTML.includes('All rentals, excluding deleted rentals.'));
assert.ok(!source.includes("class=\"customer-search'+(customerSearchOpen"));assert.ok(!source.includes("class=\"customer-search'+(fleetSearchOpen"));
assert.ok(employee.includes('show(data.session?.user||null)'));assert.ok(employee.includes("say('Sign in with your employee account.')"));
// Recovery is tested with a fake auth client: no real email or password changes.
class Element{
 constructor(){this.classList={add(){},remove(){}};this.elements={password:{value:'12345678',focus(){}},confirmation:{value:'12345678'}};this.children={};this.value='test@example.com';}
 after(){}setAttribute(){}reportValidity(){return true}focus(){}reset(){}append(){}
 querySelector(selector){return this.children[selector]??=(new Element())}
}
const login=new Element(),email=new Element(),body=new Element();let created=[],events={},updates=0,emails=0,validSession=true;
const rc={window:{GoUI:{text:s=>s,error:e=>e.message}},URLSearchParams,location:{hash:'#type=recovery',origin:'https://example.com',pathname:'/'},history:{replaceState(){}},document:{querySelector:s=>s.includes('form')||s==='#login'?login:email,createElement:()=>{const el=new Element();created.push(el);return el},body}};vm.createContext(rc);
vm.runInContext(await fs.readFile(new URL('go-recovery.js',root),'utf8'),rc);
const client={auth:{onAuthStateChange:fn=>events.auth=fn,resetPasswordForEmail:async()=>{emails++;return {}},getSession:async()=>({data:{session:validSession?{}:null}}),updateUser:async()=>{updates++;return {}},signOut:async()=>({})}};
rc.window.GoRecovery.mount(client);assert.equal(rc.window.GoRecovery.active,true);const panel=created[2],form=panel.querySelector('form'),status=panel.querySelector('#recovery-status');form.elements.confirmation.value='different';await form.onsubmit({preventDefault(){}});assert.equal(updates,0);assert.equal(status.textContent,'Passwords do not match.');
form.elements.confirmation.value='12345678';validSession=false;await form.onsubmit({preventDefault(){}});assert.equal(updates,0);assert.ok(status.textContent.includes('expired'));
validSession=true;await form.onsubmit({preventDefault(){}});assert.equal(updates,1);assert.ok(status.textContent.includes('Password updated.'));
await created[0].onclick();assert.equal(emails,1);assert.ok(created[1].textContent.includes('If an account exists'));
console.log('Passed: syntax, root/public sync, language switching, dashboard totals, visible search, signed-out flow, and mocked password recovery.');

const profilesContext={window:{},document:{}};vm.createContext(profilesContext);
vm.runInContext(await fs.readFile(new URL('go-employees.js',root),'utf8'),profilesContext);
const employees=profilesContext.window.GoEmployees;
assert.equal(employees.validate({name:' Alice ',email:' ALICE@EXAMPLE.COM '}).email,'alice@example.com');
assert.throws(()=>employees.validate({name:'Alice',email:'invalid'}));
assert.throws(()=>employees.validate({name:'',email:'alice@example.com'}));
assert.throws(()=>employees.validate({name:'Alice',email:'alice@example.com',notes:'x'.repeat(2001)}));
assert.equal(employees.linkedAccount({email:'Alice@Example.com'},[{email:'alice@example.com',active:false}]).active,false);
assert.equal(employees.linkedAccount({email:'other@example.com'},[{email:'alice@example.com'}]),null);
assert.equal(await fs.readFile(new URL('go-employees.js',root),'utf8'),await fs.readFile(new URL('public/go-employees.js',root),'utf8'));
console.log('Passed: employee profile validation, normalized email linking, and synchronized profile module.');
