const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const L=require('../ledger.js');
const data=require('../data.json');
const elements={},listeners={};
const staleBook={version:1,rate:.9,overrides:Object.fromEntries(data.expenses.map(e=>[e.id,{paidJacky:0,paidWei:99999,complete:true}])),custom:[],transfers:[{from:'瑋瑋',amount:999}]};
const storage=new Map([['hokkaido-ledger-v1',JSON.stringify(staleBook)]]);
const context={TravelLedger:L,state:{data},Intl,localToday:()=> '2026-10-13',toast:()=>{},
  esc:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
  sourceLink:(url,label)=>`<a href="${url}">${label}</a>`,
  $:selector=>elements[selector]??={innerHTML:'',textContent:'',value:'',addEventListener:(event,fn)=>listeners[event]=fn},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}};
vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../expenses.js'),'utf8'),context);
vm.runInContext('initLedger()',context);
assert(elements['#expense-summary'].innerHTML.includes('NT$30,467'));
assert(elements['#settlement-result'].innerHTML.includes('NT$6,561.50'));
assert(elements['#settlement-result'].innerHTML.includes('尚未扣除彼此轉帳'));
assert(elements['#settlement-details'].innerHTML.includes('NT$21,795'));
assert(elements['#settlement-details'].innerHTML.includes('NT$8,672'));
assert.equal((elements['#settlement-details'].innerHTML.match(/核對來源/g)||[]).length,6);
assert.equal((elements['#expense-plan'].innerHTML.match(/class="expense-plan-day /g)||[]).length,7);
assert(!elements['#expense-plan'].innerHTML.includes('<input'));
assert(!elements['#expense-plan'].innerHTML.includes('<form'));
assert(elements['#expense-plan'].innerHTML.includes('¥6,600'));
assert(elements['#expense-plan'].innerHTML.includes('住宿已付'));
assert(elements['#expense-plan'].innerHTML.includes('¥9,600'));
assert(elements['#expense-plan'].innerHTML.includes('¥1,100'));
assert(elements['#expense-plan'].innerHTML.includes('X-bee／RAIZE'));
assert(!elements['#expense-plan'].innerHTML.includes('旅遊保險'));
assert(elements['#settlement-details'].innerHTML.includes('NT$3,088'));
assert(elements['#settlement-details'].innerHTML.includes('Jacky 提供'));
assert(elements['#settlement-details'].innerHTML.includes('5天合計，僅計一次'));
assert(elements['#expense-plan'].innerHTML.includes('NT$3,820'));
assert(elements['#expense-day-chart'].innerHTML.includes('NT$1,834.80'));
assert(elements['#expense-source-date'].textContent.includes('24 筆 Notion＋3 筆補充'));
assert(!elements['#expense-plan'].innerHTML.includes('¥21,452'));
assert(elements['#expense-plan'].innerHTML.includes('尚未列預算'));
for(const color of ['#bf684c','#4d7c9a','#bd912d','#537d62','#9a6581']){
  assert(elements['#expense-category-chart'].innerHTML.includes(color));
  assert(elements['#expense-day-chart'].innerHTML.includes(color));
}
const paid=elements['#settlement-result'].innerHTML;
listeners.change({target:{value:'.25',checkValidity:()=>true}});
assert.equal(elements['#settlement-result'].innerHTML,paid);
assert.equal(storage.get('hokkaido-budget-rate-v1'),'.25'.replace(/^\./,'0.'));
assert.equal(storage.get('hokkaido-ledger-v1'),JSON.stringify(staleBook));
console.log('Read-only snapshot, stale local overrides, payer details, shared colors, daily plans and FX checks passed.');
