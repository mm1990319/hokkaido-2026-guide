/* Amounts are aggregated for two travelers. Arithmetic uses TWD cents. */
const TravelLedger = (() => {
  const cents = value => Math.round((Number(value) + Number.EPSILON) * 100);
  const money = value => Number.isFinite(value) && value >= 0 && value <= 10000000;
  const fields = ['name','category','day','currency','amount','paidJacky','paidWei','unassignedPaid','complete','shareJacky','selectedPayer','paymentPlace'];
  function validateRow(row) {
    if (!row || typeof row !== 'object') throw Error('費用格式不正確');
    const out = {};
    for (const key of fields) if (Object.hasOwn(row,key)) out[key]=row[key];
    for (const key of ['amount','paidJacky','paidWei','unassignedPaid'])
      if (out[key] !== undefined && !money(out[key])) throw Error('費用金額須介於 0 與 1,000 萬');
    if (out.shareJacky !== undefined && (!Number.isFinite(out.shareJacky) || out.shareJacky<0 || out.shareJacky>100)) throw Error('分攤比例須介於 0 與 100');
    if (out.currency !== undefined && !['TWD','JPY'].includes(out.currency)) throw Error('幣別不支援');
    if (out.day !== undefined && (!Number.isInteger(out.day)||out.day<1||out.day>7)) throw Error('日期不正確');
    if (out.complete !== undefined && typeof out.complete !== 'boolean') throw Error('付款狀態不正確');
    if (out.selectedPayer !== undefined && !['','Jacky','瑋瑋','各自支付'].includes(out.selectedPayer)) throw Error('付款人不正確');
    if (out.paymentPlace !== undefined && !['當地','預扣款','待確認','已付款'].includes(out.paymentPlace)) throw Error('付款方式不正確');
    for (const key of ['name','category']) if(out[key] !== undefined && (typeof out[key]!=='string'||out[key].length>200)) throw Error('項目文字不正確');
    return out;
  }
  function defaults(row) {
    return {...row, paidJacky:row.payer==='Jacky'?(row.paid||0):0,
      paidWei:row.payer==='瑋瑋'?(row.paid||0):0,
      unassignedPaid:row.paid&&!['Jacky','瑋瑋'].includes(row.payer)?row.paid:0,
      shareJacky:row.shareJacky??50, selectedPayer:row.payer||''};
  }
  function calculate(rows,rate,transfers=[]) {
    if(!Number.isFinite(rate)||rate<=0||rate>10)throw Error('匯率須大於 0 且不超過 10');
    let budget=0,paid=0,remaining=0,paidJacky=0,paidWei=0,owedJacky=0,budgetJacky=0,unassigned=0;
    const categories={},days={},dayCategories={};
    const items=rows.map(row=>{
      const j=cents(row.paidJacky||0),w=cents(row.paidWei||0),u=cents(row.unassignedPaid||0);
      const actual=j+w+u;
      const estimate=cents(row.amount*(row.currency==='JPY'?rate:1));
      const total=row.complete&&actual>0?actual:Math.max(estimate,actual);
      const balance=total-actual;
      const jShare=Math.round(actual*row.shareJacky/100);
      const jBudget=Math.round(total*row.shareJacky/100);
      budget+=total;paid+=actual;remaining+=balance;paidJacky+=j;paidWei+=w;owedJacky+=jShare;budgetJacky+=jBudget;unassigned+=u;
      categories[row.category||'其他']=(categories[row.category||'其他']||0)+total;
      const allocationDays=row.allocationDays||[row.day];
      if(!Array.isArray(allocationDays)||!allocationDays.length||new Set(allocationDays).size!==allocationDays.length||allocationDays.some(day=>!Number.isInteger(day)||day<1||day>7))throw Error('費用分配日期不正確');
      const allocations=allocationDays.map((day,index)=>({day,amount:Math.floor(total/allocationDays.length)+(index<total%allocationDays.length?1:0)}));
      for(const allocation of allocations){
        days[allocation.day]=(days[allocation.day]||0)+allocation.amount;
        const byCategory=dayCategories[allocation.day]||={};
        byCategory[row.category||'其他']=(byCategory[row.category||'其他']||0)+allocation.amount;
      }
      return {...row,estimate,total,actual,remaining:balance,jShare,wShare:actual-jShare,allocations};
    });
    let netJacky=paidJacky-owedJacky;
    for(const transfer of transfers) netJacky+=cents(transfer.amount)*(transfer.from==='Jacky'?1:-1);
    return {items,budget,paid,remaining,paidJacky,paidWei,budgetJacky,budgetWei:budget-budgetJacky,netJacky,unassigned,categories,days,dayCategories};
  }
  function validateBook(value) {
    if(!value||value.version!==1||!Number.isFinite(value.rate)||value.rate<=0||value.rate>10)throw Error('不是有效的北海道帳本備份');
    if(!value.overrides||typeof value.overrides!=='object'||Array.isArray(value.overrides))throw Error('缺少逐筆資料');
    const out={version:1,rate:value.rate,overrides:{},custom:[],transfers:[]};
    const entries=Object.entries(value.overrides);
    if(entries.length>2000)throw Error('費用筆數過多');
    for(const [id,row] of entries){if(!/^[a-zA-Z0-9-]{1,100}$/.test(id))throw Error('費用識別碼不正確');out.overrides[id]=validateRow(row);}
    if(!Array.isArray(value.custom)||value.custom.length>500||!Array.isArray(value.transfers)||value.transfers.length>1000)throw Error('備份筆數不正確');
    const ids=new Set();
    for(const row of value.custom){
      if(!/^custom-[a-zA-Z0-9-]+$/.test(row.id)||ids.has(row.id))throw Error('自訂費用識別碼不正確');
      const clean=validateRow(row);
      if(!clean.name||clean.amount===undefined||!clean.currency||!clean.day)throw Error('自訂費用欄位不完整');
      out.custom.push({id:row.id,...clean});ids.add(row.id);
    }
    for(const t of value.transfers){
      if(!t||!['Jacky','瑋瑋'].includes(t.from)||!money(t.amount)||t.amount<=0||typeof t.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(t.id)||typeof t.date!=='string'||t.date.length>40)throw Error('轉帳紀錄不正確');
      out.transfers.push({id:t.id,from:t.from,amount:t.amount,date:t.date});
    }
    return out;
  }
  return {cents,defaults,calculate,validateRow,validateBook};
})();
if(typeof module!=='undefined')module.exports=TravelLedger;
