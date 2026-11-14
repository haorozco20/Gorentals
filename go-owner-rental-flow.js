/* Reorganize the existing rental fields; retain the established save and access rules. */
(()=>{'use strict';
 const cents=value=>Math.round(value*100)/100;
 function calculate(values){
  const start=Date.parse(values.pickup+'T00:00:00Z'),end=Date.parse(values.dropoff+'T00:00:00Z');
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return null;
  const days=Math.max(1,Math.round((end-start)/86400000)),rate=Number(values.rate),extras=Number(values.extras||0),discount=Number(values.discount||0);
  if(![rate,extras,discount].every(Number.isFinite)||rate<0||extras<0||discount<0||values.discountType==='percent'&&discount>100)return null;
  const subtotal=days*rate,cut=values.discountType==='fixed'?discount:values.discountType==='percent'?subtotal*discount/100:0;
  return {days,rate,subtotal:cents(subtotal),total:cents(Math.max(0,subtotal-Math.min(subtotal,cut))+extras)};
 }
 function mount({form,customers,current,phoneParts,overlap,language,vehicleLabel}){
  if(form.dataset.ownerRentalFlow)return;form.dataset.ownerRentalFlow='true';form.noValidate=true;
  const es=language==='es',tr=(en,spanish)=>es?spanish:en,$=selector=>form.querySelector(selector),field=name=>form.elements.namedItem(name),value=name=>field(name)?.value||'';
  let step=1,saving=false;
  const originalFields=$('.fields'),footer=$('.foot'),submit=footer.querySelector('[type="submit"]');form.closest('.modal').classList.add('owner-rental-modal');form.closest('.modal').setAttribute('role','dialog');form.closest('.modal').setAttribute('aria-modal','true');
  const progress=document.createElement('ol');progress.className='employee-steps owner-rental-steps';progress.setAttribute('aria-label',tr('Rental progress','Progreso del alquiler'));
  const labels=[tr('Vehicle & customer','Vehículo y cliente'),tr('Dates & pricing','Fechas y precio'),tr('Payment','Pago')];
  for(let n=1;n<=3;n++){const li=document.createElement('li');li.dataset.step=String(n);const circle=document.createElement('span');circle.textContent=n;const label=document.createElement('b');label.textContent=labels[n-1];li.append(circle,label);progress.append(li)}form.prepend(progress);
  const panels=labels.map((label,index)=>{const panel=document.createElement('fieldset');panel.className='owner-rental-step';panel.dataset.ownerStep=String(index+1);const legend=document.createElement('legend');legend.textContent=label;panel.append(legend);const grid=document.createElement('div');grid.className='fields';panel.append(grid);form.insertBefore(panel,originalFields);return {panel,grid}});
  const move=(name,target)=>{const el=field(name);if(el){const wrapper=el.closest('.field');if(wrapper)target.append(wrapper)}};
  ['vehicleId','customerName','phoneCode','phone','email'].forEach(name=>move(name,panels[0].grid));
  const customerField=document.createElement('label');customerField.className='field full';customerField.textContent=tr('Choose a customer','Seleccionar cliente');const picker=document.createElement('select');picker.id='owner-customer-picker';const add=document.createElement('option');add.value='';add.textContent=tr('New customer · enter details below','Nuevo cliente · ingresa los datos abajo');picker.append(add);
  for(const customer of [...customers].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),es?'es':'en',{sensitivity:'base'}))){const option=document.createElement('option');option.value=customer.id;option.setAttribute('translate','no');option.textContent=customer.name+(customer.phone?' · '+customer.phone:customer.email?' · '+customer.email:'');picker.append(option)}customerField.append(picker);panels[0].grid.insertBefore(customerField,field('customerName').closest('.field'));
  field('vehicleId').closest('.field').classList.add('full');
  const codeWrapper=field('phoneCode').closest('.field'),phoneWrapper=field('phone').closest('.field'),phoneGroup=document.createElement('div'),phoneLabel=document.createElement('label'),phoneInputs=document.createElement('div');
  phoneGroup.className='field';phoneLabel.htmlFor=field('phone').id;phoneLabel.textContent=tr('Phone number','Número de teléfono');phoneInputs.className='owner-rental-phone';field('phoneCode').setAttribute('aria-label',tr('Country code','Código de país'));
  phoneInputs.append(field('phoneCode'),field('phone'));phoneGroup.append(phoneLabel,phoneInputs);codeWrapper.replaceWith(phoneGroup);phoneWrapper.remove();
  const emailOptional=document.createElement('span');emailOptional.className='help';emailOptional.textContent=' '+tr('(optional)','(opcional)');field('email').closest('.field').querySelector('label').append(emailOptional);
  picker.value=current.customerId||'';
  picker.onchange=()=>{const customer=customers.find(item=>item.id===picker.value);const phone=phoneParts(customer?.phone||'');field('customerName').value=customer?.name||'';field('phoneCode').value=phone.code;field('phone').value=phone.local;field('email').value=customer?.email||'';form.dispatchEvent(new Event('input',{bubbles:true}))};
  field('customerName').addEventListener('input',()=>{if(picker.value&&field('customerName').value!==customers.find(item=>item.id===picker.value)?.name)picker.value=''});
  ['pickup','pickupTime','dropoff','dropoffTime','rate','gasLevel'].forEach(name=>move(name,panels[1].grid));
  function additional(panel,label,names,open){const detail=document.createElement('details');detail.className='owner-rental-additional';detail.open=Boolean(open);const summary=document.createElement('summary');summary.textContent=label;const grid=document.createElement('div');grid.className='fields';detail.append(summary,grid);panel.append(detail);names.forEach(name=>move(name,grid));return detail}
  additional(panels[1].panel,tr('Discounts & extra charges','Descuentos y cargos adicionales'),['discountType','discount','extras'],Number(current.discount)>0||Number(current.extras)>0);
  ['paymentCurrency','paymentOriginalAmount','paymentExchangeRate','paymentMethod'].forEach(name=>move(name,panels[2].grid));
  const preview=$('#currency-preview');if(preview)panels[2].panel.append(preview.closest('.field'));
  const choiceLabel=document.createElement('label');choiceLabel.className='field full';choiceLabel.textContent=tr('Paid in full?','¿Pagó completo?');const choice=document.createElement('select');choice.id='owner-paid-full';choice.name='paymentFullChoice';
  for(const [val,label] of [['yes',tr('Yes, paid in full','Sí, pagó completo')],['no',tr('No, partially paid or unpaid','No, pago parcial o pendiente')]]){const option=document.createElement('option');option.value=val;option.textContent=label;choice.append(option)}
  choice.value=current.total!=null&&Number(current.paid||0)>=Number(current.total)?'yes':'no';choiceLabel.append(choice);panels[2].grid.prepend(choiceLabel);
  const summary=document.createElement('div');summary.className='rental-payment-summary';summary.setAttribute('aria-live','polite');
  const paidLine=document.createElement('div'),balanceLine=document.createElement('div');paidLine.innerHTML='<span>'+tr('Amount received (USD)','Monto recibido (USD)')+'</span><strong data-owner-paid>—</strong>';balanceLine.innerHTML='<span>'+tr('Balance due (USD)','Saldo pendiente (USD)')+'</span><strong data-owner-balance>—</strong>';summary.append(paidLine,balanceLine);panels[2].panel.append(summary);
  additional(panels[2].panel,tr('Additional details · status, mileage & notes','Detalles adicionales · estado, kilometraje y notas'),['status','odometerStart','odometerEnd','notes'],Boolean(current.notes||current.odometerStart||current.odometerEnd||current.status&&current.status!=='reserved'));
  const customerNames=originalFields.querySelector('datalist');if(customerNames)form.append(customerNames);originalFields.remove();
  const error=document.createElement('p');error.className='warning';error.hidden=true;error.setAttribute('role','alert');form.insertBefore(error,footer);
  const availability=document.createElement('p');availability.className='help';availability.setAttribute('role','status');panels[1].panel.append(availability);
  const totalBox=document.createElement('div');totalBox.className='owner-rental-total';totalBox.setAttribute('aria-live','polite');totalBox.innerHTML='<span>'+tr('Rental total','Total del alquiler')+'</span><strong data-owner-total>—</strong><small data-owner-days></small>';
  const back=document.createElement('button');back.type='button';back.className='btn';back.textContent=tr('Back','Atrás');const next=document.createElement('button');next.type='button';next.className='btn primary';next.textContent=tr('Continue →','Continuar →');footer.prepend(totalBox);footer.insertBefore(back,submit);footer.insertBefore(next,submit);submit.textContent=tr('Save rental','Guardar alquiler');footer.classList.add('owner-rental-footer');
  function money(name){const converted=window.GoCurrency.convert(value(name),value(name+'Currency')||'USD',value(name+'ExchangeRate'));return converted?.paid??NaN}
  function totals(){return calculate({pickup:value('pickup'),dropoff:value('dropoff'),rate:money('rate'),extras:money('extras'),discount:value('discount'),discountType:value('discountType')})}
  function update(){
   const total=totals(),currency=value('paymentCurrency'),fx=currency==='NIO'?Number(value('paymentExchangeRate')):1;
   const amount=field('paymentOriginalAmount'),rate=field('paymentExchangeRate');rate.required=currency==='NIO';rate.disabled=currency!=='NIO';rate.closest('.field').hidden=currency!=='NIO';
   for(const name of ['rate','extras']){const exchange=field(name+'ExchangeRate');if(exchange){const nio=value(name+'Currency')==='NIO';exchange.hidden=!nio;const label=form.querySelector('label[for="'+exchange.id+'"]');if(label)label.hidden=!nio;exchange.required=nio;exchange.disabled=!nio;}}
   amount.closest('.field').hidden=choice.value==='yes';
   if(choice.value==='yes'&&total&&fx>0&&Number.isFinite(fx))amount.value=cents(total.total*fx).toFixed(2);
   const paid=window.GoCurrency.convert(amount.value,currency,fx);
   totalBox.querySelector('[data-owner-total]').textContent=total?usd(total.total):'—';totalBox.querySelector('[data-owner-days]').textContent=total?total.days+' '+tr(total.days===1?'day':'days',total.days===1?'día':'días')+' × '+usd(total.rate):'';
   summary.querySelector('[data-owner-paid]').textContent=paid?usd(paid.paid):'—';summary.querySelector('[data-owner-balance]').textContent=total&&paid?usd(Math.max(0,cents(total.total-paid.paid))):'—';summary.querySelector('[data-owner-balance]').classList.toggle('unpaid-balance',Boolean(total&&paid&&paid.paid<total.total));
   if(preview)preview.textContent=paid?(currency==='NIO'?tr('Collected in córdobas: ','Cobrado en córdobas: ')+'C$'+Number(paid.paymentOriginalAmount).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' · ':'')+tr('USD equivalent: ','Equivalente en USD: ')+usd(paid.paid):tr('Enter a valid amount and exchange rate.','Ingresa un monto y tipo de cambio válidos.');
   const conflict=overlap();availability.textContent=conflict?tr('Vehicle already booked during these dates.','El vehículo ya está reservado en estas fechas.'):total?tr('No conflicting booking in the loaded records. Availability is checked again when saving.','No hay reservas en conflicto en los registros cargados. Se vuelve a comprobar al guardar.'):'';availability.className=conflict?'warning':'help';
  }
  function usd(value){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value)}
  function render(){form.dataset.rentalStep=String(step);panels.forEach(({panel},index)=>panel.hidden=index+1!==step);[...progress.children].forEach((li,index)=>{if(index+1===step)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current')});back.hidden=step===1;next.hidden=step===3;submit.hidden=step!==3;update()}
  function fail(message,number){step=number;render();error.textContent=message;error.hidden=false;return false}
  function validate(number){
   for(const control of panels[number-1].panel.querySelectorAll('input,select,textarea'))if(control.willValidate&&!control.checkValidity()){step=number;const detail=control.closest('details');if(detail)detail.open=true;render();control.reportValidity();return fail(tr('Please complete the highlighted field.','Completa el campo indicado.'),number)}
   if(number===1&&!value('vehicleId'))return fail(tr('Choose a vehicle.','Selecciona un vehículo.'),1);
   if(number===1&&!value('customerName').trim())return fail(tr('Enter the customer’s name.','Ingresa el nombre del cliente.'),1);
   if(number===2){if(!totals()||(value('dropoff')+'T'+value('dropoffTime'))<=(value('pickup')+'T'+value('pickupTime')))return fail(tr('Check dates, daily rate and discounts.','Revisa las fechas, el precio diario y los descuentos.'),2);if(overlap())return fail(tr('Vehicle already booked during these dates.','El vehículo ya está reservado en estas fechas.'),2);}
   if(number===3){const paid=window.GoCurrency.convert(value('paymentOriginalAmount'),value('paymentCurrency'),value('paymentExchangeRate'));if(!paid||!totals()||paid.paid>totals().total)return fail(tr('Check the payment amount and exchange rate.','Revisa el monto recibido y el tipo de cambio.'),3)}return true;
  }
  next.onclick=()=>{update();if(validate(step)){error.hidden=true;step++;render();form.dispatchEvent(new Event('input',{bubbles:true}))}};back.onclick=()=>{step--;error.hidden=true;render();form.dispatchEvent(new Event('input',{bubbles:true}))};
  form.addEventListener('input',()=>{error.hidden=true;update()});form.addEventListener('change',update);
  form.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();if(saving)return;update();for(const number of [1,2,3])if(!validate(number))return;saving=true;try{form.onsubmit({preventDefault(){},currentTarget:form})}finally{saving=false}},true);
  form.ownerRentalFlow={restore(draft){const matches=customers.filter(item=>String(item.name||'').trim().toLowerCase()===value('customerName').trim().toLowerCase()&&(!value('email')||String(item.email||'').toLowerCase()===value('email').toLowerCase()));picker.value=matches.length===1?matches[0].id:'';step=[1,2,3].includes(draft?.metadata?.step)?draft.metadata.step:1;render()},update,get step(){return step}};render();
 }
 window.GoOwnerRentalFlow={mount,calculate};
})();
