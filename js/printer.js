function setPrinterBridgeStatus(message, type = 'neutral') {
    const el = document.getElementById('printerBridgeStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `status-pill status-pill-${type}`;
}

function renderPrinterDiscovery(printers = []) {
    const list = document.getElementById('printerDiscoveryList');
    const hint = document.getElementById('printerResultHint');
    if (!list) return;
    if (!printers.length) {
        list.innerHTML = '<div class="empty-state">Không tìm thấy máy in tương thích. Kiểm tra nguồn, cùng mạng LAN và cấu hình bridge.</div>';
        if (hint) hint.textContent = 'Không có thiết bị phản hồi.';
        return;
    }
    if (hint) hint.textContent = `Đã tìm thấy ${printers.length} thiết bị. Chọn để dùng trên máy này.`;
    list.innerHTML = printers.map((printer, index) => {
        const address = printer.ip || printer.address || printer.host || '';
        const title = printer.name || printer.model || 'Máy in nhiệt';
        const details = [address, printer.mac, printer.port].filter(Boolean).join(' · ');
        return `<button class="printer-device" type="button" data-printer-address="${escapeHtml(address)}"><span class="printer-device-icon"><i class="fa-solid fa-print"></i></span><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(details || 'Thiết bị LAN')}</small></span><i class="fa-solid fa-chevron-right"></i></button>`;
    }).join('');
    list.querySelectorAll('[data-printer-address]').forEach(button => button.addEventListener('click', () => {
        const input = document.getElementById('printerAddressInput');
        if (input) input.value = button.dataset.printerAddress;
        window.savePrinterSettings();
    }));
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

window.checkPrinterBridge = async function() {
    setPrinterBridgeStatus('Đang kiểm tra…', 'neutral');
    try {
        const response = await fetch(`${PRINTER_BRIDGE_URL}/health`, { signal: AbortSignal.timeout(3500) });
        if (!response.ok) throw new Error('Bridge returned an error');
        setPrinterBridgeStatus('Bridge sẵn sàng', 'success');
        return true;
    } catch (error) {
        setPrinterBridgeStatus('Bridge chưa chạy', 'danger');
        return false;
    }
};

window.discoverThermalPrinters = async function() {
    if (!(await window.checkPrinterBridge())) {
        showToast('Chưa kết nối được Printer Bridge trên máy này.');
        return;
    }
    const list = document.getElementById('printerDiscoveryList');
    const hint = document.getElementById('printerResultHint');
    if (list) list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Đang gửi UDP Broadcast trong mạng LAN…</div>';
    if (hint) hint.textContent = 'Đang chờ phản hồi từ thiết bị…';
    try {
        const response = await fetch(`${PRINTER_BRIDGE_URL}/discover`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ports: [3000, 9100, 4545], timeoutMs: 3500 }) });
        if (!response.ok) throw new Error('Discovery failed');
        const result = await response.json();
        renderPrinterDiscovery(result.printers || result.devices || []);
    } catch (error) {
        renderPrinterDiscovery([]);
        showToast('Không thể quét máy in. Kiểm tra Printer Bridge và mạng LAN.');
    }
};

window.savePrinterSettings = function() {
    const address = document.getElementById('printerAddressInput')?.value.trim();
    if (!address) return showToast('Nhập hoặc chọn địa chỉ máy in trước.');
    state.printerSettings = { address, paperWidth: 80, savedAt: Date.now() };
    localStorage.setItem(PRINTER_SETTINGS_KEY, JSON.stringify(state.printerSettings));
    showToast('Đã lưu máy in K80 trên máy thu ngân này.');
};

async function sendToThermalPrinter(payload) {
    const address = state.printerSettings?.address;
    if (!address) throw new Error('NO_PRINTER_SELECTED');
    const response = await fetch(`${PRINTER_BRIDGE_URL}/print`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ printer: address, paperWidth: 80, ...payload }) });
    if (!response.ok) throw new Error('PRINT_FAILED');
    return response.json().catch(() => ({}));
}

window.printThermalTest = async function() {
    try {
        await sendToThermalPrinter({ type: 'test', text: 'GastroOrder\nIN THU K80\n\n' });
        showToast('Đã gửi lệnh in thử tới máy in K80.');
    } catch (error) {
        showToast(error.message === 'NO_PRINTER_SELECTED' ? 'Hãy chọn máy in trước.' : 'Không gửi được lệnh in. Kiểm tra bridge và thiết bị.');
    }
};

window.printReceipt = async function() {
    if (!state.printerSettings?.address) return window.print();
    try {
        const receipt = document.getElementById('receiptModal')?.innerText || '';
        await sendToThermalPrinter({ type: 'receipt', text: receipt });
        showToast('Đã gửi hóa đơn tới máy in K80.');
    } catch (error) {
        showToast('Không in được qua K80; đã mở bản in trình duyệt.');
        window.print();
    }
};


// Restore this device's local printer choice after shared state is available.
state.printerSettings = loadPrinterSettings();

