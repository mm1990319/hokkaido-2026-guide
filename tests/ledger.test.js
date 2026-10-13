const assert=require('node:assert/strict');
const L=require('../ledger.js');
const row=(extra={})=>({id:'test',name:'test',day:1,category:'飲食',currency:'JPY',amount:4000,shareJacky:50,paidJacky:0,paidWei:0,complete:false,...extra});

// A per-person JPY 2,000 budget was already multiplied into the row total.
let result=L.calculate([row()],.2);
assert.equal(result.budget,80000);
assert.equal(result.netJacky,0); // A budget is not money owed.

// A settled card charge replaces the JPY estimate and stays fixed when FX changes.
const settled=row({complete:true,paidJacky:850.13});
result=L.calculate([settled],.25);
assert.equal(result.budget,85013);
assert.equal(result.remaining,0);
assert.equal(result.netJacky,42506);
assert.equal(result.items[0].jShare+result.items[0].wShare,result.paid);

// Partial payments preserve the remaining estimate; liabilities use paid amounts.
result=L.calculate([row({paidJacky:100,paidWei:50})],.2);
assert.equal(result.remaining,65000);
assert.equal(result.netJacky,2500);
result=L.calculate([row({paidJacky:100,paidWei:50})],.2,[{from:'瑋瑋',amount:25}]);
assert.equal(result.netJacky,0);

// A traveler paying their own expense creates no reimbursement.
result=L.calculate([row({currency:'TWD',amount:299,shareJacky:100,complete:true,paidJacky:299})],.2);
assert.equal(result.netJacky,0);
assert.equal(result.budgetWei,0);

// Paying above a budget never produces a negative remainder.
result=L.calculate([row({paidWei:1000})],.2);
assert.equal(result.budget,100000);
assert.equal(result.remaining,0);
assert.equal(result.netJacky,-50000);

// Source reconciliation: Notion payment snapshot on 2026/10/13.
const data=require('../data.json');
result=L.calculate(data.expenses.map(L.defaults),data.expenseSettings.rate);
assert.equal(result.items.length,27);
assert.equal(result.paid,3046700);
assert.equal(result.paidJacky,2179500);
assert.equal(result.paidWei,867200);
assert.equal(result.netJacky,656150);
assert.equal(result.budget,result.paid+result.remaining);
assert.equal(Object.values(result.categories).reduce((a,b)=>a+b,0),result.budget);
assert.equal(Object.values(result.days).reduce((a,b)=>a+b,0),result.budget);
assert.equal(data.meals.length,7);
assert.equal(data.stays.length,5);
assert.equal(data.places.filter(p=>p.day).length,58);

const insurance=result.items.find(item=>item.id==='user-insurance-20261013');
assert.equal(insurance.paidJacky,3088);
assert.equal(result.categories['保險'],308800);
assert.equal(result.budget,4980700);
assert.equal(result.remaining,1934000);
assert.equal(result.items.find(item=>item.id==='hep-5days-20261013').amount,9600);
assert.equal(result.items.find(item=>item.id==='etc-card-20261013').amount,1100);
assert.equal(result.days[1],1521200);

// Two-night lodging is split only for daily charts; payment remains one record.
const granbell=result.items.find(item=>item.id==='3cfff866afef801e82abc94c9222344d');
assert.deepEqual(granbell.allocations,[{day:5,amount:216600},{day:6,amount:216600}]);
assert.equal(result.dayCategories[5]['住宿'],216600);
assert.equal(result.dayCategories[6]['住宿'],216600);
assert.equal(result.items.filter(item=>item.id===granbell.id).length,1);
for(const [day,categories] of Object.entries(result.dayCategories))assert.equal(Object.values(categories).reduce((a,b)=>a+b,0),result.days[day]);
assert.equal(Object.values(result.dayCategories).reduce((sum,categories)=>sum+Object.values(categories).reduce((a,b)=>a+b,0),0),result.budget);
const fx=L.calculate(data.expenses.map(L.defaults),.25);
assert.equal(fx.paid,result.paid);
assert.equal(fx.netJacky,result.netJacky);
assert(fx.remaining>result.remaining);
const odd=L.calculate([row({currency:'TWD',amount:100.01,allocationDays:[5,6]})],.2);
assert.deepEqual(odd.items[0].allocations,[{day:5,amount:5001},{day:6,amount:5000}]);
assert.equal(Object.values(odd.days).reduce((a,b)=>a+b,0),10001);
assert.throws(()=>L.calculate([row({allocationDays:[5,5]})],.2));

// Imports reject non-finite amounts and invalid split/transfer data.
const book={version:1,rate:.2,overrides:{test:{paidJacky:20,shareJacky:60}},custom:[],transfers:[]};
assert.deepEqual(L.validateBook(JSON.parse(JSON.stringify(book))),book);
assert.throws(()=>L.validateRow({amount:-1}));
assert.throws(()=>L.validateRow({paidJacky:Infinity}));
assert.throws(()=>L.validateRow({shareJacky:101}));
assert.throws(()=>L.validateBook({...book,transfers:[{from:'someone',amount:5}]}));
assert.throws(()=>L.validateBook({...book,rate:0}));
console.log('Ledger arithmetic, reconciliation and import validation passed.');
