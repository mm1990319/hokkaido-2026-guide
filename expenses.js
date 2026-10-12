const LEDGER_KEY='hokkaido-ledger-v1';
let ledgerBook=null,expenseFilter='全部';
const twd=cents=>`NT$${(cents/100).toLocaleString('zh-TW',{minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2})}`;
const uid=prefix=>prefix+'-'+crypto.randomUUID();
function initLedger(){
  try{ledgerBook=TravelLedger.validateBook(JSON.parse(localStorage.getItem(LEDGER_KEY)||'null'));}
  catch{ledgerBook={version:1,rate:state.data.expenseSettings.rate,overrides:{},custom:[],transfers:[]};}
  $('#expense-method').textContent=state.data.expenseSettings.note;
  $('#expense-exclusions').innerHTML=`<p>這是已列項目的預算小計，尚非整趟最終總價：</p><ul>${state.data.expenseSettings.excluded.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p>行程每人金額 × 2，住宿以訂房內頁的整房金額補正。已付清項目使用實付台幣；未付日圓費用依上方匯率試算。每筆已付金額按分攤比例算應負擔額，再扣除已完成轉帳。預計扣款尚未算已付。付款地點不確定時會保留待確認。</p><p>${sourceLink(state.data.expenseSettings.source,'Notion 費用清單')}</p>`;
  $('#add-expense-day').innerHTML=state.data.days.map(d=>`<option value="${d.day}">D${d.day} · ${esc(d.label)}</option>`).join('');
  document.addEventListener('change',ledgerChange);
  document.addEventListener('click',ledgerClick);
  document.addEventListener('submit',ledgerSubmit);
  renderExpenses();
}
function ledgerRows(){
  return [...state.data.expenses,...ledgerBook.custom].map(e=>({...TravelLedger.defaults(e),...ledgerBook.overrides[e.id]}));
}
function saveLedger(){
  try{localStorage.setItem(LEDGER_KEY,JSON.stringify(ledgerBook));}
  catch{toast('此瀏覽器無法保存帳本，請立即匯出備份');}
}
function expenseBars(values,total,label){
  const max=Math.max(...Object.values(values),1);
  return Object.entries(values).map(([key,value])=>`<div class="budget-bar"><div><span>${esc(label?label(key):key)}</span><strong>${twd(value)}</strong><small>${total?Math.round(value/total*100):0}%</small></div><div class="budget-track"><span style="width:${value/max*100}%"></span></div></div>`).join('');
}
function renderExpenses(){
  if(!ledgerBook)return;
  const opened=new Set($$('#expense-list details[open]').map(e=>e.dataset.expenseId));
  const c=TravelLedger.calculate(ledgerRows(),ledgerBook.rate,ledgerBook.transfers);
  $('#expense-rate').value=ledgerBook.rate;
  $('#expense-summary').innerHTML=[['兩人已列預算',twd(c.budget),'含已付款＋未付款估算，尚有漏列項目'],['分攤預算',`${twd(c.budgetJacky)} / ${twd(c.budgetWei)}`,'Jacky / 瑋瑋；依逐筆比例計算'],['目前已支付',twd(c.paid),`Jacky ${twd(c.paidJacky)} · 瑋瑋 ${twd(c.paidWei)}`],['已列項目待付',twd(c.remaining),'含預扣款、當地費用與待確認款項']].map(([title,value,note])=>`<article><span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join('');
  $('#expense-category-chart').innerHTML=expenseBars(c.categories,c.budget);
  $('#expense-day-chart').innerHTML=expenseBars(Object.fromEntries(state.data.days.map(d=>[d.day,c.days[d.day]||0])),c.budget,key=>`D${key} · ${state.data.days[Number(key)-1].label}`);
  const amount=Math.abs(c.netJacky),from=c.netJacky>0?'瑋瑋':'Jacky',to=c.netJacky>0?'Jacky':'瑋瑋';
  $('#settlement-result').innerHTML=c.unassigned?`<p role="alert">有 ${twd(c.unassigned)} 未指定付款人，補齊後才能正確結算。</p>`:`<p class="settlement-amount">${amount?`${esc(from)} <span>→</span> ${esc(to)} <strong>${twd(amount)}</strong>`:'目前已結清'}</p><p>只計已支付的 ${twd(c.paid)}，已扣除下方轉帳紀錄。共同費用預設各半；個人消費請調整該筆比例。</p>`;
  $('#transfer-list').innerHTML=ledgerBook.transfers.map(t=>`<div class="transfer-row"><span>${esc(t.date.slice(0,10))} · ${esc(t.from)} → ${t.from==='Jacky'?'瑋瑋':'Jacky'} · ${twd(TravelLedger.cents(t.amount))}</span><button type="button" class="text-button" data-transfer-delete="${esc(t.id)}">撤銷紀錄</button></div>`).join('');
  $('#expense-filters').innerHTML=['全部','已付清','待付款','當地待付','預扣款'].map(x=>`<button type="button" class="filter-chip ${expenseFilter===x?'active':''}" data-expense-filter="${esc(x)}">${esc(x)}</button>`).join('');
  const filtered=c.items.filter(e=>expenseFilter==='全部'||expenseFilter==='已付清'&&e.complete&&e.actual>0||expenseFilter==='待付款'&&e.remaining>0||expenseFilter==='當地待付'&&e.remaining>0&&e.paymentPlace==='當地'||expenseFilter==='預扣款'&&e.remaining>0&&e.paymentPlace==='預扣款');
  $('#expense-list').innerHTML=filtered.map(e=>expenseCard(e,opened.has(e.id))).join('')||'<p class="empty-state">這個分類目前沒有費用。</p>';
}
function expenseCard(e,open){
  const raw=`${e.currency==='JPY'?'¥':'NT$'}${e.amount.toLocaleString('zh-TW')}`;
  const status=e.complete&&e.actual?'已付清':e.actual?'部分已付':e.paymentPlace==='預扣款'?'等待信用卡扣款':e.paymentPlace==='當地'?'當地待付':'付款地點待確認';
  const select=(field,options)=>`<select data-expense-field="${field}">${options.map(([value,label])=>`<option value="${esc(value)}" ${e[field]===value?'selected':''}>${esc(label)}</option>`).join('')}</select>`;
  const input=(field,step,max)=>`<input type="number" min="0" max="${max||10000000}" step="${step||'0.01'}" value="${esc(e[field])}" data-expense-field="${field}">`;
  return `<article class="expense-card" data-expense-id="${esc(e.id)}"><div class="expense-card-head"><div><span class="card-meta">D${e.day} · ${esc(e.category)} · ${esc(status)}</span><h4>${esc(e.name)}</h4><p>兩人${e.complete&&e.actual?'實付':'預算'} ${twd(e.total)}${e.currency==='JPY'&&!e.complete?` <small>（合計 ${esc(raw)}）</small>`:''}</p><small>已付 ${twd(e.actual)} · 待付 ${twd(e.remaining)}</small></div><label class="paid-check"><input type="checkbox" data-expense-field="complete" ${e.complete&&e.actual?'checked':''}><span>全額付清</span></label></div>
    <details data-expense-id="${esc(e.id)}" ${open?'open':''}><summary>編輯付款與分攤</summary><div class="expense-fields"><label>兩人合計預算 ${input('amount')}</label><label>預算幣別 ${select('currency',[['TWD','台幣'],['JPY','日圓']])}</label><label>付款安排 ${select('paymentPlace',[['當地','當地付款'],['預扣款','出發前／信用卡預扣款'],['待確認','地點待確認'],['已付款','已付款']])}</label><label>付款人 ${select('selectedPayer',[['','請選擇'],['Jacky','Jacky 代墊'],['瑋瑋','瑋瑋代墊'],['各自支付','兩人各自支付（按分攤比例）']])}</label><label>Jacky 實際已付（台幣） ${input('paidJacky')}</label><label>瑋瑋實際已付（台幣） ${input('paidWei')}</label><label>Jacky 負擔百分比 ${input('shareJacky','1',100)}</label><div class="expense-help">瑋瑋負擔 ${100-e.shareJacky}%。個人消費可填 100% 或 0%。實付金額可填帳單入帳值，不隨試算匯率變動。</div></div><p class="panel-foot">尚未付款時，先選付款人再勾「全額付清」，會帶入預算換算值，請改為實際帳單。取消勾選會保留實付紀錄；要取消付款，請把實付金額改為 0。</p><p class="expense-source">${esc(e.note||'自行新增的費用；金額為兩人合計。')} ${sourceLink(e.source,'來源')}</p>${e.id.startsWith('custom-')?`<button type="button" class="text-button" data-expense-delete="${esc(e.id)}">刪除自訂費用</button>`:`<button type="button" class="text-button" data-expense-restore="${esc(e.id)}">還原這筆 Notion 資料</button>`}</details></article>`;
}
function patchExpense(id,patch){
  ledgerBook.overrides[id]={...ledgerBook.overrides[id],...patch};saveLedger();renderExpenses();
}
function ledgerChange(event){
  const input=event.target;
  if(input.id==='expense-rate'){
    const rate=Number(input.value);if(!input.checkValidity()||rate<=0){toast('請輸入有效匯率');input.value=ledgerBook.rate;return;}
    ledgerBook.rate=rate;saveLedger();renderExpenses();return;
  }
  if(input.id==='ledger-import'){importLedger(input.files[0]);return;}
  const field=input.dataset.expenseField;if(!field)return;
  const id=input.closest('article[data-expense-id]').dataset.expenseId;
  const row=ledgerRows().find(r=>r.id===id),patch={};
  if(field==='complete'){
    patch.complete=input.checked;
    if(input.checked&&!row.paidJacky&&!row.paidWei&&!row.unassignedPaid){
      if(!row.selectedPayer){input.checked=false;toast('請先在「編輯付款與分攤」選付款人');return;}
      const amount=TravelLedger.cents(row.amount*(row.currency==='JPY'?ledgerBook.rate:1))/100;
      if(!amount){input.checked=false;toast('請先填費用金額');return;}
      allocatePayment(patch,row.selectedPayer,amount,row.shareJacky);
      toast('已帶入估算金額，請按實際帳單修改');
    }
  }else{
    if(input.type==='number'&&(!input.checkValidity()||input.value==='')){toast('請輸入有效金額或比例');renderExpenses();return;}
    patch[field]=input.type==='number'?Number(input.value):input.value;
    if(field==='selectedPayer'&&input.value){
      allocatePayment(patch,input.value,row.paidJacky+row.paidWei+(row.unassignedPaid||0),row.shareJacky);
      patch.unassignedPaid=0;
    }
  }
  const merged={...row,...patch};
  if(!merged.paidJacky&&!merged.paidWei&&!merged.unassignedPaid)patch.complete=false;
  patchExpense(id,TravelLedger.validateRow(patch));
}
function allocatePayment(patch,payer,amount,share){
  patch.paidJacky=payer==='Jacky'?amount:payer==='各自支付'?Math.round(TravelLedger.cents(amount)*share/100)/100:0;
  patch.paidWei=payer==='瑋瑋'?amount:payer==='各自支付'?(TravelLedger.cents(amount)-TravelLedger.cents(patch.paidJacky))/100:0;
}
function ledgerClick(event){
  const target=event.target.closest('button');if(!target)return;
  if(target.hasAttribute('data-ledger-export')){exportLedger();return;}
  if(target.dataset.expenseFilter){expenseFilter=target.dataset.expenseFilter;renderExpenses();return;}
  if(target.dataset.expenseRestore){delete ledgerBook.overrides[target.dataset.expenseRestore];saveLedger();renderExpenses();toast('已還原這筆來源資料');return;}
  if(target.dataset.expenseDelete){const id=target.dataset.expenseDelete;ledgerBook.custom=ledgerBook.custom.filter(e=>e.id!==id);delete ledgerBook.overrides[id];saveLedger();renderExpenses();return;}
  if(target.dataset.transferDelete){ledgerBook.transfers=ledgerBook.transfers.filter(t=>t.id!==target.dataset.transferDelete);saveLedger();renderExpenses();}
}
function ledgerSubmit(event){
  const form=event.target;
  if(form.id==='transfer-form'){
    event.preventDefault();const amount=Number(form.elements.amount.value);
    if(!form.checkValidity()||amount<=0)return;
    ledgerBook.transfers.push({id:uid('transfer'),from:form.elements.from.value,amount,date:new Date().toISOString()});
    saveLedger();form.reset();renderExpenses();toast('已記錄轉帳，結算已更新');
  }
  if(form.id==='add-expense-form'){
    event.preventDefault();if(!form.checkValidity())return;
    const values=Object.fromEntries(new FormData(form));
    ledgerBook.custom.push({id:uid('custom'),name:values.name.trim(),category:values.category,day:Number(values.day),currency:values.currency,amount:Number(values.amount),paidJacky:0,paidWei:0,shareJacky:50,complete:false,selectedPayer:'',paymentPlace:'待確認'});
    saveLedger();form.reset();expenseFilter='全部';renderExpenses();toast('已新增費用，可編輯付款與分攤');
  }
}
function exportLedger(){
  const snapshot={...ledgerBook,exportedAt:new Date().toISOString(),sourceDate:state.data.lastReviewed};
  // Freeze the currently shown records, so a backup survives future source edits.
  snapshot.overrides=Object.fromEntries(ledgerRows().map(e=>[e.id,TravelLedger.validateRow(e)]));
  const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`北海道帳本-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importLedger(file){
  if(!file)return;
  try{
    if(file.size>3000000)throw Error('備份檔過大');
    const raw=JSON.parse(await file.text()),next=TravelLedger.validateBook(raw);
    ledgerBook=next;saveLedger();renderExpenses();toast(raw.sourceDate&&raw.sourceDate!==state.data.lastReviewed?'已匯入；來源版本不同，請核對費用':'帳本已匯入此裝置');
  }catch(error){toast('匯入失敗：'+error.message);}
  finally{$('#ledger-import').value='';}
}
