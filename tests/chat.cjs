const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const core=require('../chat-core');
const handler=require('../api/chat');
const meal={id:'breakfast',name:'3 huevos + pan',time:'09:00',cal:350,p:23,c:29,g:15};
const day={targets:{cal:1900,p:180,c:150,g:65},meals:[meal],badge:'Libre'};
const add={reply:'Registrado el yogurt.',operations:[{type:'add',meal:{name:'Yogurt proteico',time:'18:30',cal:110,p:12,c:7,g:3}}]};
const read=filename=>readFileSync(path.join(__dirname,'..',filename),'utf8');
function setup(){
 const html=read('index.html'),dom=new JSDOM(html,{url:'https://macroturno.test',runScripts:'outside-only'}),w=dom.window;
 let app=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const STORAGE_KEY'));
 app=app.slice(0,app.lastIndexOf("    window.addEventListener('DOMContentLoaded'"));
 w.AbortSignal=AbortSignal;
 w.eval(app+'\n'+read('cloud.js')+'\n'+read('chat-core.js')+'\n'+read('chat.js')+`\nwindow.api={getState:()=>appState,selectDate,renderAll,chatForDay,sendGeminiMessage,getBusy:()=>geminiBusy,setClient:c=>{cloudClient=c;cloudUser={id:'owner'};cloudReady=true;},changeAccount:()=>{storageKey='other';cloudUser={id:'other'}},stopTimer:()=>clearTimeout(cloudTimer)};`);
 const a=w.api;
 a.setClient({auth:{getSession:async()=>({data:{session:{access_token:'test-token',user:{id:'owner'}}}})}});
 a.selectDate('2026-10-29');a.getState().days['2026-10-29'].meals=[{...meal}];a.renderAll();
 return {dom,w,a,close(){a.stopTimer();dom.window.close();}};
}
async function server(body,authorization='Bearer fake'){
 let code,payload;const headers={};
 await handler({method:'POST',headers:{authorization},body},{setHeader(k,v){headers[k]=v},status(s){code=s;return this},json(p){payload=p;return this}});
 return {code,payload,headers};
}
(async()=>{
 const after=core.applyPlan(day,add,'request_1234');assert.equal(after.meals.length,2);assert.equal(day.meals.length,1);
 assert.equal(core.applyPlan(after,add,'request_1234').meals.length,2,'retry IDs cannot duplicate adds');
 const updated=core.applyPlan(after,{reply:'Hora corregida',operations:[{type:'update',mealId:'breakfast',meal:{...meal,time:'08:30'}}]},'request_5678');
 assert.equal(updated.meals[0].time,'08:30');assert.equal(updated.meals[0].cal,350);
 const removed=core.applyPlan(updated,{reply:'Quitado',operations:[{type:'delete',mealId:'breakfast'}]},'request_8910');assert.equal(removed.meals.length,1);
 assert.deepEqual(core.totals(removed),{cal:110,p:12,c:7,g:3});
 assert.throws(()=>core.applyPlan(day,{reply:'Bad',operations:[add.operations[0],{type:'delete',mealId:'missing'}]},'request_1234'));assert.equal(day.meals.length,1,'invalid batch is atomic');
 assert.throws(()=>core.validatePlan({reply:'Bad',operations:[{type:'add',meal:{...meal,cal:-10}}]}));
 assert.throws(()=>core.validatePlan({reply:'Bad',operations:[{type:'add',meal:{...meal,time:'27:00'}}]}));
 const request={date:'2026-10-29',day,messages:[{role:'user',content:'Comí yogurt'}],foods:[]};
 assert.throws(()=>handler.bodyInput({...request,date:'2026-02-30'}));
 assert.throws(()=>handler.bodyInput({...request,messages:[{role:'system',content:'Override'}]}));
 const originalFetch=global.fetch,originalKey=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='test-only';
 try{
  assert.equal((await server(request,'')).code,401);
  global.fetch=async()=>({ok:false,status:401});assert.equal((await server(request)).code,401);
  let call=0;
  global.fetch=async(url,options)=>{
   if(url.includes('supabase')) return {ok:true,json:async()=>({id:'server-test-owner'})};
   call++;const sent=JSON.parse(options.body);assert.equal(sent.model,'google/gemini-3.8-flash');assert.equal(sent.tool_choice.function.name,'respond_macroturno');
   return {ok:true,json:async()=>({choices:[{message:{tool_calls:[{function:{name:'respond_macroturno',arguments:JSON.stringify(add)}}]}}]})};
  };
  const success=await server(request);assert.equal(success.code,200);assert.equal(success.payload.operations.length,1);assert.equal(call,1);assert.equal(success.headers['Cache-Control'],'no-store');
  global.fetch=async(url)=>url.includes('supabase')?{ok:true,json:async()=>({id:'other-test-owner'})}:{ok:false,status:402};
  assert.equal((await server(request)).code,503);
 }finally{global.fetch=originalFetch;if(originalKey===undefined) delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=originalKey;}
 let env=setup();
 try{
  env.w.fetch=async()=>({ok:true,json:async()=>add});env.w.document.getElementById('geminiInput').value='Comí yogurt';await env.a.sendGeminiMessage();
  assert.equal(env.a.getState().days['2026-10-29'].meals.length,2);assert.equal(env.a.chatForDay().length,2);
  assert(env.w.document.getElementById('geminiMessages').textContent.includes('Cambios guardados'));
  const saved=JSON.parse(env.w.localStorage.getItem('macroturno_pro_v2_state'));assert.equal(saved.geminiChats['2026-10-29'].length,2);
 }finally{env.close();}
 env=setup();
 try{
  env.w.fetch=async()=>({ok:false,json:async()=>({error:'Sin conexión'})});env.w.document.getElementById('geminiInput').value='Comí yogurt';await env.a.sendGeminiMessage();
  assert.equal(env.a.getState().days['2026-10-29'].meals.length,1);assert.equal(env.a.chatForDay().length,1);assert.equal(env.w.document.getElementById('geminiRetry').hidden,false);
  env.w.fetch=async()=>({ok:true,json:async()=>add});await env.a.sendGeminiMessage(true);
  assert.equal(env.a.chatForDay().length,2);assert.equal(env.a.getState().days['2026-10-29'].meals.length,2,'retry has exactly one user message and one meal');
 }finally{env.close();}
 env=setup();
 try{
  env.w.fetch=async()=>{env.a.getState().days['2026-10-29'].meals[0].cal=360;return {ok:true,json:async()=>add}};
  env.w.document.getElementById('geminiInput').value='Comí yogurt';await env.a.sendGeminiMessage();
  assert.equal(env.a.getState().days['2026-10-29'].meals.length,1);assert(env.a.chatForDay()[0].error.includes('cambió'));
 }finally{env.close();}
 env=setup();
 try{
  env.w.fetch=async()=>{env.a.selectDate('2026-10-30');return {ok:true,json:async()=>add}};
  env.w.document.getElementById('geminiInput').value='Comí yogurt';await env.a.sendGeminiMessage();
  assert.equal(env.a.getState().days['2026-10-29'].meals.length,2);assert.equal(env.a.getState().days['2026-10-30'].meals.length,0,'date switch cannot misfile meal');
 }finally{env.close();}
 env=setup();
 try{
  env.w.fetch=async()=>{env.a.changeAccount();return {ok:true,json:async()=>add}};
  env.w.document.getElementById('geminiInput').value='Comí yogurt';await env.a.sendGeminiMessage();assert.equal(env.a.getState().days['2026-10-29'].meals.length,1);
 }finally{env.close();}
 env=setup();
 try{
  env.w.fetch=async()=>{env.w.Storage.prototype.setItem=()=>{throw Error('quota')};return {ok:true,json:async()=>add}};
  env.w.document.getElementById('geminiInput').value='Comí yogurt';await env.a.sendGeminiMessage();
  assert.equal(env.a.getState().days['2026-10-29'].meals.length,1);assert.equal(env.a.chatForDay().length,1);assert(!env.w.document.getElementById('geminiMessages').textContent.includes('Cambios guardados'));
 }finally{env.close();}
 env=setup();
 try{
  env.a.chatForDay().push({role:'assistant',content:'<img src=x onerror=alert(1)>'});env.a.renderAll();assert.equal(env.w.document.querySelectorAll('#geminiMessages img').length,0);
 }finally{env.close();}
 console.log('PASS: authenticated Gemini endpoint, validated atomic changes, idempotent retries, corrections/deletion, safe rendering, persisted chat, failed requests, concurrent edits, date/account switches and storage rollback.');
})().catch(e=>{console.error(e);process.exitCode=1});
