// Reliable order/payment writes and cashier shifts. All financial mutations
// use transactions; retrying the same draft uses the same operation ID.
const operationStatus = document.createElement('div');
operationStatus.className = 'operation-status';
operationStatus.setAttribute('role', 'status');
document.getElementById('app').prepend(operationStatus);
function reportOperation(status, message) {
    operationStatus.dataset.status = status;
    operationStatus.textContent = message;
}
function networkStatus() {
    reportOperation(navigator.onLine ? 'idle' : 'offline', navigator.onLine
        ? 'Có kết nối mạng' : 'Mất kết nối — món chờ gửi bếp được giữ trên máy');
}
window.addEventListener('online', networkStatus);
window.addEventListener('offline', networkStatus);
networkStatus();
const operationLocks = new Set();
async function guardedOperation(key, selector, action) {
    if (operationLocks.has(key)) return;
    operationLocks.add(key);
    const buttons = [...document.querySelectorAll(selector)];
    buttons.forEach(b => { b.disabled = true; });
    try {
        if (!navigator.onLine) throw new Error('Mất kết nối. Hãy kết nối lại và thử lại.');
        reportOperation('busy', 'Đang đồng bộ…');
        await action();
        reportOperation('idle', 'Đã đồng bộ');
    } catch (error) {
        reportOperation('error', 'Gửi thất bại — ' + (error.message || 'Vui lòng thử lại'));
    } finally {
        operationLocks.delete(key);
        buttons.forEach(b => { b.disabled = false; });
    }
}
function draftKey(id) { return 'gastro_draft_' + id; }
let draftOperationId = null;
let draftRequest = null;
window.persistTableDraft = function() {
    if (state.currentTableId == null) return;
    try { localStorage.setItem(draftKey(state.currentTableId), JSON.stringify({
        cart: state.cart, note: state.serviceNote || '', operationId: draftOperationId, request: draftRequest
    })); } catch (_) {
        reportOperation('error', 'Không lưu được món chờ gửi bếp trên máy. Đừng tải lại trang trước khi gửi món.');
    }
};
window.restoreTableDraft = function(id) {
    let draft = {};
    try { draft = JSON.parse(localStorage.getItem(draftKey(id))) || {}; } catch (_) {}
    state.cart = draft.cart || [];
    state.serviceNote = draft.note || '';
    draftOperationId = draft.operationId || null;
    draftRequest = draft.request || null;
};
document.querySelectorAll('.service-note-input').forEach(input => input.addEventListener('input', () => {
    state.serviceNote = input.value;
    persistTableDraft();
}));
window.checkout = function() {
    return guardedOperation('order', '#checkoutBtn, button[onclick="checkout()"]', async () => {
        if (!state.cart.length) throw new Error('Chưa có món chờ gửi bếp.');
        const tableId = state.currentTableId;
        draftRequest ||= {items:JSON.parse(JSON.stringify(state.cart)), note:state.serviceNote || ''};
        const items = draftRequest.items;
        const note = draftRequest.note;
        draftOperationId ||= db.collection('order_requests').doc().id;
        persistTableDraft();
        const requestRef = db.collection('order_requests').doc(draftOperationId);
        const tableRef = db.collection('tables').doc(String(tableId));
        const time = Date.now();
        await db.runTransaction(async tx => {
            const request = await tx.get(requestRef);
            if (request.exists) return;
            const snapshot = await tx.get(tableRef);
            if (!snapshot.exists) throw new Error('Bàn không tồn tại.');
            const orders = snapshot.data().orders || [];
            items.forEach(item => {
                const existing = orders.find(o => String(o.id) === String(item.id));
                if (existing) existing.qty += item.qty;
                else orders.push({id:item.id, name:item.name, price:item.price, qty:item.qty});
            });
            tx.update(tableRef, {orders, status:'occupied', serviceNote:note,
                staffId:state.currentStaff?.id || '', staffName:state.currentStaff?.name || 'Phục vụ'});
            items.forEach((item, i) => tx.set(db.collection('kitchen_orders').doc(requestRef.id + '_' + i), {
                tableId, itemId:item.id, name:item.name, qty:item.qty, status:'pending',
                timestamp:time, createdAt:new Date(time).toLocaleTimeString('vi-VN'), note,
                staffName:state.currentStaff?.name || 'Phục vụ'
            }));
            tx.set(requestRef, {tableId, timestamp:time});
        });
        // Preserve additions made while the captured order was being sent.
        items.forEach(sent => {
            const item = state.cart.find(i => String(i.id) === String(sent.id));
            if (item) item.qty = Math.max(0, item.qty - sent.qty);
        });
        state.cart = state.cart.filter(i => i.qty > 0);
        draftOperationId = null;
        draftRequest = null;
        persistTableDraft();
        updateCartUI();
        closeCart();
        showToast('Đã gửi món đến bếp');
    });
};

const shiftPanel = document.createElement('section');
shiftPanel.className = 'shift-panel';
shiftPanel.innerHTML = `<h3>Ca thu ngân</h3><p id="shiftInfo">Chưa mở ca</p>
<div class="shift-section shift-opening">
<div class="shift-fields">
<label>Tiền mặt đầu ca<input id="openingCash" type="text" inputmode="numeric" placeholder="0"></label>
<button class="btn" id="openShift">Mở ca</button></div></div>
<div class="shift-section shift-closing">
<div class="shift-fields">
<label>Tiền mặt thực thu<input id="actualCash" type="text" inputmode="numeric" placeholder="0"></label>
<label>Chuyển khoản thực thu<input id="actualQr" type="text" inputmode="numeric" placeholder="0"></label>
<button class="btn" id="closeShift">Chốt ca</button></div>
<p class="shift-hint">Thực thu không gồm tiền mặt đầu ca.</p></div>
<div id="shiftResult"></div><details class="shift-history"><summary>Lịch sử chốt ca</summary><div id="shiftHistory"></div></details>`;
document.getElementById('cashierView').prepend(shiftPanel);
function parseShiftMoney(value) {
    const digits = value.replace(/\./g, '').trim();
    return /^\d+$/.test(digits) && Number.isSafeInteger(Number(digits)) ? Number(digits) : NaN;
}
for (const id of ['openingCash', 'actualCash', 'actualQr']) {
    const input = document.getElementById(id);
    input.oninput = () => {
        const before = input.value;
        const digitsBeforeCaret = before.slice(0, input.selectionStart ?? before.length).replace(/\D/g, '').length;
        input.value = before.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        let caret = 0, count = 0;
        while (caret < input.value.length && count < digitsBeforeCaret) {
            if (/\d/.test(input.value[caret])) count++;
            caret++;
        }
        input.setSelectionRange(caret, caret);
    };
}
let cashierShift = null;
let shiftUnsubscribe = null;
let shiftOwner = null;
const money = n => Number(n || 0).toLocaleString('vi-VN') + 'đ';
function shiftRef() {
    if (!['cashier', 'admin'].includes(state.role)) throw new Error('Cần quyền thu ngân.');
    if (!state.currentStaff?.id) throw new Error('Vui lòng đăng nhập thu ngân.');
    return db.collection('cashier_shifts').doc(state.currentStaff.id);
}
function paintShift() {
    document.getElementById('shiftInfo').textContent = cashierShift?.status === 'open'
        ? 'Ca mở lúc ' + new Date(cashierShift.openedAt).toLocaleString('vi-VN') +
          ' • Tiền mặt đầu ca: ' + money(cashierShift.openingCash) +
          ' • Tiền mặt bán hàng: ' + money(cashierShift.cash) + ' • Chuyển khoản: ' + money(cashierShift.qr)
        : 'Chưa mở ca';
    document.getElementById('cashierShiftTotal').textContent = money((cashierShift?.cash || 0) + (cashierShift?.qr || 0));
    document.getElementById('cashierCashTotal').textContent = money(cashierShift?.cash);
    document.getElementById('cashierQrTotal').textContent = money(cashierShift?.qr);
    document.getElementById('cashierPaidBillsCount').textContent = cashierShift?.billCount || 0;
}
updateCashierShiftSummary = function() {
    if (!state.currentStaff?.id || !db) return;
    if (shiftOwner !== state.currentStaff.id) {
        shiftUnsubscribe?.();
        shiftOwner = state.currentStaff.id;
        shiftUnsubscribe = shiftRef().onSnapshot(doc => {
            cashierShift = doc.exists ? doc.data() : null;
            paintShift();
        }, e => reportOperation('error', 'Không tải được ca: ' + e.message));
        db.collection('shift_reports').where('cashierId', '==', shiftOwner).get().then(snapshot => {
            document.getElementById('shiftHistory').textContent = snapshot.docs.map(d => d.data())
                .sort((a,b) => b.closedAt-a.closedAt).slice(0,10).map(r =>
                    new Date(r.closedAt).toLocaleString('vi-VN') + ': đầu ca ' + money(r.openingCash) + ', tiền mặt thực thu ' + money(r.actualCash) + ', chuyển khoản ' + money(r.actualQr) + ', lệch ' + money(r.difference)).join(' | ') || 'Chưa có ca đã chốt';
        }).catch(e => reportOperation('error', e.message));
    }
    paintShift();
};
document.getElementById('openShift').onclick = () => guardedOperation('shift', '#openShift, #closeShift', async () => {
    const openingInput = document.getElementById('openingCash').value;
    const openingCash = parseShiftMoney(openingInput);
    if (!openingInput.trim() || !Number.isFinite(openingCash) || openingCash < 0)
        throw new Error('Nhập tiền mặt đầu ca (có thể nhập 0).');
    const ref = shiftRef();
    const id = db.collection('shift_reports').doc().id;
    await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (snap.exists && snap.data().status === 'open') throw new Error('Đã có ca đang mở.');
        tx.set(ref, {id, status:'open', openedAt:Date.now(), openingCash, cash:0, qr:0, billCount:0});
    });
    updateCashierShiftSummary();
});
document.getElementById('closeShift').onclick = () => guardedOperation('shift', '#openShift, #closeShift', async () => {
    const cashInput = document.getElementById('actualCash').value;
    const qrInput = document.getElementById('actualQr').value;
    const actualCash = parseShiftMoney(cashInput), actualQr = parseShiftMoney(qrInput);
    if (!cashInput || !qrInput || !Number.isFinite(actualCash+actualQr) || actualCash<0 || actualQr<0)
        throw new Error('Nhập tiền thực thu cho cả hai phương thức (có thể nhập 0).');
    if (!confirm('Xác nhận chốt ca với tổng thực thu ' + money(actualCash+actualQr) + '?')) return;
    let report;
    const ref = shiftRef();
    await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists || snap.data().status !== 'open') throw new Error('Không có ca đang mở.');
        const shift = snap.data();
        report = {...shift, cashierId:state.currentStaff.id, closedAt:Date.now(), status:'closed',
            actualCash, actualQr, difference:actualCash+actualQr-shift.cash-shift.qr};
        tx.set(db.collection('shift_reports').doc(shift.id), report);
        tx.update(ref, {status:'closed'});
    });
    document.getElementById('shiftResult').textContent = 'Đã chốt ca. Chênh lệch tiền mặt: ' +
        money(actualCash-report.cash) + '; chuyển khoản: ' + money(actualQr-report.qr) + '; tổng: ' + money(report.difference);
    shiftOwner = null;
    updateCashierShiftSummary();
});
window.submitCashierPayment = () => guardedOperation('payment', 'button[onclick="submitCashierPayment()"]', async () => {
    if (!['cashier','admin'].includes(state.role)) throw new Error('Cần quyền thu ngân.');
    const id = state.cashierSelectedTableId;
    const displayed = state.tables.find(t => t.id === id);
    if (!displayed?.orders?.length) throw new Error('Vui lòng chọn bàn có món.');
    const expected = JSON.stringify(displayed.orders);
    const discount = Math.min(100, Math.max(0, Number(document.getElementById('cashierDiscountPercent').value) || 0));
    const surcharge = Math.max(0, Number(document.getElementById('cashierSurcharge').value) || 0);
    if (!Number.isFinite(surcharge)) throw new Error('Phụ thu không hợp lệ.');
    const method = state.cashierPaymentMethod === 'qr' ? 'qr' : 'cash';
    if (!confirm('Xác nhận đã nhận tiền bàn ' + id + '?')) return;
    const tableRef = db.collection('tables').doc(String(id));
    const currentShiftRef = shiftRef();
    const billRef = db.collection('bills').doc();
    let bill;
    await db.runTransaction(async tx => {
        const table = await tx.get(tableRef);
        const shift = await tx.get(currentShiftRef);
        if (!shift.exists || shift.data().status !== 'open') throw new Error('Hãy mở ca trước khi thu tiền.');
        const data = table.data();
        if (!data?.orders?.length) throw new Error('Bàn đã được thanh toán.');
        if (JSON.stringify(data.orders) !== expected) throw new Error('Món đã thay đổi. Kiểm tra lại bill trước khi thu tiền.');
        const subtotal = data.orders.reduce((s,i) => s+i.price*i.qty,0);
        const discountAmount = Math.round(subtotal*discount/100);
        const total = Math.max(0, subtotal-discountAmount+surcharge);
        bill = {tableId:id, items:data.orders, subtotal, discountPercent:discount, discountAmount,
            surcharge, totalAmount:total, paymentMethod:method, shiftId:shift.data().id,
            cashierId:state.currentStaff.id, cashierName:state.currentStaff.name,
            staffId:data.staffId || '', staffName:data.staffName || '', timestamp:Date.now(),
            costAmount:Math.round(total*.35), profit:total-Math.round(total*.35),
            itemCount:data.orders.reduce((s,i)=>s+i.qty,0)};
        tx.set(billRef, bill);
        tx.update(tableRef, {orders:[], status:'empty', staffId:null, staffName:null, serviceNote:''});
        tx.update(currentShiftRef, {[method]:(shift.data()[method] || 0)+total, billCount:(shift.data().billCount || 0)+1});
    });
    resetCashierTerminal();
    showReceipt(bill);
});

// Keep the active draft stable during submission, including navigation and
// quantity controls. A second click on the submit button is harmless.
document.addEventListener('click', event => {
    if (!operationLocks.has('order') && !operationLocks.has('payment')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
}, true);
window.handleActionCheckout = function() {
    if (!['cashier','admin'].includes(state.role)) {
        showToast('Vui lòng yêu cầu thu ngân thanh toán bàn.');
        return;
    }
    state.cashierSelectedTableId = state.currentTableId;
    return submitCashierPayment();
};
const previousSwitchView = window.switchView;
window.switchView = function(view) {
    if (view === 'userMenu' && state.currentTableId != null) restoreTableDraft(state.currentTableId);
    return previousSwitchView(view);
};
// Observe server metadata without treating navigator.onLine as proof that
// Firestore is reachable.
if (db) db.collection('tables').onSnapshot({includeMetadataChanges:true}, snapshot => {
    if (operationLocks.size) return;
    if (snapshot.metadata.fromCache) reportOperation('offline', 'Chưa kết nối máy chủ — giữ món chờ gửi bếp trên máy');
    else reportOperation('idle', 'Đã đồng bộ');
}, error => reportOperation('error', 'Gửi thất bại / không đồng bộ được: ' + error.message));
