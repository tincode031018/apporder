// --- Receipt Modal Display ---
window.showReceipt = function(bill) {
    const modal = document.getElementById('receiptModal');
    if (!modal) return;
    document.getElementById('receiptTime').innerText = bill.dateFormatted || new Date(bill.timestamp || Date.now()).toLocaleString('vi-VN');
    document.getElementById('receiptTableInfo').innerHTML = `<span>Bàn: ${bill.tableId ? bill.tableId.toString().padStart(2, '0') : '--'}</span><span>NV: ${bill.staffName || 'Phục vụ'}</span>`;
    
    const ptttEl = document.getElementById('receiptPaymentMethod');
    const tnEl = document.getElementById('receiptCashier');
    if (ptttEl) ptttEl.innerText = `PTTT: ${bill.paymentMethod === 'qr' ? 'Chuyển khoản VietQR' : 'Tiền mặt'}`;
    if (tnEl) tnEl.innerText = `TN: ${bill.cashierName || 'Thu ngân'}`;

    const container = document.getElementById('receiptItemsContainer');
    container.innerHTML = '';
    (bill.items || []).forEach(item => {
        const itemTotal = (item.price || 0) * (item.qty || 1);
        const row = document.createElement('div');
        row.style = 'display: flex; justify-content: space-between; margin-bottom: 6px;';
        row.innerHTML = `
            <span>${item.name} x${item.qty}</span>
            <span>${itemTotal.toLocaleString()}đ</span>
        `;
        container.appendChild(row);
    });

    const breakdownEl = document.getElementById('receiptSummaryBreakdown');
    if (breakdownEl) {
        let bHtml = '';
        if (bill.subtotal && bill.subtotal !== bill.totalAmount) {
            bHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Tạm tính:</span><span>${bill.subtotal.toLocaleString()}đ</span></div>`;
        }
        if (bill.discountPercent > 0) {
            bHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #34d399;"><span>Giảm giá (${bill.discountPercent}%):</span><span>-${(bill.discountAmount || 0).toLocaleString()}đ</span></div>`;
        }
        if (bill.surcharge > 0) {
            bHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #fbbf24;"><span>Phụ thu / Tip:</span><span>+${bill.surcharge.toLocaleString()}đ</span></div>`;
        }
        breakdownEl.innerHTML = bHtml;
    }

    document.getElementById('receiptTotalAmount').innerText = (bill.totalAmount || 0).toLocaleString() + 'đ';
    modal.classList.remove('hidden');
};

window.closeReceiptModal = function() {
    const modal = document.getElementById('receiptModal');
    if (modal) modal.classList.add('hidden');
};

// --- Cashier Desk (Thu Ngân) Logic ---
state.cashierSelectedTableId = null;
state.cashierPaymentMethod = 'cash';

function renderCashierTables() {
    const container = document.getElementById('cashierTablesList');
    const badge = document.getElementById('cashierOccupiedCount');
    if (!container) return;
    container.innerHTML = '';

    const occupiedTables = (state.tables || []).filter(t => (t.orders && t.orders.length > 0) || t.status === 'occupied');
    if (badge) badge.innerHTML = `<i class="fa-solid fa-utensils"></i> ${occupiedTables.length} bàn đang có khách`;

    if (occupiedTables.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px 15px; color: var(--text-secondary);" class="glass-panel">
                <i class="fa-solid fa-mug-hot" style="font-size: 2.2rem; opacity: 0.3; margin-bottom: 12px; display: block;"></i>
                Hiện không có bàn nào đang gọi món
            </div>
        `;
        // Reset terminal if selected table no longer exists
        if (state.cashierSelectedTableId) {
            resetCashierTerminal();
        }
        return;
    }

    occupiedTables.forEach(table => {
        const total = (table.orders || []).reduce((acc, curr) => acc + ((curr.price || 0) * (curr.qty || 0)), 0);
        const isSelected = state.cashierSelectedTableId === table.id;

        const card = document.createElement('div');
        card.className = `btn glass-panel cashier-table-card ${isSelected ? 'active' : ''}`;
        card.dataset.tableId = table.id;

        card.onclick = () => selectCashierTable(table.id);

        card.innerHTML = `
            <span class="cashier-table-name">Bàn ${table.id.toString().padStart(2, '0')}</span>
            <span class="cashier-table-total"><small>Tạm tính</small>${total.toLocaleString()}đ</span>
        `;
        container.appendChild(card);
    });

    // If a table is already selected, re-render its details
    if (state.cashierSelectedTableId) {
        selectCashierTable(state.cashierSelectedTableId);
    }
}

window.selectCashierTable = function(tableId) {
    state.cashierSelectedTableId = tableId;
    const table = (state.tables || []).find(t => t.id === tableId);
    if (!table) return resetCashierTerminal();

    // Highlight selected card
    document.querySelectorAll('#cashierTablesList .cashier-table-card').forEach(card => card.classList.remove('active'));
    document.querySelector(`#cashierTablesList .cashier-table-card[data-table-id="${tableId}"]`)?.classList.add('active');

    const titleEl = document.getElementById('cashierActiveTableTitle');
    const badgeEl = document.getElementById('cashierActiveTableBadge');
    const staffEl = document.getElementById('cashierActiveStaff');
    const itemsEl = document.getElementById('cashierActiveItems');
    document.getElementById('cashierCheckoutTerminal')?.classList.remove('hidden');

    if (titleEl) titleEl.innerText = `Bàn ${table.id.toString().padStart(2, '0')}`;
    if (badgeEl) {
        badgeEl.innerText = 'Đang thanh toán';
        badgeEl.style.background = 'rgba(16, 185, 129, 0.2)';
        badgeEl.style.color = '#34d399';
    }
    if (staffEl) staffEl.innerText = `NV phục vụ: ${table.staffName || 'Chưa gán'}`;

    const orders = table.orders || [];
    if (orders.length === 0) {
        if (itemsEl) itemsEl.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 20px;">Bàn chưa gọi món nào</div>`;
    } else {
        if (itemsEl) {
            itemsEl.innerHTML = orders.map(item => `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dashed rgba(255,255,255,0.06); font-size: 0.88rem;">
                    <div>
                        <span style="font-weight: 600; color: var(--text-primary);">${item.name}</span>
                        <span style="color: #f59e0b; font-weight: 700; margin-left: 6px;">x${item.qty}</span>
                    </div>
                    <div style="font-weight: 600; color: var(--text-primary);">${((item.price || 0) * (item.qty || 1)).toLocaleString()}đ</div>
                </div>
            `).join('');
        }
    }

    recalcCashierFinalTotal();
};

function resetCashierTerminal() {
    state.cashierSelectedTableId = null;
    const titleEl = document.getElementById('cashierActiveTableTitle');
    const badgeEl = document.getElementById('cashierActiveTableBadge');
    const staffEl = document.getElementById('cashierActiveStaff');
    const itemsEl = document.getElementById('cashierActiveItems');
    const subtotalEl = document.getElementById('cashierSubtotal');
    const finalTotalEl = document.getElementById('cashierFinalTotal');
    document.getElementById('cashierCheckoutTerminal')?.classList.add('hidden');

    if (titleEl) titleEl.innerText = 'Chọn một bàn';
    if (badgeEl) {
        badgeEl.innerText = 'Chưa chọn';
        badgeEl.style.background = 'rgba(255,255,255,0.1)';
        badgeEl.style.color = 'inherit';
    }
    if (staffEl) staffEl.innerText = 'NV phục vụ: --';
    if (itemsEl) itemsEl.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 30px 10px; font-size: 0.85rem;">Vui lòng chọn bàn ở danh sách bên trái để kiểm tra chi tiết hóa đơn</div>`;
    if (subtotalEl) subtotalEl.innerText = '0đ';
    if (finalTotalEl) finalTotalEl.innerText = '0đ';

    const qrContainer = document.getElementById('cashierQrContainer');
    if (qrContainer) qrContainer.classList.add('hidden');
}

window.recalcCashierFinalTotal = function() {
    if (!state.cashierSelectedTableId) return;
    const table = (state.tables || []).find(t => t.id === state.cashierSelectedTableId);
    if (!table) return;

    const orders = table.orders || [];
    const subtotal = orders.reduce((acc, curr) => acc + ((curr.price || 0) * (curr.qty || 0)), 0);

    const discountInput = document.getElementById('cashierDiscountPercent');
    const surchargeInput = document.getElementById('cashierSurcharge');

    let discountPercent = parseFloat(discountInput?.value) || 0;
    if (discountPercent < 0) discountPercent = 0;
    if (discountPercent > 100) discountPercent = 100;

    let surcharge = parseFloat(surchargeInput?.value) || 0;
    if (surcharge < 0) surcharge = 0;

    const discountAmount = Math.round((subtotal * discountPercent) / 100);
    const finalAmount = Math.max(0, subtotal - discountAmount + surcharge);

    const subtotalEl = document.getElementById('cashierSubtotal');
    const finalTotalEl = document.getElementById('cashierFinalTotal');

    if (subtotalEl) subtotalEl.innerText = subtotal.toLocaleString() + 'đ';
    if (finalTotalEl) finalTotalEl.innerText = finalAmount.toLocaleString() + 'đ';

    // If QR is active, update QR code image URL
    if (state.cashierPaymentMethod === 'qr') {
        updateDynamicVietQr(table.id, finalAmount);
    }
};

window.setCashierPaymentMethod = function(method) {
    state.cashierPaymentMethod = method;
    const cashBtn = document.getElementById('payMethodCashBtn');
    const qrBtn = document.getElementById('payMethodQrBtn');
    const qrContainer = document.getElementById('cashierQrContainer');

    if (method === 'cash') {
        cashBtn.style.background = 'rgba(16, 185, 129, 0.2)';
        cashBtn.style.borderColor = '#10b981';
        cashBtn.style.color = '#34d399';

        qrBtn.style.background = 'rgba(255,255,255,0.05)';
        qrBtn.style.borderColor = 'var(--surface-border)';
        qrBtn.style.color = 'var(--text-primary)';

        if (qrContainer) qrContainer.classList.add('hidden');
    } else {
        qrBtn.style.background = 'rgba(99, 102, 241, 0.2)';
        qrBtn.style.borderColor = '#818cf8';
        qrBtn.style.color = '#818cf8';

        cashBtn.style.background = 'rgba(255,255,255,0.05)';
        cashBtn.style.borderColor = 'var(--surface-border)';
        cashBtn.style.color = 'var(--text-primary)';

        if (qrContainer) qrContainer.classList.remove('hidden');
        if (state.cashierSelectedTableId) {
            recalcCashierFinalTotal();
        }
    }
};

function updateDynamicVietQr(tableId, amount) {
    const qrImg = document.getElementById('cashierQrImage');
    if (!qrImg) return;

    // An admin-provided QR has priority. When absent, preserve the dynamic
    // VietQR fallback that embeds the exact payable amount and table note.
    if (state.paymentQrSettings?.imageData) {
        qrImg.src = state.paymentQrSettings.imageData;
        const title = document.getElementById('cashierQrTitle');
        const caption = document.getElementById('cashierQrCaption');
        if (title) title.textContent = 'QUÉT MÃ QR ĐỂ THANH TOÁN';
        if (caption) caption.textContent = 'Mã QR do Chủ Quán cập nhật';
        return;
    }

    // VietQR Standard Dynamic URL generator (Bank: MBBank / Quán Nhậu Lá)
    const bankId = 'MB'; // Military Bank
    const accountNo = '0339999888';
    const accountName = 'QUAN NHAU LA';
    const description = encodeURIComponent(`Ban ${tableId.toString().padStart(2, '0')} Quan Nhau La`);
    const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${amount}&addInfo=${description}&accountName=${encodeURIComponent(accountName)}`;

    qrImg.src = qrUrl;
    const title = document.getElementById('cashierQrTitle');
    const caption = document.getElementById('cashierQrCaption');
    if (title) title.textContent = 'QUÉT MÃ VIETQR ĐỂ THANH TOÁN';
    if (caption) caption.textContent = 'Mã động đã kèm đúng số tiền & nội dung bàn';
}

function renderPaymentQrAdmin() {
    const preview = document.getElementById('adminQrPreview');
    if (!preview) return;
    const image = state.paymentQrSettings?.imageData;
    preview.innerHTML = image ? `<img src="${image}" alt="Mã QR thanh toán hiện tại">` : 'Chưa có ảnh QR';
    preview.classList.toggle('qr-preview-empty', !image);
}

window.handleAdminQrUpload = function(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 700 * 1024) {
        event.target.value = '';
        return showToast('Ảnh QR cần nhỏ hơn 700 KB để đồng bộ an toàn.');
    }
    const reader = new FileReader();
    reader.onload = () => {
        state.paymentQrSettings = { ...state.paymentQrSettings, imageData: reader.result, updatedAt: Date.now() };
        renderPaymentQrAdmin();
    };
    reader.readAsDataURL(file);
};

window.savePaymentQrSettings = async function() {
    if (!state.paymentQrSettings?.imageData) return showToast('Chọn ảnh QR trước khi lưu.');
    try {
        await db.collection('settings').doc('payment_qr').set(state.paymentQrSettings);
        showToast('Đã cập nhật mã QR cho quầy thu ngân.');
    } catch (error) {
        showToast('Không lưu được ảnh QR. Kiểm tra kết nối Firebase.');
    }
};

window.clearPaymentQrSettings = async function() {
    if (!confirm('Gỡ ảnh QR hiện tại? Thu ngân sẽ trở lại VietQR động.')) return;
    state.paymentQrSettings = {};
    try {
        await db.collection('settings').doc('payment_qr').set({});
        renderPaymentQrAdmin();
        document.getElementById('adminQrImageInput').value = '';
        showToast('Đã gỡ ảnh QR cố định.');
    } catch (error) {
        showToast('Không gỡ được ảnh QR. Kiểm tra kết nối Firebase.');
    }
};

window.submitCashierPayment = async function() {
    if (!state.cashierSelectedTableId) return alert('Vui lòng chọn bàn cần thanh toán!');
    const table = (state.tables || []).find(t => t.id === state.cashierSelectedTableId);
    if (!table) return alert('Bàn không tồn tại!');

    const orders = table.orders || [];
    if (orders.length === 0) return alert('Bàn này chưa có món nào để thanh toán!');

    const subtotal = orders.reduce((acc, curr) => acc + ((curr.price || 0) * (curr.qty || 0)), 0);
    const discountPercent = parseFloat(document.getElementById('cashierDiscountPercent')?.value) || 0;
    const surcharge = parseFloat(document.getElementById('cashierSurcharge')?.value) || 0;
    const discountAmount = Math.round((subtotal * discountPercent) / 100);
    const finalTotal = Math.max(0, subtotal - discountAmount + surcharge);

    const estimatedCost = Math.round(finalTotal * 0.35); // 35% food cost ratio
    const profit = finalTotal - estimatedCost;

    const methodText = state.cashierPaymentMethod === 'qr' ? 'Chuyển khoản VietQR' : 'Tiền mặt';

    if (!confirm(`Xác nhận thu tiền Bàn ${table.id}?\nPhương thức: ${methodText}\nSố tiền: ${finalTotal.toLocaleString()}đ`)) {
        return;
    }

    const billData = {
        tableId: table.id,
        subtotal: subtotal,
        discountPercent: discountPercent,
        discountAmount: discountAmount,
        surcharge: surcharge,
        totalAmount: finalTotal,
        costAmount: estimatedCost,
        profit: profit,
        paymentMethod: state.cashierPaymentMethod, // 'cash' or 'qr'
        items: orders,
        itemCount: orders.reduce((acc, curr) => acc + curr.qty, 0),
        staffId: table.staffId || 'nv1',
        staffName: table.staffName || 'Phục vụ',
        cashierId: state.currentStaff?.id || 'tn1',
        cashierName: state.currentStaff?.name || 'Thu ngân',
        timestamp: Date.now(),
        dateFormatted: new Date().toLocaleDateString('vi-VN') + ' ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };

    // 1. Save Bill to Firebase
    await db.collection("bills").add(billData);

    // 2. Reset Table
    await db.collection("tables").doc(table.id.toString()).update({
        status: 'empty',
        orders: [],
        staffId: null,
        staffName: null
    });

    showToast(`Đã thu ${finalTotal.toLocaleString()}đ Bàn ${table.id} (${methodText})`);
    resetCashierTerminal();
    updateCashierShiftSummary();

    // 4. Offer Receipt Preview & Print
    showReceipt(billData);
};

window.previewAndPrintCurrentBill = function() {
    if (!state.cashierSelectedTableId) return alert('Vui lòng chọn bàn để xem hóa đơn!');
    const table = (state.tables || []).find(t => t.id === state.cashierSelectedTableId);
    if (!table || !table.orders || table.orders.length === 0) return alert('Bàn chưa có món!');

    const subtotal = table.orders.reduce((acc, curr) => acc + ((curr.price || 0) * (curr.qty || 0)), 0);
    const discountPercent = parseFloat(document.getElementById('cashierDiscountPercent')?.value) || 0;
    const surcharge = parseFloat(document.getElementById('cashierSurcharge')?.value) || 0;
    const discountAmount = Math.round((subtotal * discountPercent) / 100);
    const finalTotal = Math.max(0, subtotal - discountAmount + surcharge);

    const previewBill = {
        tableId: table.id,
        items: table.orders,
        totalAmount: finalTotal,
        staffName: table.staffName || 'Phục vụ',
        dateFormatted: new Date().toLocaleDateString('vi-VN') + ' ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };

    showReceipt(previewBill);
};

function updateCashierShiftSummary() {
    const shiftTotalEl = document.getElementById('cashierShiftTotal');
    const cashTotalEl = document.getElementById('cashierCashTotal');
    const qrTotalEl = document.getElementById('cashierQrTotal');
    const billsCountEl = document.getElementById('cashierPaidBillsCount');

    // Filter today's bills safely
    const now = Date.now();
    const todayBills = (state.bills || []).filter(b => {
        if (!b) return false;
        if (b.timestamp && (now - b.timestamp) < 86400000) return true;
        return false;
    });

    const totalRev = todayBills.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);
    const cashRev = todayBills.filter(b => b.paymentMethod !== 'qr').reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);
    const qrRev = todayBills.filter(b => b.paymentMethod === 'qr').reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);

    if (shiftTotalEl) shiftTotalEl.innerText = totalRev.toLocaleString() + 'đ';
    if (cashTotalEl) cashTotalEl.innerText = cashRev.toLocaleString() + 'đ';
    if (qrTotalEl) qrTotalEl.innerText = qrRev.toLocaleString() + 'đ';
    if (billsCountEl) billsCountEl.innerText = todayBills.length;
}

// Start the app
init();

// Window resize handler for responsive canvas
