let geminiBusy=false;
function chatForDay(date=appState.activeDayId){
  if(!appState.geminiChats || typeof appState.geminiChats!=='object' || Array.isArray(appState.geminiChats)) appState.geminiChats={};
  if(!Array.isArray(appState.geminiChats[date])) appState.geminiChats[date]=[];
  return appState.geminiChats[date];
}
function renderGeminiChat(){
  const container=document.getElementById('geminiMessages');if(!container) return;
  const day=getActiveDay(),total=getTotalsForDay(day);
  document.getElementById('geminiDay').textContent=dayLabel(appState.activeDayId);
  document.getElementById('geminiTotals').textContent=`${Math.round(total.cal)} / ${day.targets.cal} kcal · P ${Math.round(total.p)} g · C ${Math.round(total.c)} g · G ${Math.round(total.g)} g`;
  const messages=chatForDay();
  container.replaceChildren();
  if(!messages.length){
    const intro=document.createElement('div');intro.className='chat-empty';
    intro.innerHTML='<span class="chat-spark" aria-hidden="true">✦</span><h3>Cuéntame qué comiste.</h3><p>Lo registro aquí, ajusto tus macros y te ayudo con la próxima comida.</p><p class="chat-note">Puedes corregir porciones y horarios. Las sugerencias cuentan solo cuando confirmas que las comiste.</p>';
    container.append(intro);
  }
  for(const message of messages.slice(-80)){
    if(!message || !['user','assistant'].includes(message.role) || typeof message.content!=='string') continue;
    const article=document.createElement('article');article.className='chat-message chat-'+message.role;
    const label=document.createElement('span');label.className='chat-label';label.textContent=message.role==='user'?'Tú':'Gemini';
    const content=document.createElement('p');content.textContent=message.content;
    article.append(label,content);
    if(message.receipt){const receipt=document.createElement('span');receipt.className='chat-receipt';receipt.textContent=message.receipt;article.append(receipt);}
    if(message.error){const error=document.createElement('p');error.className='chat-error';error.textContent=message.error;article.append(error);}
    container.append(article);
  }
  const last=messages.at(-1);
  const retry=document.getElementById('geminiRetry');retry.hidden=geminiBusy || !last || last.role!=='user';
  document.getElementById('geminiSend').disabled=geminiBusy;
  document.getElementById('geminiInput').disabled=geminiBusy;
  document.getElementById('geminiStatus').textContent=geminiBusy?'Gemini está pensando…':!cloudUser?'Inicia sesión en Cuenta y respaldo para conversar.':'Chat con Gemini · Usa las metas del día seleccionado';
  document.getElementById('geminiMessages').setAttribute('aria-busy',String(geminiBusy));
  container.scrollTop=container.scrollHeight;
}
function fillGeminiPrompt(text){document.getElementById('geminiInput').value=text;document.getElementById('geminiInput').focus();}
async function sendGeminiMessage(retry=false){
  if(geminiBusy) return;
  const errorEl=document.getElementById('geminiError');errorEl.textContent='';
  if(!cloudUser || !cloudClient){errorEl.textContent='Abre Cuenta y respaldo e inicia sesión para usar Gemini.';return;}
  if(!cloudReady || cloudConflict || storageProblem){errorEl.textContent='Primero resuelve el aviso de guardado en Cuenta y respaldo para mantener tu historial al día.';return;}
  const date=appState.activeDayId,ownerKey=storageKey,owner=cloudUser.id,history=chatForDay(date),field=document.getElementById('geminiInput');
  let message;
  if(retry){message=history.at(-1);if(message?.role!=='user') return;delete message.error;}
  else{
    const text=field.value.trim();if(!text) return;
    if(text.length>4000){errorEl.textContent='Acorta el mensaje a 4.000 caracteres.';return;}
    // Keep an unanswered message intact; retry explicitly instead of duplicating a consumed meal.
    if(history.at(-1)?.role==='user'){errorEl.textContent='Reintenta el mensaje pendiente antes de enviar otro.';return;}
    message={id:crypto.randomUUID(),role:'user',content:text};history.push(message);
  }
  if(!saveState()){
    if(!retry) history.pop();errorEl.textContent='No pudimos guardar el mensaje en este navegador. Libera espacio y vuelve a intentar.';renderGeminiChat();return;
  }
  field.value='';
  const snapshot=JSON.stringify(appState.days[date]);
  geminiBusy=true;renderGeminiChat();
  try{
    const {data,error}=await cloudClient.auth.getSession();
    if(error || !data.session?.access_token) throw Error('Tu sesión venció. Vuelve a iniciar sesión.');
    if(data.session.user.id!==owner || storageKey!==ownerKey) throw Error('La cuenta cambió. Vuelve a enviar el mensaje desde tu cuenta.');
    const response=await fetch('/api/chat',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},
      body:JSON.stringify({date,day:JSON.parse(snapshot),foods:appState.foods.slice(0,60),messages:history.slice(-24).map(m=>({role:m.role,content:m.content}))}),
      signal:AbortSignal.timeout(55000)
    });
    const result=await response.json().catch(()=>({error:'No pudimos leer la respuesta de Gemini.'}));
    if(!response.ok) throw Error(result.error||'No pudimos conectar con Gemini.');
    if(storageKey!==ownerKey || cloudUser?.id!==owner) return;
    if(history!==chatForDay(date) || snapshot!==JSON.stringify(appState.days[date]) || cloudConflict) throw Error('El registro cambió mientras Gemini respondía. Reintenta para usar los datos actualizados.');
    const plan=MacroChat.validatePlan(result),next=MacroChat.applyPlan(appState.days[date],plan,message.id);
    const previous=appState.days[date],changed=plan.operations.length>0;
    const reply={id:message.id+'_reply',role:'assistant',content:plan.reply,receipt:changed?'✓ Cambios guardados en este navegador · Consulta el estado de nube arriba.':''};
    appState.days[date]=next;history.push(reply);
    if(!saveState()){appState.days[date]=previous;history.pop();throw Error('No se pudo guardar la respuesta. Tus comidas se conservaron como estaban.');}
    renderAll();
    if(changed) showToast('Registro actualizado con Gemini');
  }catch(e){
    if(storageKey===ownerKey && cloudUser?.id===owner && history===chatForDay(date)){
      message.error=e.name==='TimeoutError'?'Gemini tardó demasiado. Reintenta; no se modificaron tus comidas.':e.message;
      saveState();
    }
  }finally{geminiBusy=false;renderGeminiChat();}
}
document.getElementById('geminiForm').addEventListener('submit',e=>{e.preventDefault();sendGeminiMessage();});
document.getElementById('geminiInput').addEventListener('keydown',e=>{if(e.key==='Enter' && !e.shiftKey && !e.isComposing){e.preventDefault();sendGeminiMessage();}});
