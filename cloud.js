// Public Supabase key only. Row policies restrict every state to its owner.
const SUPABASE_URL = 'https://rwwuvvhwdexqjvxgbqkb.supabase.co';
const SUPABASE_PUBLIC_KEY = 'sb_publishable_mxHjhqVbTLXtAk9yLmBATQ_gijvvgHZ';
function saveCloudMeta() {
  try { localStorage.setItem(storageKey+'_sync',JSON.stringify({version:cloudVersion,dirty:cloudDirty})); }
  catch(e) { updateStorageStatus('No se pudo guardar el estado de sincronización. Descarga un respaldo.'); }
}
function scheduleCloudSave() {
  clearTimeout(cloudTimer);
  if(!cloudUser || !cloudReady || cloudConflict) return;
  updateStorageStatus('Cambios guardados en este navegador · Pendiente de nube');
  cloudTimer=setTimeout(syncCloud,700);
}
async function syncCloud() {
  if(!cloudClient || !cloudUser || !cloudReady || cloudConflict || storageProblem) return;
  if(cloudBusy) { scheduleCloudSave(); return; }
  if(!cloudDirty) { updateStorageStatus('Historial sincronizado con tu cuenta'); return; }
  cloudBusy=true;
  const owner=cloudUser.id, currentStorageKey=storageKey, revision=cloudVersion;
  const snapshot=JSON.stringify(appState);
  updateStorageStatus('Guardando en la nube…');
  try {
    const payload={state:JSON.parse(snapshot),version:revision+1,updated_at:new Date().toISOString()};
    let query=cloudClient.from('macroturno_states');
    const result=revision===0
      ? await query.insert({...payload,user_id:owner}).select('version').single()
      : await query.update(payload).eq('user_id',owner).eq('version',revision).select('version').maybeSingle();
    if(!cloudUser || cloudUser.id!==owner || storageKey!==currentStorageKey) return;
    if(result.error?.code==='23505' || (!result.error && !result.data)) {
      cloudConflict=true;
      updateStorageStatus('Hay cambios de otro dispositivo. Descarga tu respaldo y pulsa Cargar nube para revisarlos.');
      return;
    }
    if(result.error) throw result.error;
    cloudVersion=result.data.version;
    cloudDirty=JSON.stringify(appState)!==snapshot;
    saveCloudMeta();
    updateStorageStatus(cloudDirty?'Guardado local · Quedan cambios por sincronizar':'Historial sincronizado con tu cuenta');
  } catch(e) { updateStorageStatus('Guardado local · No se pudo sincronizar. Revisa tu conexión y pulsa Guardar en nube.'); }
  finally { cloudBusy=false; if(cloudDirty && !cloudConflict && JSON.stringify(appState)!==snapshot) scheduleCloudSave(); }
}
function setAccountUI() {
  document.getElementById('accountForm').classList.toggle('hidden',!!cloudUser);
  document.getElementById('signedInActions').classList.toggle('hidden',!cloudUser);
  document.getElementById('accountStatus').textContent=cloudUser?'Cuenta: '+cloudUser.email:'Inicia sesión para guardar tus registros en la nube.';
}
async function attachCloudAccount(user) {
  clearTimeout(cloudTimer); cloudReady=false; cloudConflict=false;
  // Preserve guest data before switching to a separate per-account local cache.
  const guest=JSON.stringify(appState);
  storageProblem='';
  cloudUser=user;
  storageKey='macroturno_pro_v3_'+user.id;
  let cached,meta;
  try { cached=localStorage.getItem(storageKey); meta=JSON.parse(localStorage.getItem(storageKey+'_sync') || '{}'); }
  catch(e) { meta={}; }
  appState=cached?loadState():normalizeState(JSON.parse(guest));
  cloudVersion=meta.version||0; cloudDirty=cached?!!meta.dirty:true;
  setAccountUI(); renderAll(); updateStorageStatus('Consultando tu historial en la nube…');
  try {
    const {data,error}=await cloudClient.from('macroturno_states').select('state,version').eq('user_id',user.id).maybeSingle();
    if(!cloudUser || cloudUser.id!==user.id) return;
    if(error) throw error;
    if(data && cloudDirty && cached && cloudVersion!==data.version) {
      cloudConflict=true; cloudReady=true;
      updateStorageStatus('Tu copia local y la nube tienen cambios diferentes. Descarga un respaldo y pulsa Cargar nube.'); return;
    }
    if(data && (!cached || !cloudDirty)) {
      // Existing cloud account takes priority. Guest data stays at the original guest key.
      appState=normalizeState(data.state); storageProblem=''; cloudVersion=data.version; cloudDirty=false;
    }
    cloudReady=true;
    try { localStorage.setItem(storageKey,JSON.stringify(appState)); saveCloudMeta(); }
    catch(e) { updateStorageStatus('No se pudo guardar una copia local. Descarga un respaldo.'); }
    renderAll();
    if(cloudDirty) await syncCloud(); else updateStorageStatus('Historial sincronizado con tu cuenta');
  } catch(e) { cloudReady=false; updateStorageStatus('Historial local disponible · No se pudo cargar la nube. Pulsa Cargar nube para reintentar.'); }
}
async function reloadFromCloud() {
  if(!cloudUser || !cloudClient || cloudBusy) return;
  if(cloudDirty || cloudConflict) {
    if(!confirm('Descargaremos tu copia actual antes de cargar los registros de la nube. Los cambios locales pendientes quedarán en ese respaldo. ¿Continuar?')) return;
    exportAppData();
  }
  const owner=cloudUser.id;
  try {
    const {data,error}=await cloudClient.from('macroturno_states').select('state,version').eq('user_id',owner).maybeSingle();
    if(error) throw error;
    if(!cloudUser || cloudUser.id!==owner) return;
    if(data) { appState=normalizeState(data.state); cloudVersion=data.version; cloudDirty=false; }
    else { cloudVersion=0; cloudDirty=true; }
    storageProblem=''; cloudConflict=false; cloudReady=true;
    localStorage.setItem(storageKey,JSON.stringify(appState)); saveCloudMeta(); renderAll();
    if(cloudDirty) await syncCloud(); else updateStorageStatus('Historial cargado desde la nube');
  } catch(e) { updateStorageStatus('No se pudo cargar la nube. Tu copia actual se conserva.'); }
}
async function authenticateCloud(create) {
  if(!cloudClient) { updateStorageStatus('No se pudo conectar con el servicio de cuentas. Recarga la página.'); return; }
  const form=document.getElementById('accountForm'); if(!form.reportValidity()) return;
  const email=document.getElementById('accountEmail').value.trim(), password=document.getElementById('accountPassword').value;
  for(const id of ['signInButton','signUpButton']) document.getElementById(id).disabled=true;
  try {
    const {data,error}=create?await cloudClient.auth.signUp({email,password}):await cloudClient.auth.signInWithPassword({email,password});
    if(error) throw error;
    document.getElementById('accountPassword').value='';
    if(data.session) await attachCloudAccount(data.user);
    else updateStorageStatus('Revisa tu correo para confirmar la cuenta. Después vuelve aquí e inicia sesión.');
  } catch(e) { updateStorageStatus('No se pudo '+(create?'crear la cuenta':'iniciar sesión')+': '+e.message); }
  finally { for(const id of ['signInButton','signUpButton']) document.getElementById(id).disabled=false; }
}
async function signOutCloud() {
  if(cloudBusy) { updateStorageStatus('Espera a que termine el guardado antes de cerrar sesión.'); return; }
  if(cloudDirty && !confirm('Hay cambios pendientes de sincronizar. Se conservarán en este navegador. ¿Cerrar sesión?')) return;
  clearTimeout(cloudTimer);
  const {error}=await cloudClient.auth.signOut();
  if(error) { updateStorageStatus('No se pudo cerrar sesión. Inténtalo nuevamente.'); return; }
  cloudUser=null; cloudReady=false; cloudConflict=false; cloudDirty=false; cloudVersion=0;
  storageKey=STORAGE_KEY; storageProblem=''; appState=loadState(); setAccountUI(); renderAll();
  updateStorageStatus('Sesión cerrada · Mostrando los registros locales de invitado');
}
async function initCloud() {
  if(!window.supabase) { updateStorageStatus('Guardado local · El servicio de cuentas no está disponible.'); return; }
  cloudClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLIC_KEY,{auth:{storageKey:'macroturno-auth-v1'}});
  try {
    const {data,error}=await cloudClient.auth.getSession(); if(error) throw error;
    if(data.session) await attachCloudAccount(data.session.user);
  } catch(e) { updateStorageStatus('Guardado local · Inicia sesión para recuperar tu historial.'); }
  window.addEventListener('online',()=>{if(cloudReady) scheduleCloudSave();});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible' && cloudUser && cloudReady && !cloudDirty && !cloudBusy) reloadFromCloud();
  });
}
