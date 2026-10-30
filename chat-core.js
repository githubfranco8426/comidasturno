(function(root,factory){
  if(typeof module==='object' && module.exports) module.exports=factory();
  else root.MacroChat=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const keys=['cal','p','c','g'];
  function assert(ok,message){if(!ok) throw new Error(message);}
  function macros(value){
    assert(value && keys.every(k=>typeof value[k]==='number' && Number.isFinite(value[k]) && value[k]>=0 && value[k]<=20000),'Valores nutricionales inválidos.');
    return Object.fromEntries(keys.map(k=>[k,Math.round(value[k]*10)/10]));
  }
  function meal(value){
    assert(value && typeof value.name==='string' && value.name.trim().length>0 && value.name.length<=600,'Falta el nombre de la comida.');
    assert(typeof value.time==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time),'Hora de comida inválida.');
    return {name:value.name.trim(),time:value.time,...macros(value)};
  }
  function validatePlan(value){
    assert(value && typeof value.reply==='string' && value.reply.trim() && value.reply.length<=6000,'Gemini no devolvió una respuesta válida.');
    assert(Array.isArray(value.operations) && value.operations.length<=12,'Demasiados cambios en una respuesta.');
    return {reply:value.reply.trim(),operations:value.operations.map(op=>{
      assert(op && ['add','update','delete','targets'].includes(op.type),'Cambio no reconocido.');
      if(op.type==='targets') return {type:op.type,targets:macros(op.targets)};
      if(op.type==='add') return {type:op.type,meal:meal(op.meal)};
      assert(typeof op.mealId==='string' && op.mealId.length>0 && op.mealId.length<=160,'Falta identificar la comida que se corrige.');
      return op.type==='delete'?{type:op.type,mealId:op.mealId}:{type:op.type,mealId:op.mealId,meal:meal(op.meal)};
    })};
  }
  function applyPlan(day,input,requestId){
    const plan=validatePlan(input),next=JSON.parse(JSON.stringify(day));
    assert(typeof requestId==='string' && /^[a-zA-Z0-9_-]{8,100}$/.test(requestId),'Identificador inválido.');
    const touched=new Set();
    plan.operations.forEach((op,i)=>{
      if(op.type==='targets'){next.targets={...op.targets};return;}
      if(op.type==='add'){
        const id='chat_'+requestId+'_'+i;
        if(!next.meals.some(m=>m.id===id)) next.meals.push({id,...op.meal,source:'gemini'});
        return;
      }
      assert(!touched.has(op.mealId),'Se intentó cambiar dos veces la misma comida.');touched.add(op.mealId);
      const index=next.meals.findIndex(m=>m.id===op.mealId);
      assert(index>=0,'La comida cambió o ya no existe. Vuelve a intentarlo.');
      if(op.type==='delete') next.meals.splice(index,1);
      else next.meals[index]={...next.meals[index],...op.meal};
    });
    return next;
  }
  function totals(day){return day.meals.reduce((a,m)=>{keys.forEach(k=>a[k]+=m[k]);return a;},{cal:0,p:0,c:0,g:0});}
  return {validatePlan,applyPlan,meal,macros,totals};
});
