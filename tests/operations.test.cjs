const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
function element(id) {
    if (!elements.has(id)) elements.set(id, {value:'0', dataset:{}, classList:{remove(){},add(){}},
        prepend(){},setAttribute(){},addEventListener(){},setSelectionRange(){},textContent:''});
    return elements.get(id);
}
const data = new Map();
let counter = 0, fail = false;
const clone = x => JSON.parse(JSON.stringify(x));
const db = {
    collection(name) { return {
        doc(id = String(++counter)) { return {id, path:name+'/'+id, onSnapshot(){return () => {};}}; },
        onSnapshot(){}, where(){return {get:async()=>({docs:[]})};}
    }; },
    async runTransaction(fn) {
        await new Promise(resolve=>setTimeout(resolve,5));
        const writes=[];
        const tx = {
            get:async ref=>({exists:data.has(ref.path),data:()=>clone(data.get(ref.path))}),
            set:(ref,value)=>writes.push(()=>data.set(ref.path,clone(value))),
            update:(ref,value)=>writes.push(()=>data.set(ref.path,{...data.get(ref.path),...clone(value)}))
        };
        await fn(tx);
        if (fail) throw new Error('Mạng thử nghiệm bị ngắt');
        writes.forEach(write=>write());
    }
};
const local = new Map();
const context = {
    state:{role:'cashier',currentStaff:{id:'cashier1',name:'A'},currentTableId:1,cart:[],tables:[],serviceNote:''},
    db, navigator:{onLine:true}, localStorage:{setItem:(k,v)=>local.set(k,v),getItem:k=>local.get(k)},
    document:{createElement:()=>element('status'),getElementById:element,querySelectorAll:()=>[],addEventListener(){}},
    confirm:()=>true, showToast(){}, updateCartUI(){}, closeCart(){}, resetCashierTerminal(){}, showReceipt(){},
    updateCashierShiftSummary(){}, setTimeout, console, Date, Set,
    addEventListener(){},switchView(){}
};
context.window = context;
vm.createContext(context);
vm.runInContext(readFileSync('js/operations.js','utf8'),context);
(async()=>{
    data.set('tables/1',{orders:[],status:'empty'});
    context.state.cart=[{id:'food',name:'Món',price:100,qty:2}];
    await Promise.all([context.checkout(),context.checkout()]);
    assert.equal(data.get('tables/1').orders[0].qty,2);
    assert.equal([...data.keys()].filter(k=>k.startsWith('kitchen_orders/')).length,1);
    assert.equal(context.state.cart.length,0);
    context.state.cart=[{id:'food',name:'Món',price:100,qty:1}];
    fail=true;
    await context.checkout();
    assert.equal(context.state.cart[0].qty,1);
    assert.equal(data.get('tables/1').orders[0].qty,2);
    fail=false;
    await context.checkout();
    assert.equal(data.get('tables/1').orders[0].qty,3);
    element('openingCash').value='50000';
    element('openingCash').oninput();
    assert.equal(element('openingCash').value,'50.000');
    await element('openShift').onclick();
    assert.equal(data.get('cashier_shifts/cashier1').openingCash,50000);
    assert.equal(data.get('cashier_shifts/cashier1').cash,0);
    const shiftId = data.get('cashier_shifts/cashier1').id;
    context.state.tables=[{id:1,...clone(data.get('tables/1'))}];
    context.state.cashierSelectedTableId=1;
    context.state.cashierPaymentMethod='cash';
    await Promise.all([context.submitCashierPayment(),context.submitCashierPayment()]);
    assert.equal([...data.keys()].filter(k=>k.startsWith('bills/')).length,1);
    assert.equal(data.get('cashier_shifts/cashier1').cash,300);
    await context.submitCashierPayment();
    assert.equal([...data.keys()].filter(k=>k.startsWith('bills/')).length,1);
    element('actualCash').value='1.280'; element('actualQr').value='2.000';
    await element('closeShift').onclick();
    assert.equal(data.get('shift_reports/'+shiftId).difference,2980);
    assert.equal(data.get('shift_reports/'+shiftId).openingCash,50000);
    assert.equal(data.get('cashier_shifts/cashier1').status,'closed');
    console.log('PASS: duplicate submission, failed retry, duplicate payment, shift reconciliation');
})().catch(error=>{console.error(error);process.exitCode=1;});
