/* Explicit 12-hour controls; stored rental times remain HH:mm. */
(()=>{
 'use strict';
 function format(value){
  const match=/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/.exec(String(value||''));
  if(!match)return '';
  const hour=Number(match[1]);return (hour%12||12)+':'+match[2]+' '+(hour>=12?'PM':'AM');
 }
 function mount(root){
  root.querySelectorAll('input[type="time"]').forEach(input=>{
   if(input.dataset.twelveHour)return;
   input.dataset.twelveHour='true';input.hidden=true;
   const required=input.required;input.required=false;
   const group=document.createElement('span');group.className='go-time-picker';
   const label=input.closest('label')?.textContent.trim()||input.parentElement.querySelector('label')?.textContent.trim()||'Time';
   const hour=document.createElement('select'),minute=document.createElement('select'),period=document.createElement('select');
   function options(select,values){for(const [value,text] of values){const option=document.createElement('option');option.value=value;option.textContent=text;select.appendChild(option)}}
   options(hour,Array.from({length:12},(_,i)=>[String(i+1),String(i+1)]));
   options(minute,Array.from({length:60},(_,i)=>[String(i).padStart(2,'0'),String(i).padStart(2,'0')]));
   options(period,[['AM','AM'],['PM','PM']]);
   const spanish=document.documentElement.lang==='es';
   [hour,minute,period].forEach((select,index)=>{select.required=required;select.setAttribute('aria-label',label+' — '+(spanish?['Hora','Minuto','AM/PM']:['Hour','Minute','AM/PM'])[index]);group.appendChild(select)});
   input.insertAdjacentElement('afterend',group);
   const native=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
   function sync(){
    const match=/^([01]\d|2[0-3]):([0-5]\d)/.exec(native.get.call(input));
    if(!match)return;
    const h=Number(match[1]);hour.value=String(h%12||12);minute.value=match[2];period.value=h>=12?'PM':'AM';
   }
   Object.defineProperty(input,'value',{configurable:true,get(){return native.get.call(this)},set(value){native.set.call(this,value);sync()}});
   function change(){
    const h=Number(hour.value)%12+(period.value==='PM'?12:0);
    native.set.call(input,String(h).padStart(2,'0')+':'+minute.value);
    input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
   }
   [hour,minute,period].forEach(select=>select.addEventListener('change',change));
   input.addEventListener('change',sync);
   input.form?.addEventListener('reset',()=>setTimeout(sync,0));
   sync();
  });
 }
 window.GoTime={format,mount};mount(document);
})();
