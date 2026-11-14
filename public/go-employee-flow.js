/* Guided employee entry; the server remains authoritative for totals and access. */
(()=>{'use strict';
 function charge(pickup,dropoff,rate,adjustments={}){
  const start=Date.parse(pickup+'T00:00:00Z'),end=Date.parse(dropoff+'T00:00:00Z');
  const days=Math.max(1,Math.round((end-start)/86400000)),base=days*Number(rate);
  const discount=adjustments.discountType==='fixed'?Number(adjustments.discount||0):adjustments.discountType==='percent'?base*Number(adjustments.discount||0)/100:0;
  return Math.round((Math.max(0,base-Math.min(base,Math.max(0,discount)))+Math.max(0,Number(adjustments.extras||0)))*100)/100;
 }
 function mount({client,form,getEditing,getPermissions,getLanguage,getRentals,onHistory}){
  let step=1,tab='new',sequence=0,timer,busy=false,lastAvailability=null;
  const $=selector=>document.querySelector(selector),value=name=>form.elements.namedItem(name)?.value||'';
  const tr=(en,es)=>getLanguage()==='es'?es:en;
  const error=message=>{const el=$('#employee-step-error');el.textContent=message;el.hidden=!message};
  function showTab(next){tab=next;render()}
  function render(){
   const permissions=getPermissions();
   $('#employee-entry-panel').hidden=tab!=='new';$('#employee-success-panel').hidden=tab!=='success';$('#employee-another').hidden=!permissions.create;$('#newRentalTab').textContent=getEditing()?tr('Edit rental','Editar alquiler'):tr('New rental','Nuevo alquiler');
   $('#activeRentalPanel').hidden=tab!=='history';$('#deletedRentalPanel').hidden=tab!=='deleted';$('#activeRentalPanel').classList.toggle('hidden',tab!=='history');$('#deletedRentalPanel').classList.toggle('hidden',tab!=='deleted');
   for(const [id,name] of [['newRentalTab','new'],['activeRentalTab','history'],['deletedRentalTab','deleted']]){
    const button=$('#'+id);button.className=tab===name?'tab-selected':'alt';button.setAttribute('aria-pressed',String(tab===name));
   }
   $('#newRentalTab').hidden=!permissions.create&&!getEditing();
   form.querySelectorAll('[data-rental-step]').forEach(panel=>panel.hidden=Number(panel.dataset.rentalStep)!==step);
   form.querySelectorAll('[data-step]').forEach(item=>{if(Number(item.dataset.step)===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current')});
   $('#employee-step-back').hidden=step===1;$('#employee-step-next').hidden=step===3;$('#send').hidden=step!==3;
   $('#employee-step-next').disabled=busy;$('#employee-step-back').disabled=busy;
   $('#employee-step-next').textContent=tr('Continue →','Continuar →');
   const vehicle=$('#vehicle').selectedOptions[0]?.textContent||'',customer=value('customer_name');
   $('#employee-rental-review').textContent=[vehicle,customer,value('pickup'),value('dropoff')].filter(Boolean).join(' · ');
  }
  function validateStep(number){
   const panel=form.querySelector('[data-rental-step="'+number+'"]');
   for(const input of panel.querySelectorAll('input,select,textarea')){
    if(input.willValidate&&!input.checkValidity()){step=number;render();input.reportValidity();error(tr('Please complete the highlighted field.','Completa el campo indicado.'));return false}
   }
   if(number===1&&value('customer_name').trim().length<2){step=1;render();error(tr('Enter the customer’s full name.','Ingresa el nombre completo del cliente.'));return false}
   if(number===2&&(!value('pickup')||!value('dropoff')||(value('dropoff')+'T'+value('dropoff_time'))<=(value('pickup')+'T'+value('pickup_time')))){
    step=2;render();error(tr('Return must be after pickup.','La devolución debe ser posterior a la entrega.'));return false;
   }
   return true;
  }
  function availabilityPayload(){return {p_plate:value('vehicle_plate'),p_pickup:value('pickup'),p_dropoff:value('dropoff'),p_pickup_time:value('pickup_time'),p_dropoff_time:value('dropoff_time'),p_report_id:getEditing()}}
  async function checkAvailability(){
   const payload=availabilityPayload(),key=JSON.stringify(payload),marker=++sequence;
   if(!payload.p_plate||!payload.p_pickup||!payload.p_dropoff||!payload.p_pickup_time||!payload.p_dropoff_time)return false;
   const el=$('#employee-availability');el.className='help';el.textContent=tr('Checking availability…','Comprobando disponibilidad…');
   try{
    const {data,error:failure}=await client.rpc('go_employee_vehicle_available',payload);if(failure)throw failure;
    if(marker!==sequence||key!==JSON.stringify(availabilityPayload()))return false;
    lastAvailability={key,available:data===true};el.textContent=data===true?tr('Available for these dates.','Disponible en estas fechas.'):tr('This vehicle is already booked. Choose another vehicle or change the dates.','El vehículo ya está reservado. Elige otro vehículo o cambia las fechas.');el.className=data===true?'employee-available':'warning';return data===true;
   }catch(failure){if(marker===sequence){lastAvailability=null;el.className='warning';el.textContent=tr('Could not check availability. Please try again.','No se pudo comprobar la disponibilidad. Inténtalo de nuevo.')}return false}
  }
  $('#newRentalTab').onclick=()=>showTab('new');
  $('#employee-another').onclick=()=>{step=1;showTab('new')};
  $('#employee-view-rentals').onclick=()=>$('#activeRentalTab').click();
  $('#activeRentalTab').addEventListener('click',()=>{onHistory(false);showTab('history')});
  $('#deletedRentalTab').addEventListener('click',()=>{onHistory(true);showTab('deleted')});
  $('#employee-step-back').onclick=()=>{step=Math.max(1,step-1);error('');render();captureDraft()};
  $('#employee-step-next').onclick=async()=>{
   if(busy||!validateStep(step))return;busy=true;render();error('');
   try{if(step===2&&!await checkAvailability())return;step=Math.min(3,step+1);render();captureDraft();form.querySelector('[data-rental-step="'+step+'"] legend')?.scrollIntoView({block:'nearest'})}finally{busy=false;render()}
  };
  function captureDraft(){form.dispatchEvent(new Event('input',{bubbles:true}))}
  form.addEventListener('submit',async event=>{
   event.preventDefault();event.stopImmediatePropagation();if(busy)return;
   for(const number of [1,2,3])if(!validateStep(number))return;
   busy=true;$('#send').disabled=true;render();error('');
   try{if(!await checkAvailability()){step=2;render();return}await form.onsubmit({preventDefault(){},currentTarget:form})}
   finally{busy=false;$('#send').disabled=!(getEditing()?getPermissions().edit:getPermissions().create);render()}
  },true);
  form.addEventListener('input',event=>{
   error('');render();
   if(['vehicle_plate','pickup','dropoff','pickup_time','dropoff_time'].includes(event.target.name)){
    lastAvailability=null;++sequence;clearTimeout(timer);$('#employee-availability').textContent='';
    timer=setTimeout(()=>{if(step===2&&value('pickup')&&value('dropoff')&&(value('dropoff')+'T'+value('dropoff_time'))>(value('pickup')+'T'+value('pickup_time')))void checkAvailability()},400);
   }
  });
  form.addEventListener('change',render);
  function startEditing(){step=1;tab='new';lastAvailability=null;error('');render()}
  function defaultDates(){
   if(getEditing())return;
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
   for(const [name,date] of [['pickup',today],['dropoff',tomorrow]]){const input=form.elements.namedItem(name);if(!input.value){input.value=date;input.defaultValue=date}}
  }
  function reset(){defaultDates();step=1;tab=getPermissions().create?'new':'history';lastAvailability=null;error('');render()}
  function restore(draft){step=[1,2,3].includes(draft?.metadata?.step)?draft.metadata.step:1;tab='new';render()}
  defaultDates();render();return {render,reset,restore,startEditing,saved(){showTab('success')},get step(){return step}};
 }
 window.GoRentalFlow={mount,charge};
})();
