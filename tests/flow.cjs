const {JSDOM}=require('jsdom');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const html=readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const cloud=readFileSync(require('node:path').join(__dirname,'../cloud.js'),'utf8');
const summary=readFileSync(require('node:path').join(__dirname,'../summary-import.js'),'utf8');
let app=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const STORAGE_KEY'));
app=app.slice(0,app.lastIndexOf("    window.addEventListener('DOMContentLoaded'"));
function setup(saved){
 const dom=new JSDOM(html,{url:'https://macroturno.test',runScripts:'outside-only'}),w=dom.window;
 w.confirm=()=>true;
 if(saved) w.localStorage.setItem('macroturno_pro_v2_state',JSON.stringify(saved));
 w.eval(app+'\n'+cloud+'\n'+summary+`\nwindow.api={parseDailySummary,mergeDailySummary,dateKey,validDate,offsetDate,selectDate,renderAll,quickLogMeal,loadAllSalienteMeals,saveState,normalizeState,exportAppData,attachCloudAccount,syncCloud,signOutCloud,reloadFromCloud,getState:()=>appState,getDefault:()=>DEFAULT_STATE,getVersion:()=>cloudVersion,dirty:()=>cloudDirty,conflict:()=>cloudConflict,setClient:c=>cloudClient=c};`);
 return {dom,w,a:w.api};
}
(async()=>{
 let {dom,w,a}=setup();
 a.renderAll();assert.equal(a.getState().days[a.getState().activeDayId].meals.length,0);
 assert.equal(a.dateKey(new Date('2026-10-17T01:30:00Z')),'2026-10-16');
 assert.equal(a.offsetDate('2026-12-31',1),'2027-01-01');assert.equal(a.offsetDate('2028-02-28',1),'2028-02-29');
 assert(!a.validDate('2026-02-30'));
 a.selectDate('2026-10-19');a.quickLogMeal('Prueba',100,10,10,2,'10:00');
 a.selectDate('2026-10-20');assert.equal(a.getState().days['2026-10-20'].meals.length,0);
 a.selectDate('2026-10-19');assert.equal(a.getState().days['2026-10-19'].meals.length,1);
 a.loadAllSalienteMeals();assert.equal(a.getState().activeDayId,'2026-10-19');assert.equal(a.getState().days['2026-10-19'].meals.length,4);
 const stored=JSON.parse(w.localStorage.getItem('macroturno_pro_v2_state'));
 w.location.hash='recover-original=2026-10-15';w.prepareSummaryLink();assert.equal(w.document.getElementById('summaryDate').value,'2026-10-15');assert(w.document.getElementById('summaryText').value.includes('1815 / 1980'));
 const old=a.getDefault();
 const d=old.days.jueves15;
 const summaryText='Resumen MacroTurno Pro — Jueves 15\nEstado: En Turno Noche\nCalorías: 1815 / 1980 kcal\nMacros: P: 188/185g | C: 148/165g | G: 46/60g\nAgua: 1.50L | Cafeína: 100mg | Pasos: 8500\nCreatina 5g: ✅ | Magnesio: ⏳\n'+d.meals.map(m=>`• ${m.time} - ${m.name} (${m.cal} kcal | P:${m.p}g C:${m.c}g G:${m.g}g)`).join('\n');
 const parsed=a.parseDailySummary(summaryText,'2026-10-15');
 assert.equal(parsed.meals.length,4);assert.equal(parsed.patch.water,1.5);assert.equal(parsed.supplements.creatine,true);assert.equal(parsed.supplements.magnesium,false);
 const merged=a.mergeDailySummary(a.getState(),parsed);assert.equal(merged.added,4);assert.equal(merged.state.days['2026-10-19'].meals.length,4);assert.equal(merged.state.days['2026-10-15'].targets.cal,1980);
 assert.equal(a.mergeDailySummary(merged.state,parsed).added,0);
 assert.throws(()=>a.parseDailySummary(summaryText,'2026-10-16'));
 assert.throws(()=>a.parseDailySummary(summaryText.replace('1815 /','1816.5 /'),'2026-10-15'));
 dom.window.close();
 let migrated=setup(old);migrated.a.renderAll();assert.equal(migrated.a.getState().days['2026-10-15'].meals.length,4);assert(migrated.w.localStorage.getItem('macroturno_pro_v2_state_legacy_backup'));migrated.dom.window.close();
 ({dom,w,a}=setup(stored));a.renderAll();assert.equal(a.getState().days['2026-10-19'].meals.length,4);
 assert.throws(()=>a.normalizeState({days:{'2026-02-30':{}}}));
 // Imported display text cannot become markup.
 a.getState().days['2026-10-19'].meals[0].time='<img src=x onerror=alert(1)>';
 a.selectDate('2026-10-19');assert.equal(w.document.querySelectorAll('#mealsListContainer img').length,0);
 // Local failure is visible and never claimed to be a successful save.
 const set=w.Storage.prototype.setItem;w.Storage.prototype.setItem=()=>{throw Error('quota')};assert.equal(a.saveState(),false);assert(w.document.getElementById('storageStatus').textContent.includes('No se pudo guardar'));w.Storage.prototype.setItem=set;
 let row=null;
 const client={auth:{signOut:async()=>({error:null})},from(){let op='read',payload,version;
  return {select(){return this},eq(k,v){if(k==='version')version=v;return this},insert(v){op='insert';payload=v;return this},update(v){op='update';payload=v;return this},async single(){if(row)return{error:{code:'23505'}};row={...payload};return{data:{version:row.version}}},async maybeSingle(){if(op==='read')return{data:row?{state:row.state,version:row.version}:null};if(row.version!==version)return{data:null};row={...row,...payload};return{data:{version:row.version}}}};
 }};
 a.setClient(client);await a.attachCloudAccount({id:'test-owner',email:'test@example.com'});assert.equal(row.version,1);assert.equal(a.getVersion(),1);
 a.quickLogMeal('Nube',110,12,7,3);await a.syncCloud();assert.equal(row.version,2);assert.equal(a.dirty(),false);
 row.version=3; a.quickLogMeal('Cambio local',110,12,7,3);await a.syncCloud();assert(a.conflict());assert.equal(row.version,3);assert(a.dirty());
 // Reload explicitly backs up before replacing conflicting records.
 let backed=false;w.exportAppData=()=>{backed=true};await a.reloadFromCloud();assert(backed);assert.equal(a.conflict(),false);assert.equal(a.getVersion(),3);
 await a.signOutCloud();assert.equal(a.getState().days['2026-10-19'].meals.length,4);
 dom.window.close();
 console.log('PASS: empty new dates, Chile timezone, leap/year boundaries, legacy migration, persistence, protocol date, safe display, storage failure, cloud sync, conflict protection, explicit reload and sign-out separation.');
})().catch(e=>{console.error(e);process.exit(1)});
