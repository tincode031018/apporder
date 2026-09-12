// --- DOM Elements ---
const views = {
    login: document.getElementById('loginView'),
    tableSelection: document.getElementById('tableSelectionView'),
    userMenu: document.getElementById('userMenuView'),
    kitchen: document.getElementById('kitchenView'),
    cashier: document.getElementById('cashierView'),
    admin: document.getElementById('adminDashboardView')
};

const nav = document.getElementById('mainNav');
const tableGrid = document.getElementById('tableGrid');
const menuContainer = document.getElementById('menuContainer');
const cartCount = document.getElementById('cartCount');
const cartOverlay = document.getElementById('cartOverlay');
const cartSheet = document.getElementById('cartSheet');
const cartItemsList = document.getElementById('cartItemsList');
const cartTotalPrice = document.getElementById('cartTotalPrice');

// --- Initialization ---
function init() {
    setupEventListeners();
    syncWithFirebase();
}

function setupEventListeners() {
    // Role selection
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const role = btn.dataset.role;
            state.role = role;

            document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('btn-primary'));
            btn.classList.add('btn-primary');

            // Show only the password panel of the chosen role
            document.getElementById('staffLogin').classList.add('hidden');
            document.getElementById('cashierLogin').classList.add('hidden');
            document.getElementById('kitchenLogin').classList.add('hidden');
            document.getElementById('adminLogin').classList.add('hidden');

            if (role === 'user') {
                document.getElementById('staffLogin').classList.remove('hidden');
            } else if (role === 'cashier') {
                document.getElementById('cashierLogin').classList.remove('hidden');
            } else if (role === 'kitchen') {
                document.getElementById('kitchenLogin').classList.remove('hidden');
            } else {
                document.getElementById('adminLogin').classList.remove('hidden');
            }
        });
    });

    // Staff Login
    document.getElementById('loginStaffBtn').addEventListener('click', () => {
        const code = document.getElementById('staffCode').value;
        const matched = state.staffMembers.find(s => s.role === 'staff' && s.pin === code);
        if (matched) {
            state.currentStaff = matched;
            state.role = 'staff';
            window.switchView('tableSelection');
            renderTableSelection();
            showToast(`Chào mừng ${matched.name}`);
        } else {
            alert('Mã nhân viên không chính xác');
        }
    });

    // Cashier Login
    const cashierLoginBtn = document.getElementById('loginCashierBtn');
    if (cashierLoginBtn) {
        cashierLoginBtn.addEventListener('click', () => {
            const code = document.getElementById('cashierCode').value;
            const matched = state.staffMembers.find(s => s.role === 'cashier' && s.pin === code);
            if (matched) {
                state.currentStaff = matched;
                state.role = 'cashier';
                window.switchView('cashier');
                renderCashierTables();
                updateCashierShiftSummary();
                showToast(`Chào mừng Thu ngân ${matched.name}!`);
            } else {
                alert('Mã Thu ngân không chính xác');
            }
        });
    }

    // Kitchen Login
    const kitchenLoginBtn = document.getElementById('loginKitchenBtn');
    if (kitchenLoginBtn) {
        kitchenLoginBtn.addEventListener('click', () => {
            const code = document.getElementById('kitchenCode').value;
            const matched = state.staffMembers.find(s => s.role === 'kitchen' && s.pin === code);
            if (matched) {
                state.role = 'kitchen';
                state.currentStaff = matched;
                window.switchView('kitchen');
                renderKitchenOrders();
                showToast(`Chào mừng ${matched.name}!`);
            } else {
                alert('Mã Bếp không chính xác');
            }
        });
    }

    // Admin Login
    document.getElementById('loginAdminBtn').addEventListener('click', () => {
        const code = document.getElementById('adminCode').value;
        const matched = state.staffMembers.find(s => s.role === 'admin' && s.pin === code);
        if (matched) {
            state.role = 'admin';
            state.currentStaff = matched;
            window.switchView('admin');
            renderAnalyticsData();
        } else {
            alert('Mã không chính xác');
        }
    });

    // User Start Order
    const startOrderBtn = document.getElementById('startOrderBtn');
    if (startOrderBtn) {
        startOrderBtn.addEventListener('click', () => {
            if (state.currentTableId) {
                const table = state.tables.find(t => t.id === state.currentTableId);
                if (table.status === 'empty') {
                    table.status = 'occupied';
                    saveState();
                }
                state.serviceNote = table.serviceNote || '';
                document.getElementById('userTableTitle').innerText = `B?n ${state.currentTableId.toString().padStart(2, '0')}`;
                window.switchView('userMenu');

            }
        });
    }

    // Logout
    document.getElementById('logoutBtn').setAttribute('onclick', 'handleLogout()');


    // Category Filter
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active', 'btn-primary'));
            btn.classList.add('btn-primary');
            renderMenu(btn.dataset.cat);
        });
    });

    // Cart Controls
    document.getElementById('cartStatus').addEventListener('click', openCart);
    document.getElementById('mobileBillTaskbar').addEventListener('click', openCart);
    document.getElementById('closeCartBtn').addEventListener('click', closeCart);
    document.getElementById('checkoutBtn').addEventListener('click', checkout);
    document.querySelectorAll('.service-note-input').forEach(input => {
        input.addEventListener('input', () => {
            state.serviceNote = input.value;
            document.querySelectorAll('.service-note-input').forEach(other => {
                if (other !== input) other.value = input.value;
            });
        });
    });

    // Table Management
    document.getElementById('addTableBtn').addEventListener('click', addTable);
    document.getElementById('removeTableBtn').addEventListener('click', removeTable);

    // Table Actions
    document.getElementById('tableActionOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'tableActionOverlay') closeTableActions();
    });
    // Admin Tabs
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.setAttribute('onclick', `handleAdminTab(this)`);
    });
    
    renderCategoryFilters();

    // Image Preview listener
    document.getElementById('editItemFile').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const preview = document.getElementById('imagePreview');
                preview.style.display = 'block';
                preview.querySelector('img').src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
}



window.handleActionOrder = () => {
    closeTableActions();
    state.cart = []; // Reset giỏ hàng tạm của lượt chọn mới
    document.getElementById('userTableTitle').innerText = `Bàn ${state.currentTableId.toString().padStart(2, '0')}`;
    switchView('userMenu');
};

window.handleActionBook = async () => {
    if (state.role !== 'admin') {
        return alert('Chỉ Quản trị viên (Admin) mới có quyền đặt bàn trước!');
    }
    const table = state.tables.find(t => t.id === state.currentTableId);
    if (!table) return;
    const newStatus = table.status === 'booked' ? 'empty' : 'booked';
    await db.collection("tables").doc(table.id.toString()).update({ status: newStatus });
    closeTableActions();
    showToast(`Đã ${newStatus === 'booked' ? 'đặt' : 'hủy đặt'} bàn ${table.id}`);
};

window.handleActionCheckout = async () => {
    const table = state.tables.find(t => t.id === state.currentTableId);
    if (!table) return;
    if ((!table.orders || table.orders.length === 0) && table.status !== 'occupied') {
        return showToast('Bàn hiện đang trống');
    }
    const orders = table.orders || [];
    const total = orders.reduce((acc, curr) => acc + ((curr.price || 0) * (curr.qty || 0)), 0);

    // If logged in as staff, notify cashier desk
    if (state.role === 'staff') {
        closeTableActions();
        showToast(`Đã gửi yêu cầu tính tiền Bàn ${table.id} (${total.toLocaleString()}đ) sang quầy Thu ngân!`);
        return;
    }

    const estimatedCost = Math.round(total * 0.35); // 35% food cost ratio
    const profit = total - estimatedCost;

    if (confirm(`Xác nhận thanh toán trực tiếp Bàn ${table.id}?\nTổng cộng: ${total.toLocaleString()}đ`)) {
        const billData = {
            tableId: table.id,
            subtotal: total,
            discountPercent: 0,
            discountAmount: 0,
            surcharge: 0,
            totalAmount: total,
            costAmount: estimatedCost,
            profit: profit,
            paymentMethod: 'cash',
            items: orders,
            itemCount: orders.reduce((acc, curr) => acc + curr.qty, 0),
            staffId: table.staffId || state.currentStaff?.id || 'nv1',
            staffName: table.staffName || state.currentStaff?.name || 'Phục vụ',
            cashierName: state.currentStaff?.name || 'Quản trị viên',
            timestamp: Date.now(),
            dateFormatted: new Date().toLocaleDateString('vi-VN') + ' ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        };

        // 1. Save Bill to Firebase
        await db.collection("bills").add(billData);

        // 2. Increment Staff Revenue
        const staffDocId = table.staffId || state.currentStaff?.id;
        const staffObj = state.staffMembers.find(s => s.id === staffDocId);
        if (staffObj) {
            await db.collection("staff").doc(staffObj.id).update({
                revenue: (staffObj.revenue || 0) + total
            });
        }

        // 3. Reset Table
        await db.collection("tables").doc(table.id.toString()).update({ 
            status: 'empty',
            orders: [],
            staffId: null,
            staffName: null
        });

        closeTableActions();
        showToast(`Đã thanh toán Bàn ${table.id}`);

        // 4. Show Printable Receipt Modal
        showReceipt(billData);
    }
};
window.handleLogout = () => {
    state.role = null;
    state.currentTableId = null;
    state.cashierSelectedTableId = null;
    state.cart = [];
    updateCartUI();
    window.switchView('login');
};

function switchAdminModule(target) {
    console.log('Switching admin tab to:', target);
    // Hide all admin content sections
    ['adminAnalyticsTab', 'adminInventoryTab', 'adminStaffTab', 'adminFloorPlanTab', 'adminMenuMgmtTab', 'adminCatMgmtTab', 'adminPrinterTab', 'adminPaymentQrTab'].forEach(tabId => {
        const el = document.getElementById(tabId);
        if (el) el.classList.add('hidden');
    });

    const moduleSelect = document.getElementById('adminModuleSelect');
    if (moduleSelect) moduleSelect.value = target;
    document.querySelectorAll('.admin-taskbar-item').forEach(button => {
        const active = button.dataset.adminModule === target;
        button.classList.toggle('active', active);
        button.setAttribute('aria-current', active ? 'page' : 'false');
    });

    if (target === 'analytics') {
        document.getElementById('adminAnalyticsTab').classList.remove('hidden');
        renderAnalyticsData();
    } else if (target === 'inventory') {
        document.getElementById('adminInventoryTab').classList.remove('hidden');
        renderInventoryList();
        updateInventoryStats();
    } else if (target === 'staff') {
        document.getElementById('adminStaffTab').classList.remove('hidden');
        renderStaffList();
    } else if (target === 'floorplan') {
        document.getElementById('adminFloorPlanTab').classList.remove('hidden');
        initCanvas();
        updateFloorStats();
    } else if (target === 'menumgmt') {
        document.getElementById('adminMenuMgmtTab').classList.remove('hidden');
        renderAdminMenu();
        updateMenuStats();
    } else if (target === 'catmgmt') {
        document.getElementById('adminCatMgmtTab').classList.remove('hidden');
        renderAdminCats();
        updateCategoryStats();
    } else if (target === 'printer') {
        document.getElementById('adminPrinterTab').classList.remove('hidden');
        const input = document.getElementById('printerAddressInput');
        if (input) input.value = state.printerSettings?.address || '';
        setPrinterBridgeStatus('Chưa kiểm tra bridge', 'neutral');
    } else if (target === 'paymentqr') {
        document.getElementById('adminPaymentQrTab').classList.remove('hidden');
        renderPaymentQrAdmin();
    }
}

// Kept for compatibility with any legacy <button> tab callers
window.handleAdminTab = (tab) => {
    const target = (tab && tab.dataset) ? tab.dataset.tab : tab;
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    if (tab && typeof tab === 'object' && tab.classList) tab.classList.add('active');
    switchAdminModule(target);
};

// Called by the admin module dropdown in the dashboard
window.handleAdminTabSelect = (value) => {
    switchAdminModule(value);
};

document.addEventListener('click', (event) => {
    const button = event.target.closest('.admin-taskbar-item');
    if (!button) return;
    switchAdminModule(button.dataset.adminModule);
});

// --- View Controller ---
function switchView(viewName) {
    console.log('Switching to view:', viewName);
    if (!views[viewName]) {
        console.error('View not found:', viewName);
        return;
    }
    Object.values(views).forEach(v => {
        if (v) v.classList.remove('active');
    });
    views[viewName].classList.add('active');
    
    if (viewName === 'userMenu') {
        renderCategoryFilters();
        renderMenu('all');
        updateCartUI();
    }

    if (viewName === 'kitchen') {
        renderKitchenOrders();
        updateKdsBadge();
    }

    if (viewName === 'cashier') {
        renderCashierTables();
        updateCashierShiftSummary();
    }

    if (viewName === 'admin') {
        renderAnalyticsData();
        updateFloorStats();
        updateMenuStats();
        updateCategoryStats();
    }

    const mainPanel = document.querySelector('.main-panel');
    if (viewName !== 'login') {
        nav.classList.remove('hidden');
        if (mainPanel) mainPanel.classList.remove('login-mode');
        updateNavRoleIndicator();
    } else {
        nav.classList.add('hidden');
        if (mainPanel) mainPanel.classList.add('login-mode');
    }
}

function updateNavRoleIndicator() {
    const iconEl = document.getElementById('navRoleIcon');
    const nameEl = document.getElementById('navStaffName');
    const tagEl = document.getElementById('navRoleTag');
    if (!iconEl || !nameEl || !tagEl) return;

    const staffName = state.currentStaff?.name || 'Nhân viên';
    nameEl.innerText = staffName;

    if (state.role === 'admin') {
        iconEl.innerHTML = '<i class="fa-solid fa-user-shield" style="color: var(--accent);"></i>';
        tagEl.innerText = 'ADMIN';
        tagEl.style.background = 'rgba(99, 102, 241, 0.25)';
        tagEl.style.color = '#818cf8';
    } else if (state.role === 'kitchen') {
        iconEl.innerHTML = '<i class="fa-solid fa-fire-burner" style="color: #f97316;"></i>';
        tagEl.innerText = 'BẾP (KDS)';
        tagEl.style.background = 'rgba(249, 115, 22, 0.25)';
        tagEl.style.color = '#f97316';
    } else if (state.role === 'cashier') {
        iconEl.innerHTML = '<i class="fa-solid fa-cash-register" style="color: #10b981;"></i>';
        tagEl.innerText = 'THU NGÂN';
        tagEl.style.background = 'rgba(16, 185, 129, 0.25)';
        tagEl.style.color = '#34d399';
    } else {
        iconEl.innerHTML = '<i class="fa-solid fa-user-tag" style="color: var(--primary);"></i>';
        tagEl.innerText = 'PHỤC VỤ';
        tagEl.style.background = 'rgba(245, 158, 11, 0.25)';
        tagEl.style.color = '#fbbf24';
    }
}

window.switchView = switchView;


