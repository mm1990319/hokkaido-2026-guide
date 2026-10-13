// Payment facts come from Notion; only the FX estimate is stored locally.
const EXPENSE_RATE_KEY='hokkaido-budget-rate-v1';
const expenseColors={'飲食':'#bf684c','交通':'#4d7c9a','門票':'#bd912d','住宿':'#537d62','保險':'#9a6581','購物':'#87659d','其他':'#7a7b74'};
let expenseRate=null;
const twd=cents=>`NT$${(cents/100).toLocaleString('zh-TW',{minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2})}`;
const expenseColor=category=>expenseColors[category]||expenseColors['其他'];
const expenseDot=category=>`<span class="expense-dot" style="background:${expenseColor(category)}" aria-hidden="true"></span>`;
function initLedger(){
  expenseRate=state.data.expenseSettings.rate;
  try{const saved=Number(localStorage.getItem(EXPENSE_RATE_KEY));if(saved>0&&saved<=10)expenseRate=saved;}catch{}
  $('#expense-method').textContent=state.data.expenseSettings.note;
  $('#expense-source-date').textContent=`Notion 費用資料更新：${state.data.expenseSettings.updatedAt.replaceAll('-','/')} · ${state.data.expenses.filter(item=>!item.sourceType).length} 筆 Notion＋${state.data.expenses.filter(item=>item.sourceType).length} 筆補充`;
  $('#expense-exclusions').innerHTML=`<p>已列預算尚未包含：</p><ul>${state.data.expenseSettings.excluded.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p>共同費用兩人各半，未付預算不納入代墊。已付清項目採 Notion 實付台幣，保費採 Jacky 提供金額；未付採行程每人預估 × 2 或官方票價。HEP／ETC 為一車共用費用，S 級 X-bee／RAIZE 按普通車 5 天估算；實際依租車確認單與現場辦理。租車、HEP 與 ETC 卡在逐日圖平均分到 D1～D5；付款明細和 D1 現場待付保留整筆。行前保費列於 D1，並非當日待付。Granbell 兩晚住宿平均分配到 D5、D6，付款只計一次。每日預算依使用日分配，不代表當天需要付款；下方另列當地待付項目。代墊差額尚未扣除兩人之間的轉帳。</p><p>${sourceLink(state.data.expenseSettings.source,'Notion 費用清單')}</p>`;
  $('#expense-rate').addEventListener('change',event=>{
    const input=event.target,rate=Number(input.value);
    if(!input.checkValidity()||rate<=0||rate>10){toast('請輸入有效匯率');input.value=expenseRate;return;}
    expenseRate=rate;
    try{localStorage.setItem(EXPENSE_RATE_KEY,String(rate));}catch{}
    renderExpenses();
  });
  renderExpenses();
}
function expenseLegend(categories){
  return `<div class="expense-legend" aria-label="費用分類顏色">${categories.map(category=>`<span>${expenseDot(category)}${esc(category)}</span>`).join('')}</div>`;
}
function expenseCategoryChart(c,categories){
  const max=Math.max(...Object.values(c.categories),1);
  return categories.map(category=>{
    const value=c.categories[category]||0;
    return `<div class="budget-bar"><div><span>${expenseDot(category)}${esc(category)}</span><strong>${twd(value)}</strong><small>${c.budget?(value/c.budget*100).toFixed(1):0}%</small></div><div class="budget-track" aria-hidden="true"><span style="width:${value/max*100}%;background:${expenseColor(category)}"></span></div></div>`;
  }).join('');
}
function expenseDayChart(c,categories){
  const max=Math.max(...Object.values(c.days),1);
  return expenseLegend(categories)+state.data.days.map(day=>{
    const total=c.days[day.day]||0,values=c.dayCategories[day.day]||{};
    const parts=categories.filter(category=>values[category]>0);
    return `<div class="daily-budget"><div class="daily-budget-heading"><span>D${day.day} · ${esc(day.label)}</span><strong>${total?twd(total):'尚未列預算'}</strong></div><div class="daily-budget-track" aria-hidden="true"><div class="daily-budget-stack" style="width:${total/max*100}%">${parts.map(category=>`<span style="width:${values[category]/total*100}%;background:${expenseColor(category)}" title="${esc(category)} ${twd(values[category])}"></span>`).join('')}</div></div><div class="daily-budget-values">${parts.map(category=>`<span>${expenseDot(category)}${esc(category)} ${twd(values[category])}</span>`).join('')}</div></div>`;
  }).join('');
}
function expensePayerDetails(c,payer){
  const field=payer==='Jacky'?'paidJacky':'paidWei',total=payer==='Jacky'?c.paidJacky:c.paidWei;
  const items=c.items.filter(item=>item[field]>0);
  return `<section class="payer-details"><div class="payer-details-heading"><h4>${esc(payer)} 先付</h4><strong>${twd(total)}</strong></div><p>個人代付總額 · ${items.length} 筆</p><ul>${items.map(item=>`<li><div><span>${expenseDot(item.category)}${esc(item.name)}</span><small>${item.allocationDays?`D${item.allocationDays.join('、D')} · ${item.allocationDays.length}${item.category==='住宿'?'晚':'天'}合計，僅計一次`:`D${item.day}`} · ${item.source?sourceLink(item.source,'核對來源'):'Jacky 提供 · 已付款確認'}</small>${item.displayNote?`<small>${esc(item.displayNote)}</small>`:''}</div><strong>${twd(TravelLedger.cents(item[field]))}</strong></li>`).join('')}</ul></section>`;
}
function renderExpensePlan(c){
  const today=localToday();
  $('#expense-plan').innerHTML=state.data.days.map(day=>{
    const items=c.items.filter(item=>item.day===day.day&&item.remaining>0);
    const local=items.filter(item=>item.paymentPlace==='當地');
    const other=items.filter(item=>item.paymentPlace!=='當地');
    const total=local.reduce((sum,item)=>sum+item.remaining,0);
    const paidStay=c.items.filter(item=>item.category==='住宿'&&item.remaining===0&&item.allocations.some(a=>a.day===day.day));
    const rows=list=>list.map(item=>`<li><div><span>${expenseDot(item.category)}${esc(item.name)}</span><small>${esc(item.category)} · ${item.paymentPlace==='當地'?'當地待付':esc(item.paymentPlace)}${item.actual?' · 部分已付':''}</small>${item.displayNote?`<small class="plan-assumption">${esc(item.displayNote)} ${item.source?sourceLink(item.source,'官方說明'):''}</small>`:''}</div><div class="plan-amount"><strong>${item.currency==='JPY'&&!item.actual?`¥${item.amount.toLocaleString('zh-TW')}`:twd(item.remaining)}</strong>${item.currency==='JPY'&&!item.actual?`<small>約 ${twd(item.remaining)}</small>`:''}</div></li>`).join('');
    return `<article class="expense-plan-day ${day.date<today?'past-day':''}"><div class="expense-plan-heading"><div><span class="kicker">DAY ${String(day.day).padStart(2,'0')} · ${esc(day.label)}${day.date<today?' · 日期已過':''}</span><h4>${esc(day.route)}</h4></div><div><small>兩人當地待付預估</small><strong>${local.length?twd(total):'尚未列預算'}</strong></div></div>${local.length?`<ul class="expense-plan-items">${rows(local)}</ul>`:'<p class="plan-empty">目前沒有已列的當地待付項目，不代表當天沒有花費。</p>'}${other.length?`<div class="plan-other"><p>其他待付（未計入當地小計）</p><ul class="expense-plan-items">${rows(other)}</ul></div>`:''}${paidStay.map(item=>`<p class="plan-prepaid">住宿已付：${esc(item.name)} · 本日分配 ${twd(item.allocations.find(a=>a.day===day.day).amount)}（兩人合計，無須再付房費）</p>`).join('')}</article>`;
  }).join('');
}
function renderExpenses(){
  if(expenseRate===null)return;
  const c=TravelLedger.calculate(state.data.expenses.map(TravelLedger.defaults),expenseRate);
  const categories=Object.keys(expenseColors).filter(category=>Object.hasOwn(c.categories,category));
  for(const category of Object.keys(c.categories))if(!categories.includes(category))categories.push(category);
  const local=c.items.filter(item=>item.paymentPlace==='當地').reduce((sum,item)=>sum+item.remaining,0);
  $('#expense-rate').value=expenseRate;
  $('#expense-summary').innerHTML=[['兩人已列總預算',twd(c.budget),'已付實額＋未付款估算；尚有未列項目'],['每人分攤預算',`${twd(c.budgetJacky)} / ${twd(c.budgetWei)}`,'Jacky / 瑋瑋；共同費用各半'],['兩人目前已支付',twd(c.paid),`Jacky ${twd(c.paidJacky)} · 瑋瑋 ${twd(c.paidWei)}`],['兩人已列待付預估',twd(c.remaining),`其中當地待付 ${twd(local)}；已付房費不重複計算`]].map(([title,value,note])=>`<article><span>${esc(title)}</span><strong>${esc(value).replace(/NT\$[\d,.]+/g,'<span class="money-value">$&</span>')}</strong><small>${esc(note)}</small></article>`).join('');
  $('#expense-category-chart').innerHTML=expenseCategoryChart(c,categories);
  $('#expense-day-chart').innerHTML=expenseDayChart(c,categories);
  const amount=Math.abs(c.netJacky),from=c.netJacky>0?'瑋瑋':'Jacky',to=c.netJacky>0?'Jacky':'瑋瑋';
  $('#settlement-result').innerHTML=c.unassigned?`<p role="alert">有 ${twd(c.unassigned)} 未指定付款人，請先在 Notion 確認。</p>`:`<p class="settlement-amount">${amount?`${esc(from)} <span>→</span> ${esc(to)} <strong>${twd(amount)}</strong>`:'目前無代墊差額'}</p><p>以兩人已付總額 ${twd(c.paid)} 各半計算，每人應負擔 ${twd(c.paid/2)}。僅含已支付項目，尚未扣除彼此轉帳；未付款預算不納入結算。</p>`;
  $('#settlement-details').innerHTML=expensePayerDetails(c,'Jacky')+expensePayerDetails(c,'瑋瑋');
  renderExpensePlan(c);
}
