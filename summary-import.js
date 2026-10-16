function parseDailySummary(text,key) {
  if(!validDate(key)) throw new Error('Selecciona una fecha válida');
  if(text.length>100000) throw new Error('El resumen es demasiado largo');
  const clean=text.replace(/\*/g,'');
  const heading=clean.match(/Resumen MacroTurno[^\n]*?[—–-]\s*[^\d\n]*(\d{1,2})\b/i);
  if(heading && Number(heading[1])!==Number(key.slice(8))) throw new Error('El día del resumen no coincide con la fecha seleccionada');
  const num=v=>Number(v.replace(',','.'));
  const mealPattern=/^[•\-]\s*(\d{2}:\d{2})\s*[-–]\s*(.+?)\s*\((\d+(?:[.,]\d+)?)\s*kcal\s*\|\s*P:\s*(\d+(?:[.,]\d+)?)g\s*C:\s*(\d+(?:[.,]\d+)?)g\s*G:\s*(\d+(?:[.,]\d+)?)g\s*\)\s*$/gm;
  const meals=Array.from(clean.matchAll(mealPattern),(m,i)=>({id:'summary_'+Date.now()+'_'+i,time:m[1],name:m[2].trim(),cal:num(m[3]),p:num(m[4]),c:num(m[5]),g:num(m[6])}));
  if(!meals.length) throw new Error('No encontré comidas con hora y macros. Pega el resumen completo.');
  const lines=clean.split('\n').filter(l=>/^[•\-]\s*\d{2}:/.test(l));
  if(lines.length!==meals.length) throw new Error('Alguna comida tiene un formato incompleto; revisa el texto');
  if(meals.some(m=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time))) throw new Error('Hay una hora inválida');
  const patch={},targets={};
  const calories=clean.match(/Calor[ií]as:\s*([\d.,]+)\s*\/\s*([\d.,]+)\s*kcal/i);
  const macros=clean.match(/Macros:\s*P:\s*([\d.,]+)\/([\d.,]+)g\s*\|\s*C:\s*([\d.,]+)\/([\d.,]+)g\s*\|\s*G:\s*([\d.,]+)\/([\d.,]+)g/i);
  const sum=k=>meals.reduce((n,m)=>n+m[k],0);
  if(calories) { if(Math.abs(sum('cal')-num(calories[1]))>1) throw new Error('Las calorías del encabezado no coinciden con las comidas'); targets.cal=num(calories[2]); }
  if(macros) { for(const [k,i] of [['p',1],['c',3],['g',5]]) {if(Math.abs(sum(k)-num(macros[i]))>1) throw new Error('Los macros del encabezado no coinciden con las comidas');targets[k]=num(macros[i+1]);} }
  const badge=clean.match(/Estado:\s*([^\n]+)/i); if(badge) patch.badge=badge[1].trim();
  const water=clean.match(/Agua:\s*([\d.,]+)\s*L/i);if(water) patch.water=num(water[1]);
  const caffeine=clean.match(/Cafe[ií]na:\s*([\d.,]+)\s*mg/i);if(caffeine) patch.caffeine=num(caffeine[1]);
  const steps=clean.match(/Pasos:\s*(\d[\d.,]*)/i);if(steps) patch.steps=Number(steps[1].replace(/[.,]/g,''));
  const supplements={};
  for(const [key,re] of [['creatine',/Creatina(?:\s*5\s*g)?:\s*(✅|⏳)/i],['magnesium',/Magnesio:\s*(✅|⏳)/i]]) {const match=clean.match(re);if(match) supplements[key]=match[1]==='✅';}
  return {key,meals,patch,targets,supplements};
}
function mergeDailySummary(state,parsed) {
  const copy=JSON.parse(JSON.stringify(state));
  const day=copy.days[parsed.key] || createDay(parsed.key);
  const signature=m=>JSON.stringify([m.time,m.name.trim().toLowerCase(),m.cal,m.p,m.c,m.g]);
  const seen=new Set(day.meals.map(signature));let added=0;
  for(const meal of parsed.meals) {const sig=signature(meal);if(!seen.has(sig)){day.meals.push(meal);seen.add(sig);added++;}}
  Object.assign(day,parsed.patch); Object.assign(day.targets,parsed.targets);Object.assign(day.supplements,parsed.supplements);
  day.subtitle=dayLabel(parsed.key)+' · '+day.badge;
  if(/turno noche/i.test(day.badge)) {day.phase='noche';day.coffeeCutoff='Corte café: 02:30 AM';}
  copy.days[parsed.key]=day; copy.activeDayId=parsed.key;
  return {state:normalizeState(copy),added};
}
function importDailySummary() {
  const status=document.getElementById('summaryImportStatus');
  try {
    if(storageProblem) throw new Error('Primero resuelve el problema del guardado local y descarga una copia');
    const parsed=parseDailySummary(document.getElementById('summaryText').value,document.getElementById('summaryDate').value);
    const result=mergeDailySummary(appState,parsed);
    if(!confirm('Importar '+dayLabel(parsed.key)+': '+result.added+' comidas nuevas. Se actualizarán las metas, agua, cafeína, pasos y suplementos presentes en el resumen. Los otros días se conservan.')) return;
    exportAppData(); appState=result.state;
    const saved=saveState(); renderAll();
    status.textContent=saved?'Día incorporado: '+result.added+' comidas nuevas. '+(cloudUser?'Revisa el estado de sincronización.':'Inicia sesión para guardarlo en la nube.'):'Importado en pantalla, pero no se pudo guardar. Descarga un respaldo ahora.';
  } catch(e) {status.textContent='No se importó: '+e.message;}
}
function prepareSummaryLink() {
  const params=new URLSearchParams(window.location.hash.slice(1));
  let summary=params.get('summary'),date=params.get('date');
  // Recovery links for records included in the user's original HTML.
  const originalDate=params.get('recover-original');
  const legacyIds={'2026-10-15':'jueves15','2026-10-16':'viernes16','2026-10-17':'sabado17','2026-10-18':'domingo18'};
  if(originalDate && legacyIds[originalDate]) {
    const day=DEFAULT_STATE.days[legacyIds[originalDate]],t=getTotalsForDay(day);
    if(day.meals.length) {
      date=originalDate;
      summary=`Resumen MacroTurno Pro — ${day.tabLabel}\nEstado: ${day.badge}\nCalorías: ${t.cal} / ${day.targets.cal} kcal\nMacros: P: ${t.p}/${day.targets.p}g | C: ${t.c}/${day.targets.c}g | G: ${t.g}/${day.targets.g}g\nAgua: ${day.water}L | Cafeína: ${day.caffeine}mg | Pasos: ${day.steps}\nCreatina 5g: ${day.supplements.creatine?'✅':'⏳'} | Magnesio: ${day.supplements.magnesium?'✅':'⏳'}\n`+day.meals.map(m=>`• ${m.time} - ${m.name} (${m.cal} kcal | P:${m.p}g C:${m.c}g G:${m.g}g)`).join('\n');
    }
  }
  if(!summary || summary.length>100000) return;
  document.getElementById('accountPanel').classList.remove('hidden');
  document.getElementById('summaryImport').open=true;
  document.getElementById('summaryText').value=summary;
  if(date && validDate(date)) document.getElementById('summaryDate').value=date;
  // Remove the recovery text from the visible URL after filling the form.
  history.replaceState(null,'',window.location.pathname+window.location.search);
}

window.addEventListener('hashchange',prepareSummaryLink);
