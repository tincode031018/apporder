// --- User: Table Selection ---
function renderTableSelection() {
    console.log('Rendering table selection...');
    tableGrid.innerHTML = '';
    state.tables.forEach(table => {
        const btn = document.createElement('button');
        btn.className = `btn glass-panel ${table.status}`;
        btn.style.padding = '10px 10px';
        btn.style.flexDirection = 'column';
        btn.style.height = '110px';
        btn.style.overflow = 'hidden';
        btn.style.boxSizing = 'border-box';
        btn.innerHTML = `
            <div style="font-weight: 700; font-size: 1.05rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${table.id.toString().padStart(2, '0')}</div>
            <div style="font-size: 0.68rem; font-weight: 600; opacity: 0.8; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${table.status === 'occupied' ? 'CÓ KHÁCH' : (table.status === 'booked' ? 'ĐẶT TRƯỚC' : 'TRỐNG')}</div>
            ${table.status === 'occupied' ? `<div style="font-size: 0.68rem; font-weight: 700; background: var(--danger); color: white; padding: 2px 6px; border-radius: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><i class="fa-solid fa-user" style="font-size: 0.6rem;"></i> Có khách</div>` : ''}
            ${table.status === 'booked' ? `<div style="font-size: 0.68rem; font-weight: 700; background: var(--warning); color: white; padding: 2px 6px; border-radius: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><i class="fa-solid fa-calendar-check" style="font-size: 0.6rem;"></i> Đặt trước</div>` : ''}
            ${table.mergedWith ? `<div style="font-size: 0.68rem; font-weight: 700; background: rgba(99, 102, 241, 0.25); color: #a5b4fc; padding: 2px 6px; border-radius: 6px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><i class="fa-solid fa-link" style="font-size: 0.6rem;"></i> Ghép Bàn ${table.mergedWith.toString().padStart(2, '0')}</div>` : ''}
        `;

        
        if (table.status === 'occupied') {
            btn.style.borderColor = 'var(--danger)';
            btn.style.color = 'var(--danger)';
            btn.style.background = 'rgba(239, 68, 68, 0.05)';
        } else if (table.status === 'booked') {
            btn.style.borderColor = 'var(--warning)';
            btn.style.color = 'var(--warning)';
            btn.style.background = 'rgba(245, 158, 11, 0.05)';
        } else {
            btn.style.borderColor = 'var(--success)';
            btn.style.color = 'var(--success)';
            btn.style.background = 'rgba(16, 185, 129, 0.05)';
        }

        btn.onclick = () => {
            console.log('Table clicked:', table.id, 'Status:', table.status);
            if (table.status === 'empty') {
                // Chuẩn POS: Bàn trống 1-chạm vào thẳng Menu gọi món ngay lập tức
                state.currentTableId = table.id;
                state.cart = [];
                state.serviceNote = table.serviceNote || '';
                document.getElementById('userTableTitle').innerText = `Bàn ${table.id.toString().padStart(2, '0')}`;
                switchView('userMenu');
            } else {
                // Bàn đang có khách hoặc đã đặt trước: Mở bảng quản lý (Xem món, Gọi thêm, Đổi bàn, Ghép bàn)
                window.openTableActions(table.id);
            }
        };
        tableGrid.appendChild(btn);
    });
}

window.openTableActions = function(tableId) {
    state.currentTableId = tableId;
    const table = state.tables.find(t => t.id === tableId);
    if (!table) return;

    console.log('Opening actions for table:', tableId, 'Orders:', table.orders);

    document.getElementById('actionTableTitle').innerText = `Bàn ${table.id.toString().padStart(2, '0')}`;
    
    // Status indicator
    const statusEl = document.getElementById('actionTableStatus');
    statusEl.innerText = table.status === 'empty' ? 'Trống' : (table.status === 'booked' ? 'Đã đặt' : 'Đang dùng');
    statusEl.style.background = table.status === 'empty' ? 'rgba(16, 185, 129, 0.2)' : (table.status === 'booked' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)');
    statusEl.style.color = table.status === 'empty' ? '#34d399' : (table.status === 'booked' ? '#fbbf24' : '#f87171');
    statusEl.style.border = table.status === 'empty' ? '1px solid rgba(16, 185, 129, 0.4)' : (table.status === 'booked' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)');

    // Render current orders
    const detailsEl = document.getElementById('actionOrderDetails');
    const totalEl = document.getElementById('actionTotalAmount');
    const totalInfoEl = document.getElementById('actionTotalInfo');
    
    // Ensure orders array exists
    if (!table.orders) table.orders = [];

    if (table.orders.length === 0) {
        // Bàn trống chưa có món -> Ẩn hoàn toàn khung và tổng cộng thừa thãi
        detailsEl.style.display = 'none';
        detailsEl.innerHTML = '';
        if (totalInfoEl) totalInfoEl.style.display = 'none';
        totalEl.innerText = '0đ';
    } else {
        // Bàn có món -> Hiện danh sách món và tổng tiền theo phong cách Dark theme
        detailsEl.style.display = 'block';
        if (totalInfoEl) totalInfoEl.style.display = 'flex';
        let total = 0;
        const tableKitchenOrders = (state.kitchenOrders || []).filter(k => k.tableId === table.id);

        detailsEl.innerHTML = table.orders.map(item => {
            const itemTotal = (item.price || 0) * (item.qty || 0);
            total += itemTotal;

            // Find kitchen status for this item
            const kItem = tableKitchenOrders.find(k => k.name === item.name);
            let kStatusBadge = '';
            if (kItem) {
                if (kItem.status === 'pending') {
                    kStatusBadge = '<span style="font-size: 0.7rem; padding: 2px 7px; border-radius: 6px; background: rgba(239, 68, 68, 0.2); color: #f87171; margin-left: 6px;">Bếp chờ</span>';
                } else if (kItem.status === 'cooking') {
                    kStatusBadge = '<span style="font-size: 0.7rem; padding: 2px 7px; border-radius: 6px; background: rgba(245, 158, 11, 0.2); color: #fbbf24; margin-left: 6px;">Đang nấu</span>';
                } else if (kItem.status === 'ready') {
                    kStatusBadge = '<span style="font-size: 0.7rem; padding: 2px 7px; border-radius: 6px; background: rgba(16, 185, 129, 0.2); color: #34d399; margin-left: 6px;">Bê ngay!</span>';
                }
            }

            return `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px dashed rgba(255,255,255,0.08); padding-bottom: 6px;">
                    <div>
                        <div style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary);">
                            ${item.name} ${kStatusBadge}
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary);">${item.qty} x ${(item.price || 0).toLocaleString()}đ</div>
                    </div>
                    <div style="font-weight: 700; font-size: 0.95rem; color: #fbbf24;">${itemTotal.toLocaleString()}đ</div>
                </div>
            `;
        }).join('');
        totalEl.innerText = total.toLocaleString() + 'đ';
    }

    // Role-based action button visibility
    const adminReserveBtn = document.getElementById('adminTableReserveBtn');
    if (adminReserveBtn) {
        if (state.role === 'admin') {
            adminReserveBtn.classList.remove('hidden');
        } else {
            adminReserveBtn.classList.add('hidden');
        }
    }

    // Chủ Quán chỉ thao tác quản trị bàn: đặt/hủy đặt, đổi, ghép và hủy ghép.
    // Việc gọi món thuộc luồng phục vụ; khi có món bảng sẽ tự chuyển Có khách.
    const isAdmin = state.role === 'admin';
    const orderButtonGroup = document.getElementById('actionButtonGroup');
    const orderDetailsBlock = document.getElementById('actionOrderDetails');
    const totalBlock = document.getElementById('actionTotalInfo');
    if (orderButtonGroup) orderButtonGroup.classList.toggle('hidden', isAdmin);
    if (isAdmin && orderDetailsBlock) orderDetailsBlock.style.display = 'none';
    if (isAdmin && totalBlock) totalBlock.style.display = 'none';

    const mergeTableBtn = document.getElementById('mergeTableBtn');
    const unmergeTableBtn = document.getElementById('unmergeTableBtn');
    if (mergeTableBtn && unmergeTableBtn) {
        if (table.mergedWith) {
            mergeTableBtn.classList.add('hidden');
            unmergeTableBtn.classList.remove('hidden');
        } else {
            mergeTableBtn.classList.remove('hidden');
            unmergeTableBtn.classList.add('hidden');
        }
        mergeTableBtn.classList.toggle('hidden', !isAdmin || Boolean(table.mergedWith));
        unmergeTableBtn.classList.toggle('hidden', !isAdmin || !table.mergedWith);
    }

    const moveButton = document.querySelector('#tableActionSheet button[onclick="openMoveTableModal()"]');
    if (moveButton) moveButton.classList.toggle('hidden', !isAdmin);

    const overlay = document.getElementById('tableActionOverlay');
    const sheet = document.getElementById('tableActionSheet');
    overlay.classList.remove('hidden');
    setTimeout(() => {
        sheet.style.transform = 'scale(1)';
        sheet.style.opacity = '1';
    }, 10);
};

window.closeTableActions = function() {
    const overlay = document.getElementById('tableActionOverlay');
    const sheet = document.getElementById('tableActionSheet');
    sheet.style.transform = 'scale(0.95)';
    sheet.style.opacity = '0';
    setTimeout(() => overlay.classList.add('hidden'), 250);
};


// --- User: Menu & Cart ---
function renderMenu(category) {
    state.currentMenuCategory = category;
    menuContainer.classList.toggle('menu-list', state.menuView === 'list');
    document.getElementById('menuGridViewBtn')?.classList.toggle('active', state.menuView === 'grid');
    document.getElementById('menuListViewBtn')?.classList.toggle('active', state.menuView === 'list');
    document.getElementById('menuGridViewBtn')?.setAttribute('aria-pressed', String(state.menuView === 'grid'));
    document.getElementById('menuListViewBtn')?.setAttribute('aria-pressed', String(state.menuView === 'list'));
    menuContainer.innerHTML = '';
    const items = category === 'all' ? state.menu : state.menu.filter(m => m.cat === category);
    
    items.forEach(item => {
        const isOut = item.isOutOfStock || item.outOfStock || item.status === 'out' || item.status === 'soldout';
        const card = document.createElement('div');
        card.className = 'menu-card';
        card.innerHTML = `
            ${item.img ? `<img src="${item.img}" alt="${item.name}">` : `<div style="width: 100%; aspect-ratio: 1 / 1; background: #f1f5f9; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 0.8rem;">Chưa có ảnh</div>`}
            <div class="menu-card-content">
                <h4 style="font-size: 0.9rem; margin-bottom: 5px;">${item.name}</h4>
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span class="price">${(item.price || 0).toLocaleString()}đ</span>
                    ${isOut ? '<span style="font-size: 0.7rem; font-weight: 700; color: var(--danger);">HẾT MÓN</span>' : `<button class="btn btn-primary" onclick="addToCart('${item.id}')" style="padding: 5px 10px; border-radius: 8px;"><i class="fa-solid fa-plus"></i></button>`}
                </div>
            </div>
        `;
        menuContainer.appendChild(card);
    });
}

window.setMenuView = function(view) {
    state.menuView = view === 'list' ? 'list' : 'grid';
    localStorage.setItem('gastroorder_menu_view', state.menuView);
    renderMenu(state.currentMenuCategory || 'all');
};

// Keep the view selector reliable even when the menu is re-rendered or an
// embedded browser does not resolve inline handlers against window.
document.addEventListener('click', (event) => {
    const button = event.target.closest('#menuGridViewBtn, #menuListViewBtn');
    if (!button) return;

    event.preventDefault();
    window.setMenuView(button.id === 'menuListViewBtn' ? 'list' : 'grid');
});

window.addToCart = (id) => {
    const item = state.menu.find(m => String(m.id) === String(id));
    if (!item) {
        console.error("Item not found for id:", id);
        return;
    }
    const inCart = state.cart.find(c => String(c.id) === String(id));
    if (inCart) {
        inCart.qty++;
    } else {
        state.cart.push({ ...item, qty: 1 });
    }
    updateCartUI();
    showToast(`Đã thêm ${item.name}`);
};

function updateCartUI() {
    const currentTable = state.tables.find(t => t.id === state.currentTableId);
    const existingOrders = currentTable ? (currentTable.orders || []) : [];
    const newItemsCount = state.cart.reduce((acc, curr) => acc + (curr.qty || 0), 0);
    const existingItemsCount = existingOrders.reduce((acc, curr) => acc + (curr.qty || 0), 0);
    const totalItemsCount = existingItemsCount + newItemsCount;

    if (cartCount) cartCount.innerText = totalItemsCount;

    const desktopCartBadge = document.getElementById('desktopCartBadge');
    if (desktopCartBadge) {
        desktopCartBadge.innerText = `${totalItemsCount} món`;
        desktopCartBadge.style.background = totalItemsCount > 0 ? 'var(--primary-glow)' : 'rgba(255,255,255,0.08)';
        desktopCartBadge.style.color = totalItemsCount > 0 ? 'var(--primary)' : 'var(--text-secondary)';
    }

    const desktopCartList = document.getElementById('desktopCartList');
    const desktopCartTotal = document.getElementById('desktopCartTotal');

    cartItemsList.innerHTML = '';
    let existingSubtotal = existingOrders.reduce((acc, curr) => acc + ((curr.price || 0) * (curr.qty || 0)), 0);
    let newSubtotal = state.cart.reduce((acc, curr) => acc + ((curr.price || 0) * (curr.qty || 0)), 0);
    let grandTotal = existingSubtotal + newSubtotal;

    let desktopHtml = '';

    // 1. Render Existing Orders (Món đang phục vụ của bàn)
    if (existingOrders.length > 0) {
        const tableKitchenOrders = (state.kitchenOrders || []).filter(k => k.tableId === (currentTable?.id || 0));

        desktopHtml += `
            <div style="margin-bottom: 16px; background: rgba(0,0,0,0.03); border-radius: 12px; padding: 12px; border: 1px solid rgba(16, 185, 129, 0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 0.8rem; font-weight: 700; color: #10b981;">
                    <span><i class="fa-solid fa-check-double"></i> Món đang phục vụ (${existingItemsCount})</span>
                    <span>${existingSubtotal.toLocaleString()}đ</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
        `;

        existingOrders.forEach(item => {
            const itemTotal = (item.price || 0) * (item.qty || 0);
            const kItem = tableKitchenOrders.find(k => k.name === item.name);
            let kBadge = '';
            if (kItem) {
                if (kItem.status === 'pending') {
                    kBadge = '<span style="font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; background: rgba(239, 68, 68, 0.2); color: #f87171;">Bếp chờ</span>';
                } else if (kItem.status === 'cooking') {
                    kBadge = '<span style="font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; background: rgba(245, 158, 11, 0.2); color: #fbbf24;">Đang nấu</span>';
                } else if (kItem.status === 'ready') {
                    kBadge = '<span style="font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; background: rgba(16, 185, 129, 0.2); color: #34d399;">Đã xong</span>';
                }
            }

            desktopHtml += `
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.84rem; padding-bottom: 6px; border-bottom: 1px dashed rgba(0,0,0,0.06);">
                    <div>
                        <span style="font-weight: 600; color: var(--text-primary);">${item.name}</span>
                        <span style="color: #f59e0b; font-weight: 700; margin-left: 4px;">x${item.qty}</span>
                        ${kBadge}
                    </div>
                    <span style="color: var(--text-secondary); font-size: 0.8rem;">${itemTotal.toLocaleString()}đ</span>
                </div>
            `;
        });

        desktopHtml += `
                </div>
            </div>
        `;
    }

    // 2. Render Newly Selected Items (Món mới chọn thêm vào giỏ)
    if (state.cart.length > 0) {
        desktopHtml += `
            <div style="margin-bottom: 10px;">
                <div style="font-size: 0.8rem; font-weight: 700; color: #fbbf24; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <span><i class="fa-solid fa-plus-circle"></i> Món mới chọn thêm (${newItemsCount})</span>
                    <span>${newSubtotal.toLocaleString()}đ</span>
                </div>
        `;

        state.cart.forEach(item => {
            const itemTotal = (item.price || 0) * (item.qty || 1);

            // Mobile cart item HTML
            const div = document.createElement('div');
            div.style = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;';
            div.innerHTML = `
                <div>
                    <div style="font-weight: 500;">${item.name}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">${(item.price || 0).toLocaleString()}đ</div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <button onclick="changeQty('${item.id}', -1)" class="btn glass-panel" style="padding: 5px 10px;">-</button>
                    <span>${item.qty}</span>
                    <button onclick="changeQty('${item.id}', 1)" class="btn glass-panel" style="padding: 5px 10px;">+</button>
                </div>
            `;
            cartItemsList.appendChild(div);

            // Desktop sidebar cart item HTML
            desktopHtml += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding: 8px 10px; background: rgba(0,0,0,0.03); border-radius: 8px; border: 1px solid var(--surface-glass-border);">
                    <div style="flex: 1; padding-right: 8px;">
                        <div style="font-weight: 600; font-size: 0.88rem; color: var(--text-primary);">${item.name}</div>
                        <div style="font-size: 0.78rem; color: #f59e0b;">${(item.price || 0).toLocaleString()}đ</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <button onclick="changeQty('${item.id}', -1)" class="btn" style="padding: 2px 7px; font-size: 0.75rem; border-radius: 6px; background: rgba(0,0,0,0.04);">-</button>
                        <span style="font-weight: 700; font-size: 0.85rem; min-width: 18px; text-align: center; color: var(--text-primary);">${item.qty}</span>
                        <button onclick="changeQty('${item.id}', 1)" class="btn" style="padding: 2px 7px; font-size: 0.75rem; border-radius: 6px; background: rgba(0,0,0,0.04);">+</button>
                    </div>
                </div>
            `;
        });

        desktopHtml += `</div>`;
    }

    // 3. Empty state if table has no orders and cart is empty
    if (existingOrders.length === 0 && state.cart.length === 0) {
        desktopHtml = `
            <div style="text-align: center; color: var(--text-secondary); padding: 40px 10px; font-size: 0.9rem;">
                <i class="fa-solid fa-basket-shopping" style="font-size: 2.2rem; opacity: 0.3; margin-bottom: 10px; display: block;"></i>
                Chưa chọn món nào
            </div>
        `;
    }

    if (desktopCartList) desktopCartList.innerHTML = desktopHtml;
    if (cartItemsList) cartItemsList.innerHTML = desktopHtml;
    if (desktopCartTotal) desktopCartTotal.innerText = grandTotal.toLocaleString() + 'đ';
    if (cartTotalPrice) cartTotalPrice.innerText = grandTotal.toLocaleString() + 'đ';

    const mobileBillCount = document.getElementById('mobileBillCount');
    const mobileBillItems = document.getElementById('mobileBillItems');
    const mobileBillTotal = document.getElementById('mobileBillTotal');
    if (mobileBillCount) mobileBillCount.innerText = totalItemsCount;
    if (mobileBillItems) mobileBillItems.innerText = totalItemsCount ? `${totalItemsCount} mÃ³n trong bill` : 'ChÆ°a cÃ³ mÃ³n';
    if (mobileBillTotal) mobileBillTotal.innerText = grandTotal.toLocaleString() + 'Ä‘';

    // Update Checkout Button State
    const checkoutBtn = document.querySelector('.desktop-cart-panel button[onclick="checkout()"]');
    if (checkoutBtn) {
        if (state.cart.length > 0) {
            checkoutBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Xác nhận`;
            checkoutBtn.style.opacity = '1';
            checkoutBtn.style.pointerEvents = 'auto';
        } else if (existingOrders.length > 0) {
            checkoutBtn.innerHTML = `<i class="fa-solid fa-check"></i> Đang phục vụ (${existingItemsCount} món)`;
            checkoutBtn.style.opacity = '0.7';
            checkoutBtn.style.pointerEvents = 'none';
        } else {
            checkoutBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Xác nhận`;
            checkoutBtn.style.opacity = '0.5';
            checkoutBtn.style.pointerEvents = 'none';
        }
    }
}

window.changeQty = (id, delta) => {
    const item = state.cart.find(c => String(c.id) === String(id));
    if (item) {
        item.qty += delta;
        if (item.qty <= 0) {
            state.cart = state.cart.filter(c => String(c.id) !== String(id));
        }
    }
    updateCartUI();
};

function openCart() {
    const currentTable = state.tables.find(t => t.id === state.currentTableId);
    if (!state.serviceNote && currentTable?.serviceNote) state.serviceNote = currentTable.serviceNote;
    document.querySelectorAll('.service-note-input').forEach(input => { input.value = state.serviceNote || ''; });
    cartOverlay.classList.remove('hidden');
    setTimeout(() => cartSheet.style.transform = 'translateY(0)', 10);
}

function closeCart() {
    cartSheet.style.transform = 'translateY(100%)';
    setTimeout(() => cartOverlay.classList.add('hidden'), 300);
}

window.checkout = async function() {
    if (state.cart.length === 0) return alert('Giỏ hàng trống!');
    
    const table = state.tables.find(t => t.id === state.currentTableId);
    if (!table) return alert('Không xác định được bàn.');
    
    const updatedOrders = [...(table.orders || [])];
    const newItemsToKitchen = [];
    const timestamp = Date.now();
    const serviceNote = (state.serviceNote || '').trim();

    state.cart.forEach(cartItem => {
        const existing = updatedOrders.find(o => o.id === cartItem.id);
        if (existing) {
            existing.qty += cartItem.qty;
        } else {
            updatedOrders.push({ 
                id: cartItem.id, 
                name: cartItem.name, 
                price: cartItem.price, 
                qty: cartItem.qty 
            });
        }

        // Prepare Kitchen Order Dispatch
        newItemsToKitchen.push({
            tableId: table.id,
            itemId: cartItem.id,
            name: cartItem.name,
            qty: cartItem.qty,
            status: 'pending', // pending -> cooking -> ready
            timestamp: timestamp,
            staffName: state.currentStaff?.name || 'Phục vụ',
            note: serviceNote,
            createdAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        });
    });

    // 1. Update Table Status & Orders (Tự động truyền sang Thu ngân & Sơ đồ bàn thời gian thực)
    await db.collection("tables").doc(table.id.toString()).update({
        orders: updatedOrders,
        status: 'occupied',
        staffId: state.currentStaff?.id || 'nv1',
        staffName: state.currentStaff?.name || 'Phục vụ',
        serviceNote
    });

    // 2. Dispatch Each Item into Kitchen Queue (Truyền đến màn hình Bếp KDS)
    for (const kOrder of newItemsToKitchen) {
        await db.collection("kitchen_orders").add(kOrder);
    }
    
    state.cart = [];
    state.serviceNote = '';
    updateCartUI();
    closeCart();
    showToast(`Đã xác nhận & chuyển ${newItemsToKitchen.length} món đến Bếp & Thu ngân!`);
    
    setTimeout(() => {
        window.switchView('tableSelection');
    }, 120);
};



// Helper to dynamically position tables horizontally across canvas width
// Responsive: on small/mobile widths it shrinks the table circles and adjusts
// spacing so the whole floor plan always fits inside the canvas (no clipping).
function getTablePositions(canvasWidth) {
    // Use viewport width rather than the scrollable canvas width: once a
    // mobile plan grows horizontally, its canvas itself can be much wider.
    const isMobile = window.innerWidth < 600;
    const tableRadius = isMobile ? 24 : 34;
    const paddingX = isMobile ? 18 : 48;
    const startY = isMobile ? 50 : 80;
    const filter = state.floorPlanFilter || 'all';
    const visibleTables = filter === 'all'
        ? state.tables
        : state.tables.filter(table => table.status === filter);

    // Each table gets its own column. The container scrolls sideways instead
    // of creating new rows as more tables are added.
    const cols = Math.max(1, visibleTables.length);
    const usableXs = canvasWidth - paddingX * 2 - tableRadius * 2;
    const spacingX = cols > 1 ? Math.max(usableXs / (cols - 1), tableRadius + 8) : 0;
    const leftMargin = paddingX + tableRadius;
    const positioned = visibleTables.map((table, i) => {
        return {
            ...table,
            computedX: leftMargin + i * spacingX,
            computedY: startY
        };
    });

    const mergeOffset = isMobile ? 60 : 90;
    positioned.forEach(table => {
        if (table.mergedWith) {
            const partner = positioned.find(p => p.id === table.mergedWith);
            if (partner) {
                const direction = table.id > partner.id ? 1 : -1;
                let newX = partner.computedX + direction * mergeOffset;
                if (newX + tableRadius > canvasWidth - paddingX) newX = partner.computedX - mergeOffset;
                if (newX - tableRadius < paddingX) newX = partner.computedX + mergeOffset;
                table.computedX = newX;
                table.computedY = partner.computedY;
            }
        }
    });

    const totalRows = 1;
    const requiredHeight = startY + tableRadius + 56;
    return { positioned, cols, totalRows, tableRadius, requiredHeight };
}

