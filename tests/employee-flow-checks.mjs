import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),source=await fs.readFile(new URL('go-employee-flow.js',root),'utf8'),html=await fs.readFile(new URL('employee.html',root),'utf8');
new vm.Script(source);
for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(script[1]);
const ids=new Set([...html.matchAll(/\bid="([^\"]+)"/g)].map(m=>m[1]));
for(const match of source.matchAll(/\$\('#([^']+)'\)/g))assert.ok(ids.has(match[1]),'Missing '+match[1]);
for(const file of ['employee.html','go-employee-flow.js','go-ui.js','theme.css'])assert.equal(await fs.readFile(new URL(file,root),'utf8'),await fs.readFile(new URL('public/'+file,root),'utf8'));
class Element{
 constructor(){this.hidden=false;this.disabled=false;this.listeners={};this.dataset={};this.attributes={};this.classList={toggle(){}};this.selectedOptions=[{textContent:'Test vehicle'}];}
 setAttribute(name,value){this.attributes[name]=value}removeAttribute(name){delete this.attributes[name]}
 addEventListener(name,fn,capture){(this.listeners[name]??=[]).push(fn)}
 dispatchEvent(event){event.target??=this;for(const fn of this.listeners[event.type]||[])fn(event)}
 click(){this.onclick?.();this.dispatchEvent({type:'click'})}
 scrollIntoView(){}querySelector(){return new Element()}querySelectorAll(){return []}
}
const fields=Object.fromEntries(Object.entries({vehicle_plate:'TEST',customer_name:'Test Customer',pickup:'2026-11-14',dropoff:'2026-11-17',pickup_time:'09:00',dropoff_time:'09:00',rate:'60'}).map(([name,value])=>[name,{name,value,willValidate:true,checkValidity:()=>true,reportValidity(){}}]));
const panels=[1,2,3].map(n=>{const el=new Element();el.dataset.rentalStep=String(n);el.querySelectorAll=()=>n===1?[fields.customer_name]:[];return el}),steps=[1,2,3].map(n=>{const el=new Element();el.dataset.step=String(n);return el});
const elements={};const $=s=>elements[s]??=new Element();
const form=new Element();form.elements={namedItem:name=>fields[name]};form.querySelectorAll=selector=>selector==='[data-rental-step]'?panels:selector==='[data-step]'?steps:[];form.querySelector=selector=>selector.startsWith('[data-rental-step=')?panels[Number(selector.match(/"(\d)"/)[1])-1]:new Element();
let editing=null,permissions={create:true,edit:true,active:true},available=true,calls=0,saves=0;
const context={document:{querySelector:$},window:{},Event:class{constructor(type){this.type=type}},setTimeout,clearTimeout};vm.createContext(context);vm.runInContext(source,context);
const charge=context.window.GoRentalFlow.charge;
assert.equal(charge('2026-11-14','2026-11-17',60),180);
assert.equal(charge('2026-11-14','2026-11-17',60,{discountType:'fixed',discount:15,extras:10}),175);
assert.equal(charge('2026-11-14','2026-11-17',60,{discountType:'percent',discount:10,extras:10}),172);
assert.equal(charge('2026-11-14','2026-11-14',60),60);
const flow=context.window.GoRentalFlow.mount({client:{rpc:async()=>{calls++;return {data:available}}},form,getEditing:()=>editing,getPermissions:()=>permissions,getLanguage:()=> 'en',getRentals:()=>[],onHistory(){}});
assert.equal(flow.step,1);await $('#employee-step-next').onclick();assert.equal(flow.step,2);
available=false;await $('#employee-step-next').onclick();assert.equal(flow.step,2);assert.ok($('#employee-availability').textContent.includes('already booked'));
available=true;await $('#employee-step-next').onclick();assert.equal(flow.step,3);assert.equal($('#send').hidden,false);
form.onsubmit=async()=>{saves++};const event={preventDefault(){},stopImmediatePropagation(){}};
await Promise.all([form.listeners.submit[0](event),form.listeners.submit[0](event)]);assert.equal(saves,1,'Double submission blocked');
flow.saved();assert.equal($('#employee-success-panel').hidden,false);$('#employee-another').click();assert.equal(flow.step,1);assert.equal($('#employee-entry-panel').hidden,false);
fields.customer_name.checkValidity=()=>false;await $('#employee-step-next').onclick();assert.equal(flow.step,1);fields.customer_name.checkValidity=()=>true;
flow.restore({metadata:{step:2}});assert.equal(flow.step,2);
permissions={create:false,edit:true,active:true};flow.reset();assert.equal($('#activeRentalPanel').hidden,false);assert.equal($('#newRentalTab').hidden,true);
editing='own-rental';flow.startEditing();assert.equal($('#employee-entry-panel').hidden,false);assert.equal($('#newRentalTab').hidden,false);
// Existing payment converter remains the source of currency rounding.
vm.runInContext(await fs.readFile(new URL('go-currency.js',root),'utf8'),context);
vm.runInContext(html.slice(html.indexOf('function rentalPaymentValues('),html.indexOf('function updateRentalPayment(')),context);
assert.equal(context.rentalPaymentValues(180,'no','3662.43','NIO',36.6243).paid,100);
assert.equal(context.rentalPaymentValues(180,'no','3662.43','NIO',36.6243).balance,80);
assert.equal(context.rentalPaymentValues(175,'yes','','NIO',36.6243).paid,175);
assert.equal(context.rentalPaymentValues(180,'no','200','USD',1),null);
assert.equal(context.rentalPaymentValues(180,'no','','USD',1),null);
assert.equal(context.rentalPaymentValues(180,'yes','','NIO',0),null);
console.log('Passed: three-step navigation, blocked availability, duplicate-submit prevention, draft step recovery, edit-only permissions, owner adjustments, USD/NIO payments, synchronized files, and success confirmation.');
