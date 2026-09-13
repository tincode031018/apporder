// --- Admin: Canvas Floor Plan ---
let ctx;
state.floorPlanFilter = state.floorPlanFilter || 'all';

window.setFloorPlanFilter = function(filter) {
    state.floorPlanFilter = filter;
    document.querySelectorAll('[data-floor-filter]').forEach(button => {
        button.classList.toggle('active', button.dataset.floorFilter === filter);
    });
    resizeCanvas();
    drawFloorPlan();
};
function initCanvas() {
    const canvas = document.getElementById('floorPlanCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    
    resizeCanvas();
    drawFloorPlan();
    
    canvas.onclick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const { positioned, tableRadius } = getTablePositions(rect.width);
        
        positioned.forEach(table => {
            const dx = mouseX - table.computedX;
            const dy = mouseY - table.computedY;
            // Check if click is inside circle
            if (Math.sqrt(dx * dx + dy * dy) <= tableRadius) {
                // "Có khách" is set only after an order is confirmed.
                if (table.status === 'occupied') {
                    showToast('Bàn đang có khách; trạng thái được cập nhật theo món đã gọi.');
                    return;
                }
                const newStatus = table.status === 'booked' ? 'empty' : 'booked';
                
                db.collection("tables").doc(table.id.toString()).update({ status: newStatus });
                table.status = newStatus;
                drawFloorPlan();
                updateStats();
            }
        });
    };

    if (!window.floorPlanResizeBound) {
        window.floorPlanResizeBound = true;
        window.addEventListener('resize', () => {
            const activeTab = document.getElementById('adminFloorPlanTab');
            if (activeTab && !activeTab.classList.contains('hidden')) {
                resizeCanvas();
                drawFloorPlan();
            }
        });
    }
}

function drawFloorPlan() {
    if (!ctx) return;
    const canvas = document.getElementById('floorPlanCanvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    const { positioned, tableRadius } = getTablePositions(rect.width);

    if (positioned.length === 0) {
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary');
        ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Không có bàn thuộc trạng thái này', rect.width / 2, rect.height / 2);
        return;
    }
    
    // Draw merge connector lines first
    const drawnMerges = new Set();
    positioned.forEach(table => {
        if (table.mergedWith && table.id < table.mergedWith) {
            const partner = positioned.find(p => p.id === table.mergedWith);
            if (partner) {
                ctx.beginPath();
                ctx.moveTo(table.computedX, table.computedY);
                ctx.lineTo(partner.computedX, partner.computedY);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.lineWidth = 3;
                ctx.setLineDash([8, 4]);
                ctx.stroke();
                ctx.setLineDash([]);
                drawnMerges.add(`${Math.min(table.id, partner.id)}-${Math.max(table.id, partner.id)}`);
            }
        }
    });
    
    positioned.forEach(table => {
        const tx = table.computedX;
        const ty = table.computedY;

        // Draw shadow
        ctx.beginPath();
        ctx.arc(tx, ty + 6, tableRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fill();

        // Draw Table Circle
        ctx.beginPath();
        ctx.arc(tx, ty, tableRadius, 0, Math.PI * 2);
        
        let color = '#10b981'; // empty
        if (table.status === 'occupied') color = '#ef4444';
        if (table.status === 'booked') color = '#f59e0b';
        
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 3.5;
        ctx.stroke();
        
        // Draw ID
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 17px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(table.id, tx, ty);
        
        // Draw a readable Vietnamese status below each table on the light plan.
        const statusLabel = table.status === 'occupied'
            ? 'Có khách'
            : (table.status === 'booked' ? 'Đặt trước' : 'Trống');
        ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = table.status === 'occupied'
            ? '#b91c1c'
            : (table.status === 'booked' ? '#b45309' : '#047857');
        ctx.fillText(statusLabel, tx, ty + tableRadius + 18);
    });
}

function updateStats() {
    updateFloorStats();
}

function updateFloorStats() {
    const empty = state.tables.filter(t => t.status === 'empty').length;
    const booked = state.tables.filter(t => t.status === 'booked').length;
    const occupied = state.tables.filter(t => t.status === 'occupied').length;
    const total = state.tables.length;
    
    const totalEl = document.getElementById('floorStatTotal');
    const emptyEl = document.getElementById('floorStatEmpty');
    const bookedEl = document.getElementById('floorStatBooked');
    const occupiedEl = document.getElementById('floorStatOccupied');
    if (totalEl) totalEl.innerText = total;
    if (emptyEl) emptyEl.innerText = empty;
    if (bookedEl) bookedEl.innerText = booked;
    if (occupiedEl) occupiedEl.innerText = occupied;
}

function updateMenuStats() {
    const total = state.menu.length;
    const soldOut = state.menu.filter(item => item.isOutOfStock || item.outOfStock || item.status === 'out' || item.status === 'soldout').length;
    const special = state.menu.filter(item => getMenuItemSalesCount(item) > 20).length;
    
    const totalEl = document.getElementById('menuStatTotal');
    const soldOutEl = document.getElementById('menuStatSoldOut');
    const specialEl = document.getElementById('menuStatSpecial');
    if (totalEl) totalEl.innerText = total;
    if (soldOutEl) soldOutEl.innerText = soldOut;
    if (specialEl) specialEl.innerText = special;
}

function updateCategoryStats() {
    const totalEl = document.getElementById('catStatTotal');
    if (totalEl) totalEl.innerText = state.categories.length;
}

// --- Admin: Table Management ---
window.addTable = async () => {
    const newId = state.tables.length > 0 ? Math.max(...state.tables.map(t => t.id)) + 1 : 1;
    const newTable = {
        id: newId,
        status: 'empty',
        orders: []
    };
    await db.collection("tables").doc(newId.toString()).set(newTable);
    showToast(`Đã thêm Bàn ${newId}`);
    resizeCanvas();
    drawFloorPlan();
}

window.removeTable = async () => {
    if (state.tables.length === 0) return;
    const lastTable = state.tables[state.tables.length - 1];
    await db.collection("tables").doc(lastTable.id.toString()).delete();
    showToast(`Đã xóa Bàn ${lastTable.id}`);
    resizeCanvas();
    drawFloorPlan();
}

function resizeCanvas() {
    const canvas = document.getElementById('floorPlanCanvas');
    if (!canvas) return;
    
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    const filter = state.floorPlanFilter || 'all';
    const visibleCount = filter === 'all'
        ? state.tables.length
        : state.tables.filter(table => table.status === filter).length;
    const isMobile = rect.width < 600;
    const tableRadius = isMobile ? 24 : 34;
    const paddingX = isMobile ? 18 : 48;
    const columnPitch = isMobile ? 96 : 150;
    const layoutWidth = isMobile
        ? rect.width
        : Math.max(rect.width, paddingX * 2 + tableRadius * 2 + Math.max(0, visibleCount - 1) * columnPitch);
    const { requiredHeight } = getTablePositions(layoutWidth || 800);
    const neededHeight = Math.max(isMobile ? 155 : 250, requiredHeight);
    
    container.style.height = neededHeight + 'px';
    container.style.aspectRatio = 'auto';
    container.style.overflowX = isMobile ? 'hidden' : 'auto';
    container.style.overflowY = 'hidden';
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = layoutWidth * dpr;
    canvas.height = neededHeight * dpr;
    canvas.style.width = layoutWidth + 'px';
    canvas.style.height = neededHeight + 'px';
    
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
}


// --- Admin: Menu Management ---
function getMenuItemSalesCount(item) {
    return (state.bills || []).reduce((total, bill) => total + (bill.items || []).reduce((sum, orderedItem) => {
        const isSameItem = String(orderedItem.id || '') === String(item.id)
            || (!orderedItem.id && orderedItem.name === item.name);
        return sum + (isSameItem ? (Number(orderedItem.qty) || 0) : 0);
    }, 0), 0);
}

function renderAdminMenu() {
    const list = document.getElementById('adminMenuList');
    list.innerHTML = '';
    state.menu.forEach(item => {
        const salesCount = getMenuItemSalesCount(item);
        const isBestSeller = salesCount > 20;
        const isOut = !!(item.isOutOfStock || item.outOfStock || item.status === 'out' || item.status === 'soldout');
        const row = document.createElement('div');
        row.className = 'glass-panel menu-admin-card';
        row.style.display = 'flex';
        row.style.gap = '10px';
        row.style.padding = '12px';
        row.style.alignItems = 'center';
        row.innerHTML = `
            <img src="${item.img}" style="width: 50px; height: 50px; border-radius: 10px; object-fit: cover;">
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 600;">${item.name}</div>
                <div style="font-size: 0.8rem; opacity: 0.7; margin-top: 2px;">${item.price.toLocaleString()}đ • ${item.cat}</div>
                <div class="menu-admin-actions">
                    <span class="menu-status-dot ${isOut ? 'is-out' : 'is-available'}" title="${isOut ? 'Đang hết món' : 'Đang phục vụ'}"><i class="fa-solid ${isOut ? 'fa-ban' : 'fa-check'}"></i></span>
                    ${isBestSeller ? `<span class="menu-status-dot is-best-seller" title="Bán chạy: ${salesCount} lượt"><i class="fa-solid fa-crown"></i></span>` : ''}
                    <button class="menu-icon-button is-out-toggle ${isOut ? 'active' : ''}" onclick="toggleMenuFlag('${item.id}', 'isOutOfStock')" title="${isOut ? 'Mở bán lại' : 'Đánh dấu hết món'}" aria-label="${isOut ? 'Mở bán lại' : 'Đánh dấu hết món'}">
                        <i class="fa-solid fa-ban"></i>
                    </button>
                    <button class="menu-icon-button" onclick="editMenuItem('${item.id}')" title="Sửa món" aria-label="Sửa món">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                </div>
            </div>
            <button class="menu-icon-button is-delete" onclick="deleteMenuItem('${item.id}')" title="Xóa món" aria-label="Xóa món">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        list.appendChild(row);
    });
    updateMenuStats();
}

// Helper: Tối ưu và nén ảnh lưu trực tiếp vào Firestore (Miễn phí 100% không cần nâng cấp Blaze Storage)
function compressImage(file, maxDimension = 480, quality = 0.78) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > height && width > maxDimension) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                } else if (height > maxDimension) {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => resolve(null);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}

let editingMenuItemId = null;

function formatPriceInput(input) {
    const digits = String(input.value || '').replace(/\D/g, '');
    input.value = digits ? Number(digits).toLocaleString('vi-VN') : '';
}

window.formatMenuItemPrice = function(input) { formatPriceInput(input); };

function setupMenuItemImageInput() {
    const fileInput = document.getElementById('editItemFile');
    const previewContainer = document.getElementById('imagePreview');
    const previewImg = previewContainer.querySelector('img');
    fileInput.onchange = async () => {
        if (!fileInput.files?.[0]) return;
        const compressed = await compressImage(fileInput.files[0]);
        if (compressed && previewImg) {
            previewImg.src = compressed;
            previewContainer.style.display = 'block';
        }
    };
}

window.addMenuItem = function() {
    // Populate Categories select
    const select = document.getElementById('editItemCat');
    select.innerHTML = (state.categories || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    editingMenuItemId = null;
    document.getElementById('menuItemModalTitle').innerText = 'Thêm món mới';
    // Clear previous values
    document.getElementById('editItemName').value = '';
    document.getElementById('editItemPrice').value = '';
    const fileInput = document.getElementById('editItemFile');
    fileInput.value = '';
    const previewContainer = document.getElementById('imagePreview');
    const previewImg = previewContainer.querySelector('img');
    previewContainer.style.display = 'none';

    previewImg.src = '';
    setupMenuItemImageInput();
    
    document.getElementById('menuItemModal').classList.remove('hidden');
};

window.editMenuItem = function(id) {
    const item = state.menu.find(menuItem => String(menuItem.id) === String(id));
    if (!item) return;
    editingMenuItemId = item.id;
    const select = document.getElementById('editItemCat');
    select.innerHTML = (state.categories || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    select.value = item.cat || '';
    document.getElementById('menuItemModalTitle').innerText = 'Sửa thông tin món';
    document.getElementById('editItemName').value = item.name || '';
    document.getElementById('editItemPrice').value = Number(item.price || 0).toLocaleString('vi-VN');
    const fileInput = document.getElementById('editItemFile');
    fileInput.value = '';
    const previewContainer = document.getElementById('imagePreview');
    const previewImg = previewContainer.querySelector('img');
    previewImg.src = item.img || '';
    previewContainer.style.display = item.img ? 'block' : 'none';
    setupMenuItemImageInput();
    document.getElementById('menuItemModal').classList.remove('hidden');
};

window.closeMenuModal = () => {
    document.getElementById('menuItemModal').classList.add('hidden');
};

window.saveMenuItem = async () => {
    const name = document.getElementById('editItemName').value.trim();
    const price = parseInt(document.getElementById('editItemPrice').value.replace(/\D/g, ''), 10);
    const cat = document.getElementById('editItemCat').value;
    const fileInput = document.getElementById('editItemFile');
    
    if (!name || isNaN(price)) {
        return alert('Vui lòng nhập đầy đủ tên và giá món');
    }
    
    const existingItem = state.menu.find(item => String(item.id) === String(editingMenuItemId));
    let imgUrl = existingItem?.img || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=60';
    if (fileInput.files && fileInput.files[0]) {
        showToast('Đang tối ưu ảnh món...');
        const compressed = await compressImage(fileInput.files[0]);
        if (compressed) {
            imgUrl = compressed;
        }
    } else {
        const previewImg = document.querySelector('#imagePreview img');
        if (previewImg && previewImg.src && previewImg.src.startsWith('data:image')) {
            imgUrl = previewImg.src;
        }
    }

    const id = editingMenuItemId || Date.now().toString();
    const newItem = {
        id,
        name,
        price,
        cat,
        img: imgUrl
    };

    try {
        await db.collection("menu").doc(id.toString()).set(newItem, { merge: true });
        closeMenuModal();
        showToast(editingMenuItemId ? 'Đã cập nhật món' : 'Đã thêm món mới thành công!');
    } catch (error) {
        console.error("Lỗi lưu Firestore:", error);
        alert('Lỗi lưu vào Firestore: ' + error.message);
    }
};



window.deleteMenuItem = async (id) => {
    if (confirm('Xóa món này?')) {
        await db.collection("menu").doc(id.toString()).delete();
        showToast('Đã xóa món');
        updateMenuStats();
    }
};

window.toggleMenuFlag = async (id, field) => {
    const item = state.menu.find(m => m.id.toString() === id.toString());
    if (!item) return;
    const patch = {};
    if (field === 'isOutOfStock') {
        const isOut = !!(item.isOutOfStock || item.outOfStock || item.status === 'out' || item.status === 'soldout');
        patch.isOutOfStock = !isOut;
        patch.outOfStock = false;
        patch.status = isOut ? 'available' : 'out';
    } else {
        patch[field] = !item[field];
    }
    await db.collection("menu").doc(id.toString()).update(patch);
    showToast(patch.isOutOfStock ? 'Đã đánh dấu hết món' : 'Món đã được mở bán lại');
    updateMenuStats();
};

// --- Admin: Category Management ---
// --- Admin: Category Management ---
function renderAdminCats() {
    const list = document.getElementById('adminCatList');
    list.innerHTML = '';
    state.categories.forEach(cat => {
        // Dishes belonging to this category
        const items = state.menu.filter(m => String(m.cat).toLowerCase() === String(cat.id).toLowerCase());
        const listEl = document.createElement('div');
        listEl.className = 'glass-panel';
        listEl.style.padding = '15px';

        let dishesHtml;
        if (items.length === 0) {
            dishesHtml = '<div style="font-size: 0.78rem; color: var(--text-secondary);">Không món trong danh mục này</div>';
        } else {
            const chips = items.map(m => {
                const img = m.img
                    ? `<img src="${m.img}" style="width: 22px; height: 22px; border-radius: 5px; object-fit: cover; flex-shrink: 0;">`
                    : '';
                return `<span style="display:inline-flex; align-items:center; gap:5px; background: rgba(255,255,255,0.06); border:1px solid var(--surface-glass-border); border-radius:9px; padding:3px 9px; font-size:0.75rem; white-space:nowrap;">${img}${m.name} <b style="color:var(--primary); font-size:0.72rem;">${(m.price || 0).toLocaleString()}đ</b></span>`;
            }).join('');
            dishesHtml = `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;">${chips}</div>`;
        }

        listEl.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 6px;">
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 600;">${cat.name}</div>
                    <div style="font-size: 0.78rem; opacity: 0.7;">ID: ${cat.id} • ${items.length} món</div>
                </div>
                <button class="btn" onclick="editCategory('${cat.id}')" title="Đổi tên" style="color: var(--primary); border: none; background: none; padding: 5px;">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn" onclick="deleteCategory('${cat.id}')" title="Xóa" style="color: var(--danger); border: none; background: none; padding: 5px;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            ${dishesHtml}
        `;
        list.appendChild(listEl);
    });
}


window.categoryModalMode = 'add';
window.categoryModalId = null;

window.openCategoryModal = (mode, category = null) => {
    window.categoryModalMode = mode;
    window.categoryModalId = category ? category.id : null;
    const modal = document.getElementById('categoryModal');
    const title = document.getElementById('categoryModalTitle');
    const input = document.getElementById('categoryNameInput');
    title.innerText = mode === 'edit' ? 'Đổi tên danh mục' : 'Thêm danh mục';
    input.value = category ? category.name : '';
    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 50);
};

window.closeCategoryModal = () => {
    document.getElementById('categoryModal').classList.add('hidden');
};

window.saveCategoryModal = async () => {
    const input = document.getElementById('categoryNameInput');
    const name = input.value.trim();
    if (!name) return alert('Vui lòng nhập tên danh mục');

    const id = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');

    if (window.categoryModalMode === 'add') {
        if (state.categories.find(c => c.id === id)) {
            return alert('Danh mục này đã tồn tại');
        }
        await db.collection("categories").doc(id).set({ id, name });
        showToast('Đã thêm danh mục mới');
    } else {
        const current = state.categories.find(c => c.id === window.categoryModalId);
        if (!current) return;
        if (id !== window.categoryModalId && state.categories.find(c => c.id === id)) {
            return alert('Tên này đã có danh mục khác dùng rồi');
        }
        await db.collection("categories").doc(window.categoryModalId).update({ name });
        if (id !== window.categoryModalId) {
            await db.collection("categories").doc(window.categoryModalId).delete();
            await db.collection("categories").doc(id).set({ id, name });
        }
        showToast('Đã đổi tên danh mục');
    }

    closeCategoryModal();
};

window.addCategory = () => openCategoryModal('add');

window.editCategory = (id) => {
    const cat = state.categories.find(c => c.id === id);
    if (!cat) return;
    openCategoryModal('edit', cat);
};

window.deleteCategory = async (id) => {
    if (confirm('Xóa danh mục này sẽ ảnh hưởng đến các món đang thuộc danh mục này. Xác nhận xóa?')) {
        await db.collection("categories").doc(id).delete();
        showToast('Đã xóa danh mục');
    }
};

function renderCategoryFilters() {
    const container = document.getElementById('categoryFilterContainer');
    if (!container) return;
    container.innerHTML = `<span class="btn glass-panel cat-btn active" data-cat="all">Tất cả</span>`;
    
    state.categories.forEach(cat => {
        const btn = document.createElement('span');
        btn.className = 'btn glass-panel cat-btn';
        btn.dataset.cat = cat.id;
        btn.innerText = cat.name;
        container.appendChild(btn);
    });

    // Re-attach listeners because we replaced the elements
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderMenu(btn.dataset.cat);
        });
    });
}

// --- Table Actions: Move Table & Merge Table ---
window.openMoveTableModal = function() {
    if (state.role !== 'admin') return alert('Chỉ Chủ Quán có quyền đổi bàn.');
    const currentId = state.currentTableId;
    const select = document.getElementById('targetMoveTableSelect');
    select.innerHTML = '';
    
    // Target tables should be empty tables
    const emptyTables = state.tables.filter(t => t.id !== currentId && t.status === 'empty');
    if (emptyTables.length === 0) {
        return alert('Không có bàn trống nào để chuyển đến!');
    }
    
    emptyTables.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.innerText = `Bàn ${t.id.toString().padStart(2, '0')} (Đang trống)`;
        select.appendChild(opt);
    });

    document.getElementById('moveTableDesc').innerText = `Chuyển toàn bộ món từ Bàn ${currentId.toString().padStart(2, '0')} sang bàn khác`;
    document.getElementById('moveTableModal').classList.remove('hidden');
};

window.closeMoveTableModal = function() {
    document.getElementById('moveTableModal').classList.add('hidden');
};

window.confirmMoveTable = async function() {
    if (state.role !== 'admin') return alert('Chỉ Chủ Quán có quyền đổi bàn.');
    const currentTable = state.tables.find(t => t.id === state.currentTableId);
    const targetId = parseInt(document.getElementById('targetMoveTableSelect').value);
    const targetTable = state.tables.find(t => t.id === targetId);

    if (!currentTable || !targetTable) return;

    // Move orders and status to target table
    await db.collection("tables").doc(targetId.toString()).update({
        orders: currentTable.orders || [],
        status: currentTable.status || 'occupied',
        staffId: currentTable.staffId || state.currentStaff?.id || 'nv1',
        staffName: currentTable.staffName || state.currentStaff?.name || 'Phục vụ'
    });

    // Reset current table
    await db.collection("tables").doc(currentTable.id.toString()).update({
        orders: [],
        status: 'empty',
        staffId: null,
        staffName: null
    });

    closeMoveTableModal();
    closeTableActions();
    showToast(`Đã chuyển từ Bàn ${currentTable.id} sang Bàn ${targetTable.id}`);
};

window.openMergeTableModal = function() {
    if (state.role !== 'admin') return alert('Chỉ Chủ Quán có quyền ghép bàn.');
    const currentId = state.currentTableId;
    const select = document.getElementById('sourceMergeTableSelect');
    select.innerHTML = '';

    const otherTables = state.tables.filter(t => t.id !== currentId);
    if (otherTables.length === 0) {
        return alert('Không có bàn nào khác để ghép!');
    }

    otherTables.forEach(t => {
        const total = (t.orders || []).reduce((acc, curr) => acc + (curr.price * curr.qty), 0);
        const statusText = t.status === 'occupied' ? 'Có khách' : (t.status === 'booked' ? 'Đặt trước' : 'Trống');
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.innerText = `Bàn ${t.id.toString().padStart(2, '0')} - ${statusText}`;
        select.appendChild(opt);
    });

    document.getElementById('mergeTableDesc').innerText = `Ghép Bàn ${state.currentTableId.toString().padStart(2, '0')} với bàn khác (hiển thị sát nhau trên sơ đồ)`;
    document.getElementById('mergeTableModal').classList.remove('hidden');
};

window.closeMergeTableModal = function() {
    document.getElementById('mergeTableModal').classList.add('hidden');
};

window.confirmMergeTable = async function() {
    if (state.role !== 'admin') return alert('Chỉ Chủ Quán có quyền ghép bàn.');
    const currentTable = state.tables.find(t => t.id === state.currentTableId);
    const sourceId = parseInt(document.getElementById('sourceMergeTableSelect').value);
    const sourceTable = state.tables.find(t => t.id === sourceId);

    if (!currentTable || !sourceTable) return;
    if (currentTable.mergedWith === sourceId) {
        return showToast('Hai bàn này đã được ghép với nhau rồi');
    }

    await db.collection("tables").doc(currentTable.id.toString()).update({
        mergedWith: sourceId
    });
    await db.collection("tables").doc(sourceTable.id.toString()).update({
        mergedWith: currentTable.id
    });
    currentTable.mergedWith = sourceId;
    sourceTable.mergedWith = currentTable.id;

    closeMergeTableModal();
    showToast(`Đã ghép Bàn ${currentTable.id} với Bàn ${sourceTable.id}`);
    renderTableSelection();
    resizeCanvas();
    drawFloorPlan();
};

window.unmergeTable = async function() {
    if (state.role !== 'admin') return alert('Chỉ Chủ Quán có quyền hủy ghép bàn.');
    const currentTable = state.tables.find(t => t.id === state.currentTableId);
    if (!currentTable || !currentTable.mergedWith) return;

    const partnerId = currentTable.mergedWith;
    currentTable.mergedWith = null;
    await db.collection("tables").doc(currentTable.id.toString()).update({
        mergedWith: null
    });
    const partner = state.tables.find(t => t.id === partnerId);
    if (partner) {
        partner.mergedWith = null;
        await db.collection("tables").doc(partner.id.toString()).update({
            mergedWith: null
        });
    }

    closeTableActions();
    showToast(`Đã tách Bàn ${currentTable.id} và Bàn ${partnerId}`);
    renderTableSelection();
    resizeCanvas();
    drawFloorPlan();
};

// --- Kitchen Display System (KDS) Logic ---
let currentKdsFilter = 'all';

window.filterKds = function(filter, btn) {
    currentKdsFilter = filter;
    const container = btn.parentElement;
    container.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderKitchenOrders();
};

function updateKdsBadge() {
    const badge = document.getElementById('kdsPendingBadge');
    if (!badge) return;
    const pendingTables = new Set(state.kitchenOrders
        .filter(o => o.status === 'pending')
        .map(o => o.tableId)).size;
    badge.innerHTML = `<i class="fa-solid fa-bell"></i> ${pendingTables} bàn chờ`;
}

function renderKitchenOrders() {
    const board = document.getElementById('kdsBoard');
    if (!board) return;
    board.dataset.kdsFilter = currentKdsFilter === 'all' ? 'summary' : currentKdsFilter;
    document.querySelector('#kitchenView .collection-view-toggle').style.visibility = currentKdsFilter === 'all' ? 'hidden' : 'visible';
    if (currentKdsFilter === 'all') {

    // Kitchen permission is an overview-only screen: show table counts by
    // stage, without exposing individual orders or table bills.
    ['pending', 'cooking', 'ready'].forEach(status => {
        const colBody = document.getElementById('col-' + status);
        const colCount = document.getElementById('count-' + status);
        const colEl = colBody ? colBody.closest('.kds-column') : null;
        if (!colBody || !colEl) return;

        const tableCount = new Set(state.kitchenOrders
            .filter(order => order.status === status)
            .map(order => order.tableId)).size;
        const label = status === 'pending'
            ? 'Bàn chờ nấu'
            : (status === 'cooking' ? 'Bàn đang nấu' : 'Bàn đã xong');
        colEl.style.display = '';
        if (colCount) colCount.textContent = String(tableCount);
        colBody.innerHTML = `<div class="kds-summary-card"><strong>${tableCount}</strong><span>${label}</span></div>`;
    });
    return;
    }

    // Board column status keys, in display order
    const columnKeys = ['pending', 'cooking', 'ready'];

    // If filtering shows no orders at all, still render empty columns so the
    // board structure stays visible.
    columnKeys.forEach(status => {
        const colBody = document.getElementById('col-' + status);
        const colCount = document.getElementById('count-' + status);
        const colEl = colBody ? colBody.closest('.kds-column') : null;
        if (!colBody || !colEl) return;

        // Filter: when a specific status is selected, hide the other columns
        colEl.style.display = (currentKdsFilter === 'all' || currentKdsFilter === status) ? '' : 'none';

        colBody.innerHTML = '';
        const orders = state.kitchenOrders.filter(item => item.status === status);
        if (colCount) colCount.textContent = String(orders.length);

        if (orders.length === 0) {
            colBody.innerHTML = `
                <div class="kds-empty">
                    <i class="fa-solid fa-circle-check"></i>
                    Không có món
                </div>
            `;
            return;
        }

        orders.forEach(order => colBody.appendChild(buildKdsCard(order)));
    });
}

function buildKdsCard(order) {
    let statusText = 'Chờ chế biến';
    let statusColor = '#f87171';
    let statusBg = 'rgba(239, 68, 68, 0.15)';
    let border = '1px solid rgba(239, 68, 68, 0.4)';
    let nextActionBtn = `<button onclick="updateKdsOrderStatus('${order.id}', 'cooking')" class="btn btn-primary" style="width: 100%;"><i class="fa-solid fa-fire"></i> Nhận làm món</button>`;

    if (order.status === 'cooking') {
        statusText = 'Đang nấu';
        statusColor = '#fbbf24';
        statusBg = 'rgba(245, 158, 11, 0.15)';
        border = '1px solid rgba(245, 158, 11, 0.4)';
        nextActionBtn = `<button onclick="updateKdsOrderStatus('${order.id}', 'ready')" class="btn" style="width: 100%; background: #10b981; color: white; border: none;"><i class="fa-solid fa-bell-concierge"></i> Hoàn thành món</button>`;
    } else if (order.status === 'ready') {
        statusText = 'Đã xong - Chờ bê';
        statusColor = '#34d399';
        statusBg = 'rgba(16, 185, 129, 0.15)';
        border = '1px solid rgba(16, 185, 129, 0.4)';
        nextActionBtn = `<button onclick="deleteKdsOrder('${order.id}')" class="btn" style="width: 100%; border-color: rgba(255,255,255,0.2);"><i class="fa-solid fa-check"></i> Đã phục vụ khách</button>`;
    }

    const card = document.createElement('div');
    card.className = 'glass-panel kds-card';
    card.style.border = border;
    card.innerHTML = `
        <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                <span style="font-weight: 800; font-size: 1.2rem; color: var(--text-primary);">Bàn ${order.tableId.toString().padStart(2, '0')}</span>
                <span style="padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 700; background: ${statusBg}; color: ${statusColor};">${statusText}</span>
            </div>
            <div style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">
                ${order.name} <span style="color: #f59e0b; font-size: 1.3rem;">x${order.qty}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 16px;">
                <span><i class="fa-regular fa-clock"></i> ${order.createdAt || 'Mới gọi'}</span>
                <span>NV: ${order.staffName || 'Phục vụ'}</span>
            </div>
        </div>
        <div>
            ${nextActionBtn}
        </div>
    `;
    return card;
}

window.updateKdsOrderStatus = async function(orderId, newStatus) {
    await db.collection("kitchen_orders").doc(orderId).update({ status: newStatus });
    if (newStatus === 'ready') {
        showToast('Món đã nấu xong! Thông báo đã gửi tới phục vụ');
    }
};

window.deleteKdsOrder = async function(orderId) {
    await db.collection("kitchen_orders").doc(orderId).delete();
    showToast('Đã chuyển món cho khách');
};

// --- Module 1: Báo cáo & Phân tích Kinh doanh CFood ---
window.toggleAccordion = function(headerBtn) {
    const body = headerBtn.nextElementSibling;
    const isOpen = body.classList.contains('open');
    const accordion = headerBtn.closest('.dashboard-accordion');
    if (!isOpen) {
        accordion.querySelectorAll('.accordion-body').forEach(b => b.classList.remove('open'));
        accordion.querySelectorAll('.accordion-header').forEach(h => h.setAttribute('aria-expanded', 'false'));
    }
    body.classList.toggle('open', !isOpen);
    headerBtn.setAttribute('aria-expanded', String(!isOpen));
};
// Convert the 6 analytics accordion sections into a dropdown menu.
let dashboardTabsReady = false;
function initDashboardTabs() {
    if (dashboardTabsReady) return;
    const accordion = document.querySelector('#adminAnalyticsTab .dashboard-accordion');
    if (!accordion) return;

    const cards = Array.from(accordion.querySelectorAll(':scope > .accordion-card'));
    if (cards.length === 0) return;
    dashboardTabsReady = true;

    // Dropdown to choose which report section is shown
    const bar = document.createElement('div');
    bar.className = 'dashboard-tabbar';

    const label = document.createElement('span');
    label.className = 'dashboard-tab-label';
    label.textContent = 'Báo cáo:';

    const select = document.createElement('select');
    select.className = 'dashboard-tab-select';
    select.setAttribute('aria-label', 'Chọn mục báo cáo');
    select.addEventListener('change', () => switchDashboardTab(select.value));

    bar.appendChild(label);
    bar.appendChild(select);

    const stack = document.createElement('div');
    stack.className = 'dashboard-tabpanels';

    cards.forEach((card, index) => {
        const header = card.querySelector(':scope > .accordion-header');
        const body = card.querySelector(':scope > .accordion-body');

        if (header) {
            const title = header.querySelector('.accordion-title');
            const opt = document.createElement('option');
            opt.value = 'dash-panel-' + index;
            opt.textContent = title ? title.textContent.trim() : ('Mục ' + (index + 1));
            select.appendChild(opt);
        }

        if (body) {
            body.classList.toggle('open', index === 0);
            body.id = 'dash-panel-' + index;
            stack.appendChild(body);
        }
    });

    select.value = 'dash-panel-0';

    accordion.innerHTML = '';
    accordion.appendChild(bar);
    accordion.appendChild(stack);
}

window.switchDashboardTab = function(panelId) {
    const accordion = document.querySelector('#adminAnalyticsTab .dashboard-accordion');
    if (!accordion) return;
    accordion.querySelectorAll('.accordion-body').forEach(b => b.classList.remove('open'));
    const panel = accordion.querySelector('#' + panelId);
    if (panel) {
        panel.classList.add('open');
        // Re-render the chart if the chart panel is opened (its canvas is hidden otherwise)
        if (panel.querySelector('#revenueChartCanvas')) {
            renderRevenueChart();
        }
    }
};

function renderAnalyticsData() {
    initDashboardTabs();
    const bills = state.bills || [];
    const totalRevenue = bills.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);
    const totalCost = bills.reduce((acc, curr) => acc + (curr.costAmount || Math.round((curr.totalAmount || 0) * 0.35)), 0);
    const grossProfit = totalRevenue - totalCost;
    const grossMarginPercent = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 65;

    const staffMembers = state.staffMembers || [];
    const staffCount = staffMembers.length;
    const totalPayroll = staffMembers.reduce((acc, curr) => acc + (curr.salary || 0), 0);

    const fixedSettings = state.fixedCostSettings || {};
    const fixedTotal = fixedSettings.total !== undefined ? fixedSettings.total : ((fixedSettings.rent || 0) + (fixedSettings.utilities || 0) + (fixedSettings.depreciation || 0));

    const netProfit = grossProfit - totalPayroll - fixedTotal;
    const netMarginPercent = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0';

    const totalBillsCount = bills.length;
    const avgBill = totalBillsCount > 0 ? Math.round(totalRevenue / totalBillsCount) : 0;

    const revenueMetric = document.getElementById('accRevenueMetric');
    if (revenueMetric) revenueMetric.innerText = totalRevenue.toLocaleString() + 'đ';

    const totalRevenueEl = document.getElementById('accTotalRevenue');
    if (totalRevenueEl) totalRevenueEl.innerText = totalRevenue.toLocaleString() + 'đ';

    const avgBillEl = document.getElementById('accAvgBill');
    if (avgBillEl) avgBillEl.innerText = avgBill.toLocaleString() + 'đ';

    const totalBillsEl = document.getElementById('accTotalBills');
    if (totalBillsEl) totalBillsEl.innerText = totalBillsCount;

    const costMetric = document.getElementById('accCostMetric');
    if (costMetric) costMetric.innerText = '-' + (totalCost + totalPayroll + fixedTotal).toLocaleString() + 'đ';

    const cogsEl = document.getElementById('accCogs');
    if (cogsEl) cogsEl.innerText = '-' + totalCost.toLocaleString() + 'đ';

    const payrollEl = document.getElementById('accPayroll');
    if (payrollEl) payrollEl.innerText = '-' + totalPayroll.toLocaleString() + 'đ';

    const fixedCostEl = document.getElementById('accFixedCost');
    if (fixedCostEl) fixedCostEl.innerText = '-' + fixedTotal.toLocaleString() + 'đ';

    const totalCostEl = document.getElementById('accTotalCost');
    if (totalCostEl) totalCostEl.innerText = '-' + (totalCost + totalPayroll + fixedTotal).toLocaleString() + 'đ';

    const profitMetric = document.getElementById('accProfitMetric');
    if (profitMetric) {
        profitMetric.innerText = (netProfit >= 0 ? '+' : '-') + Math.abs(netProfit).toLocaleString() + 'đ';
        profitMetric.style.color = netProfit >= 0 ? '#34d399' : '#f87171';
    }

    const grossProfitEl = document.getElementById('accGrossProfit');
    if (grossProfitEl) grossProfitEl.innerText = grossProfit.toLocaleString() + 'đ';

    const grossMarginEl = document.getElementById('accGrossMargin');
    if (grossMarginEl) grossMarginEl.innerText = grossMarginPercent + '%';

    const netProfitEl = document.getElementById('accNetProfit');
    if (netProfitEl) {
        netProfitEl.innerText = (netProfit >= 0 ? '+' : '-') + Math.abs(netProfit).toLocaleString() + 'đ';
        netProfitEl.style.color = netProfit >= 0 ? '#34d399' : '#f87171';
    }

    const netMarginEl = document.getElementById('accNetMargin');
    if (netMarginEl) {
        netMarginEl.innerText = netMarginPercent + '%';
        netMarginEl.style.color = netProfit >= 0 ? '#6ee7b7' : '#fca5a5';
    }

    const billsMetric = document.getElementById('accBillsMetric');
    if (billsMetric) billsMetric.innerText = totalBillsCount + ' hóa đơn';

    const topMetric = document.getElementById('accTopMetric');
    if (topMetric) topMetric.innerText = '5 món';

    renderTopSellingItems();
    renderRecentBills();
    renderRevenueChart();
}

function renderTopSellingItems() {
    const list = document.getElementById('accTopItemsList');
    if (!list) return;
    list.innerHTML = '';

    const countMap = {};
    (state.bills || []).forEach(bill => {
        (bill.items || []).forEach(item => {
            countMap[item.name] = (countMap[item.name] || 0) + (item.qty || 1);
        });
    });

    const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (sorted.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 15px; font-size: 0.85rem;">Chưa có dữ liệu món bán</div>`;
        return;
    }

    const maxCount = sorted[0][1] || 1;
    sorted.forEach(([name, count], index) => {
        const percent = Math.round((count / maxCount) * 100);
        const itemRow = document.createElement('div');
        itemRow.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; font-weight: 600; margin-bottom: 4px;">
                <span><strong style="color: #fbbf24; margin-right: 6px;">#${index + 1}</strong> ${name}</span>
                <span style="color: var(--text-primary);">${count} phần</span>
            </div>
            <div style="height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
                <div style="width: ${percent}%; height: 100%; background: var(--primary-gradient); border-radius: 3px;"></div>
            </div>
        `;
        list.appendChild(itemRow);
    });
}

function renderRecentBills() {
    const list = document.getElementById('accRecentBillsList');
    if (!list) return;
    list.innerHTML = '';

    const bills = (state.bills || []).slice(0, 8);
    if (bills.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 20px; font-size: 0.85rem;">Chưa có hóa đơn nào được lưu</div>`;
        return;
    }

    bills.forEach(b => {
        const div = document.createElement('div');
        div.style = 'display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: rgba(0,0,0,0.03); border-radius: 10px; border: 1px solid var(--surface-glass-border);';
        div.innerHTML = `
            <div>
                <div style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem;">Bàn ${b.tableId ? b.tableId.toString().padStart(2, '0') : '--'} • ${b.itemCount || (b.items || []).length} món</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">${b.dateFormatted || new Date(b.timestamp).toLocaleString('vi-VN')} • NV: ${b.staffName || 'Phục vụ'}</div>
            </div>
            <div style="text-align: right;">
                <div style="font-weight: 800; color: #f59e0b; font-size: 0.95rem;">${(b.totalAmount || 0).toLocaleString()}đ</div>
                <button onclick='showReceipt(${JSON.stringify(b)})' class="btn" style="padding: 3px 10px; font-size: 0.75rem; border-radius: 6px; margin-top: 4px;"><i class="fa-solid fa-receipt"></i> Xem bill</button>
            </div>
        `;
        list.appendChild(div);
    });
}

window.revenueChartPeriod = 'day';

function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1)/7);
    return weekNo;
}

window.setChartPeriod = function(period) {
    window.revenueChartPeriod = period;
    document.querySelectorAll('.chart-period-btn').forEach(btn => {
        const isActive = btn.dataset.period === period;
        btn.classList.toggle('active', isActive);
        btn.style.background = isActive ? 'rgba(56, 189, 248, 0.18)' : 'transparent';
        btn.style.color = isActive ? '#38bdf8' : 'var(--text-secondary)';
    });
    renderRevenueChart();
};

function getChartBuckets() {
    const bills = (state.bills || []).filter(b => b.timestamp && b.totalAmount !== undefined);
    const now = new Date();
    const useDepreciation = document.getElementById('chartDepreciationToggle')?.checked === true;
    const fixedSettings = state.fixedCostSettings || {};

    const period = window.revenueChartPeriod || 'day';
    const buckets = [];
    const previousBuckets = [];
    let labels = [];
    let count = 0;
    let stepMs = 0;
    let formatLabel = () => '';

    if (period === 'day') {
        count = 7;
        stepMs = 24 * 60 * 60 * 1000;
        formatLabel = (d) => `${d.getDate()}/${d.getMonth() + 1}`;
        for (let i = count - 1; i >= 0; i--) {
            const start = new Date(now.getTime() - i * stepMs);
            start.setHours(0, 0, 0, 0);
            const end = new Date(start.getTime() + stepMs);
            labels.push(formatLabel(start));
            buckets.push({ start, end, total: 0 });
            const prevStart = new Date(start.getTime() - count * stepMs);
            const prevEnd = new Date(end.getTime() - count * stepMs);
            previousBuckets.push({ start: prevStart, end: prevEnd, total: 0 });
        }
    } else if (period === 'week') {
        count = 4;
        stepMs = 7 * 24 * 60 * 60 * 1000;
        formatLabel = (d) => `Tuần ${getWeekNumber(d)}`;
        for (let i = count - 1; i >= 0; i--) {
            const end = new Date(now.getTime() - i * stepMs);
            end.setHours(0, 0, 0, 0);
            const start = new Date(end.getTime() - stepMs);
            labels.push(formatLabel(start));
            buckets.push({ start, end, total: 0 });
            const prevEnd = new Date(end.getTime() - count * stepMs);
            const prevStart = new Date(start.getTime() - count * stepMs);
            previousBuckets.push({ start: prevStart, end: prevEnd, total: 0 });
        }
    } else if (period === 'month') {
        count = 6;
        formatLabel = (d) => `Tháng ${d.getMonth() + 1}`;
        for (let i = count - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const start = d;
            const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
            labels.push(formatLabel(d));
            buckets.push({ start, end, total: 0 });
            const prev = new Date(d.getFullYear(), d.getMonth() - count, 1);
            previousBuckets.push({ start: prev, end: new Date(prev.getFullYear(), prev.getMonth() + 1, 1), total: 0 });
        }
    } else {
        count = 4;
        formatLabel = (d) => `Q${Math.floor(d.getMonth() / 3) + 1}`;
        for (let i = count - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
            const start = d;
            const end = new Date(d.getFullYear(), d.getMonth() + 3, 1);
            labels.push(formatLabel(d));
            buckets.push({ start, end, total: 0 });
            const prev = new Date(d.getFullYear(), d.getMonth() - count * 3, 1);
            previousBuckets.push({ start: prev, end: new Date(prev.getFullYear(), prev.getMonth() + 3, 1), total: 0 });
        }
    }

    bills.forEach(bill => {
        const t = bill.timestamp instanceof Date ? bill.timestamp : new Date(bill.timestamp);
        const amount = bill.totalAmount || 0;
        let adjusted = amount;
        if (useDepreciation) {
            const monthlyFixed = fixedSettings.total || ((fixedSettings.rent || 0) + (fixedSettings.utilities || 0) + (fixedSettings.depreciation || 0));
            const daysInMonth = 30;
            const dailyFixed = monthlyFixed / daysInMonth;
            const duration = 1;
            adjusted = Math.max(0, amount - dailyFixed * duration);
        }
        for (const bucket of buckets) {
            if (t >= bucket.start && t < bucket.end) {
                bucket.total += adjusted;
                break;
            }
        }
        if (document.getElementById('chartCompareToggle')?.checked) {
            for (const bucket of previousBuckets) {
                if (t >= bucket.start && t < bucket.end) {
                    bucket.total += adjusted;
                    break;
                }
            }
        }
    });

    return { labels, buckets, previousBuckets };
}

function drawRoundedRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
    } else {
        const tl = typeof r === 'number' ? r : r[0];
        const tr = typeof r === 'number' ? r : r[1];
        const br = typeof r === 'number' ? r : r[2];
        const bl = typeof r === 'number' ? r : r[3];
        ctx.beginPath();
        ctx.moveTo(x + tl, y);
        ctx.lineTo(x + w - tr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
        ctx.lineTo(x + w, y + h - br);
        ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
        ctx.lineTo(x + bl, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
        ctx.lineTo(x, y + tl);
        ctx.quadraticCurveTo(x, y, x + tl, y);
        ctx.closePath();
    }
}

function drawRevenueChart() {
    const canvas = document.getElementById('revenueChartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const { labels, buckets, previousBuckets } = getChartBuckets();
    const compare = document.getElementById('chartCompareToggle')?.checked === true;

    const padding = { top: 20, right: 16, bottom: 36, left: 52 };
    const chartW = rect.width - padding.left - padding.right;
    const chartH = rect.height - padding.top - padding.bottom;

    const allValues = buckets.map(b => b.total);
    if (compare) allValues.push(...previousBuckets.map(b => b.total));
    const maxValue = Math.max(...allValues, 1);
    const yMax = Math.ceil(maxValue / 10000) * 10000 || 10000;

    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font = '11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
        const y = padding.top + (chartH / ySteps) * i;
        const value = yMax - (yMax / ySteps) * i;
        ctx.fillText((value / 1000).toFixed(0) + 'k', padding.left - 8, y);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartW, y);
        ctx.stroke();
    }

    const barGroupWidth = chartW / labels.length;
    const barWidth = Math.max(6, Math.min(32, barGroupWidth * 0.28));
    const gap = 4;

    buckets.forEach((bucket, i) => {
        const x = padding.left + barGroupWidth * i + barGroupWidth / 2;
        const h = (bucket.total / yMax) * chartH;
        const y = padding.top + chartH - h;
        ctx.fillStyle = '#38bdf8';
        drawRoundedRect(ctx, x - barWidth - gap / 2, y, barWidth, h, [4, 4, 0, 0]);
        ctx.fill();

        if (compare) {
            const prevH = (previousBuckets[i].total / yMax) * chartH;
            const prevY = padding.top + chartH - prevH;
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            drawRoundedRect(ctx, x + gap / 2, prevY, barWidth, prevH, [4, 4, 0, 0]);
            ctx.fill();
        }

        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(labels[i], x, padding.top + chartH + 8);
    });

    const legend = document.getElementById('chartLegend');
    if (legend) {
        legend.innerHTML = `
            <span class="legend-item"><span class="legend-dot" style="background:#38bdf8;"></span> Kỳ hiện tại</span>
            ${compare ? '<span class="legend-item"><span class="legend-dot" style="background:rgba(255,255,255,0.35);"></span> Kỳ trước</span>' : ''}
        `;
    }

    const metric = document.getElementById('accChartMetric');
    if (metric) {
        const currentTotal = buckets.reduce((a, b) => a + b.total, 0);
        metric.innerText = currentTotal.toLocaleString() + 'đ';
    }
}

window.renderRevenueChart = function() {
    drawRevenueChart();
};

window.refreshAnalytics = function() {
    renderAnalyticsData();
    renderRevenueChart();
    showToast('Đã cập nhật dữ liệu kinh doanh mới nhất!');
};

window.exportReportData = function() {
    const csvContent = "data:text/csv;charset=utf-8,ID,Ban,TongTien,LoiNhuan,ThoiGian\n" 
        + (state.bills || []).map(b => `${b.id || ''},Ban ${b.tableId},${b.totalAmount},${b.profit},${b.dateFormatted || ''}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `BaoCao_CFood_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Đã xuất báo cáo CSV thành công!');
};

// --- Module 2: Quản lý Tồn kho & Xuất/Nhập ---
function updateInventoryStats() {
    const totalEl = document.getElementById('invTotalItems');
    const lowStockEl = document.getElementById('invLowStock');
    const valueEl = document.getElementById('invStockValue');

    const inv = state.inventory || [];
    const lowStockCount = inv.filter(i => (i.qty || 0) <= (i.minStock || 5)).length;
    const totalVal = inv.reduce((acc, curr) => acc + ((curr.qty || 0) * (curr.cost || 0)), 0);

    if (totalEl) totalEl.innerText = inv.length;
    if (lowStockEl) lowStockEl.innerText = lowStockCount;
    if (valueEl) valueEl.innerText = totalVal.toLocaleString() + 'đ';
}

function renderInventoryListLegacy() {
    const list = document.getElementById('inventoryList');
    if (!list) return;
    list.innerHTML = '';

    (state.inventory || []).forEach(item => {
        const isLow = (item.qty || 0) <= (item.minStock || 5);
        const card = document.createElement('div');
        card.className = 'glass-panel';
        card.style.border = isLow ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--surface-glass-border)';
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                <div>
                    <div style="font-weight: 700; font-size: 1.05rem; color: var(--text-primary);">${item.name}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">Giá vốn: ${(item.cost || 0).toLocaleString()}đ / ${item.unit}</div>
                </div>
                ${isLow ? '<span style="font-size: 0.75rem; font-weight: 700; color: #ef4444; background: rgba(239,68,68,0.15); padding: 3px 8px; border-radius: 8px;">SẮP HẾT</span>' : '<span style="font-size: 0.75rem; font-weight: 700; color: #10b981; background: rgba(16,185,129,0.15); padding: 3px 8px; border-radius: 8px;">ĐỦ KHO</span>'}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; border-top: 1px dashed var(--surface-glass-border); padding-top: 10px;">
                <div>
                    <span style="font-size: 1.25rem; font-weight: 800; color: #fbbf24;">${item.qty}</span>
                    <span style="font-size: 0.85rem; color: var(--text-secondary);">${item.unit}</span>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button onclick="adjustInventoryQty('${item.id}', 5)" class="btn" style="padding: 4px 10px; font-size: 0.75rem;" title="Nhập thêm 5">+5</button>
                    <button onclick="adjustInventoryQty('${item.id}', -1)" class="btn" style="padding: 4px 10px; font-size: 0.75rem;" title="Xuất dùng 1">-1</button>
                    <button onclick="deleteInventoryItem('${item.id}')" class="btn" style="color: var(--danger); padding: 4px 10px; font-size: 0.75rem;"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

window.adjustInventoryQty = async function(id, delta) {
    const item = state.inventory.find(i => i.id === id);
    if (!item) return;
    const newQty = Math.max(0, (item.qty || 0) + delta);
    await db.collection("inventory").doc(id).update({ qty: newQty });
    showToast(`Đã cập nhật tồn kho: ${item.name} (${newQty} ${item.unit})`);
};

window.openInventoryModal = function() {
    document.getElementById('invItemName').value = '';
    document.getElementById('invItemQty').value = '';
    document.getElementById('invItemUnit').value = 'kg';
    document.getElementById('invItemCost').value = '';
    document.getElementById('invItemMin').value = '5';
    document.getElementById('inventoryModal').classList.remove('hidden');
};

window.closeInventoryModal = function() {
    document.getElementById('inventoryModal').classList.add('hidden');
};

window.saveInventoryItem = async function() {
    const name = document.getElementById('invItemName').value.trim();
    const qty = parseFloat(document.getElementById('invItemQty').value) || 0;
    const unit = document.getElementById('invItemUnit').value.trim() || 'kg';
    const cost = parseFloat(document.getElementById('invItemCost').value) || 0;
    const minStock = parseFloat(document.getElementById('invItemMin').value) || 5;

    if (!name) return alert('Vui lòng nhập tên nguyên liệu');

    const id = 'nl_' + Date.now();
    await db.collection("inventory").doc(id).set({ id, name, qty, unit, cost, minStock });
    closeInventoryModal();
    showToast(`Đã thêm nguyên liệu: ${name}`);
};

window.deleteInventoryItem = async function(id) {
    if (confirm('Xác nhận xóa nguyên liệu này khỏi kho?')) {
        await db.collection("inventory").doc(id).delete();
        showToast('Đã xóa nguyên liệu');
    }
};

// --- Module 3: Quản lý Nhân sự & Phân quyền ---
function renderStaffListLegacy() {
    const container = document.getElementById('staffListContainer');
    if (!container) return;
    container.innerHTML = '';

    (state.staffMembers || []).forEach(member => {
        const card = document.createElement('div');
        card.className = 'glass-panel';
        const roleBadge = member.role === 'admin' 
            ? '<span style="background: rgba(99,102,241,0.2); color: #818cf8; padding: 3px 8px; border-radius: 8px; font-size: 0.75rem; font-weight: 700;">Chủ Quán</span>'
            : (member.role === 'kitchen' 
                ? '<span style="background: rgba(249,115,22,0.2); color: #f97316; padding: 3px 8px; border-radius: 8px; font-size: 0.75rem; font-weight: 700;">Bếp (KDS)</span>' 
                : (member.role === 'cashier'
                    ? '<span style="background: rgba(16,185,129,0.2); color: #34d399; padding: 3px 8px; border-radius: 8px; font-size: 0.75rem; font-weight: 700;">Thu ngân</span>'
                    : '<span style="background: rgba(245,158,11,0.2); color: #fbbf24; padding: 3px 8px; border-radius: 8px; font-size: 0.75rem; font-weight: 700;">Phục vụ</span>'));

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <div style="display: flex; gap: 12px; align-items: center;">
                    <div style="width: 44px; height: 44px; border-radius: 50%; background: var(--primary-glow); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem; color: var(--primary);">
                        ${member.name.charAt(0)}
                    </div>
                    <div>
                        <div style="font-weight: 700; font-size: 1rem; color: var(--text-primary);">${member.name}</div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">Mã PIN: <strong>${member.pin || '****'}</strong></div>
                    </div>
                </div>
                ${roleBadge}
            </div>
            <div style="background: rgba(0,0,0,0.03); border-radius: 12px; padding: 12px; font-size: 0.82rem; margin-bottom: 14px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span style="color: var(--text-secondary);">Ca làm việc:</span>
                    <span style="color: var(--text-primary); font-weight: 600;">${member.shift || 'Toàn thời gian'}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary);">Lương cơ bản:</span>
                    <span style="color: #10b981; font-weight: 700;">${(member.salary || 0).toLocaleString()}đ</span>
                </div>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 8px;">
                <button onclick="openChangePinModal('${member.id}')" class="btn" style="padding: 5px 12px; font-size: 0.8rem;"><i class="fa-solid fa-key"></i> Đổi mã PIN</button>
                <button onclick="deleteStaffMember('${member.id}')" class="btn" style="color: var(--danger); padding: 5px 12px; font-size: 0.8rem;"><i class="fa-solid fa-trash"></i> Xóa</button>
            </div>
        `;
        container.appendChild(card);
    });
}

window.openStaffModal = function() {
    document.getElementById('staffNameInput').value = '';
    document.getElementById('staffPinInput').value = '';
    document.getElementById('staffSalaryInput').value = '7500000';
    document.getElementById('staffModal').classList.remove('hidden');
};

window.closeStaffModal = function() {
    document.getElementById('staffModal').classList.add('hidden');
};

window.saveStaffMember = async function() {
    const name = document.getElementById('staffNameInput').value.trim();
    const role = document.getElementById('staffRoleInput').value;
    const pin = document.getElementById('staffPinInput').value.trim();
    const shift = document.getElementById('staffShiftInput').value;
    const salary = parseFloat(document.getElementById('staffSalaryInput').value) || 0;

    if (!name || !pin) return alert('Vui lòng nhập tên và mã PIN cho nhân viên');

    const id = 'staff_' + Date.now();
    await db.collection("staff").doc(id).set({
        id, name, role, pin, shift, salary, revenue: 0
    });

    closeStaffModal();
    showToast(`Đã thêm nhân viên ${name}`);
};

window.deleteStaffMember = async function(id) {
    if (confirm('Xác nhận xóa hồ sơ nhân viên này?')) {
        await db.collection("staff").doc(id).delete();
        showToast('Đã xóa nhân viên');
    }
};

// --- Đổi mã PIN (Admin can change the PIN of any other role) ---
let changePinTargetId = null;

window.openChangePinModal = function(id) {
    const member = state.staffMembers.find(m => m.id === id);
    if (!member) return alert('Không tồn nhân viên');
    changePinTargetId = id;
    document.getElementById('changePinStaffName').innerText = member.name + ' (' + member.role + ')';
    document.getElementById('changePinInput').value = '';
    document.getElementById('changePinModal').classList.remove('hidden');
    document.getElementById('changePinInput').focus();
};

window.closeChangePinModal = function() {
    document.getElementById('changePinModal').classList.add('hidden');
    changePinTargetId = null;
};

window.saveChangePin = async function() {
    const newPin = document.getElementById('changePinInput').value.trim();
    if (!changePinTargetId) return alert('Không tồn nhân viên');
    if (!newPin) return alert('Vui lòng nhập mã PIN mới');
    if (!/^\d{4,6}$/.test(newPin)) return alert('Mã PIN phải là 4-6 số');
    await db.collection("staff").doc(changePinTargetId).update({ pin: newPin });
    closeChangePinModal();
    showToast('Đã đổi mã PIN thành công');
};

// --- Module: Cài đặt Định phí & Khấu hao (Fixed Costs & Depreciation) ---
window.openFixedCostModal = function() {
    const settings = state.fixedCostSettings || {};
    const rentInput = document.getElementById('fixedCostRentInput');
    const utilInput = document.getElementById('fixedCostUtilitiesInput');
    const depInput = document.getElementById('fixedCostDepreciationInput');
    
    if (rentInput) rentInput.value = settings.rent || 0;
    if (utilInput) utilInput.value = settings.utilities || 0;
    if (depInput) depInput.value = settings.depreciation || 0;
    
    recalcFixedCostModalTotal();
    const modal = document.getElementById('fixedCostModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeFixedCostModal = function() {
    const modal = document.getElementById('fixedCostModal');
    if (modal) modal.classList.add('hidden');
};

window.recalcFixedCostModalTotal = function() {
    const rent = parseFloat(document.getElementById('fixedCostRentInput')?.value) || 0;
    const utilities = parseFloat(document.getElementById('fixedCostUtilitiesInput')?.value) || 0;
    const depreciation = parseFloat(document.getElementById('fixedCostDepreciationInput')?.value) || 0;
    const total = rent + utilities + depreciation;

    const totalEl = document.getElementById('fixedCostModalTotal');
    if (totalEl) totalEl.innerText = total.toLocaleString() + 'đ';
};

window.saveFixedCostSettings = async function() {
    const rent = parseFloat(document.getElementById('fixedCostRentInput')?.value) || 0;
    const utilities = parseFloat(document.getElementById('fixedCostUtilitiesInput')?.value) || 0;
    const depreciation = parseFloat(document.getElementById('fixedCostDepreciationInput')?.value) || 0;
    const total = rent + utilities + depreciation;

    const settingsData = {
        rent: rent,
        utilities: utilities,
        depreciation: depreciation,
        total: total,
        updatedAt: Date.now()
    };

    state.fixedCostSettings = settingsData;
    localStorage.setItem('cfood_fixed_costs', JSON.stringify(settingsData));

    try {
        await db.collection("settings").doc("financial").set(settingsData);
    } catch (e) {
        console.warn("Lỗi lưu Firebase, đã lưu cục bộ:", e);
    }

    closeFixedCostModal();
    showToast('Đã lưu cài đặt Định phí & Khấu hao thành công!');
    renderAnalyticsData();
};

// Bảng nguyên liệu: giữ các trường quan trọng trên cùng một hàng để dễ đối chiếu.
function renderInventoryList() {
    const list = document.getElementById('inventoryList');
    if (!list) return;

    list.innerHTML = `
        <div class="inventory-table" role="table" aria-label="Danh sách nguyên liệu">
            <div class="inventory-table-head" role="row">
                <span>Tên nguyên liệu</span>
                <span>Đơn vị tính</span>
                <span>Giá tiền</span>
                <span>Tồn kho</span>
            </div>
        </div>`;
    const table = list.querySelector('.inventory-table');

    (state.inventory || []).forEach(item => {
        const isLow = (item.qty || 0) <= (item.minStock || 5);
        const row = document.createElement('div');
        row.className = `inventory-table-row${isLow ? ' is-low' : ''}`;
        row.innerHTML = `
            <strong class="inventory-name">${item.name}</strong>
            <span>${item.unit || 'kg'}</span>
            <strong class="inventory-cost">${(item.cost || 0).toLocaleString('vi-VN')}đ</strong>
            <div class="inventory-stock-actions">
                <span class="inventory-qty">${item.qty || 0}</span>
                <span class="inventory-stock-state ${isLow ? 'low' : ''}">${isLow ? 'Sắp hết' : 'Đủ kho'}</span>
                <span class="inventory-row-actions">
                    <button onclick="adjustInventoryQty('${item.id}', 5)" class="btn" title="Nhập thêm 5">+5</button>
                    <button onclick="adjustInventoryQty('${item.id}', -1)" class="btn" title="Xuất dùng 1">-1</button>
                    <button onclick="deleteInventoryItem('${item.id}')" class="btn danger-icon" title="Xóa"><i class="fa-solid fa-trash"></i></button>
                </span>
            </div>`;
        table.appendChild(row);
    });
}

// Không đưa tài khoản hệ thống Chủ Quán và Bếp KDS vào danh sách nhân sự vận hành.
function renderStaffList() {
    const container = document.getElementById('staffListContainer');
    if (!container) return;
    container.innerHTML = '';

    const employees = (state.staffMembers || [])
        .filter(member => member.role !== 'admin' && member.role !== 'kitchen');
    if (employees.length === 0) {
        container.innerHTML = '<div class="empty-admin-list">Chưa có nhân sự để hiển thị.</div>';
        return;
    }

    employees.forEach(member => {
        const roleLabel = member.role === 'cashier' ? 'Thu ngân' : 'Phục vụ';
        const card = document.createElement('article');
        card.className = 'glass-panel staff-card';
        card.innerHTML = `
            <div class="staff-card-head">
                <div class="staff-avatar">${(member.name || '?').charAt(0)}</div>
                <div class="staff-identification">
                    <strong>${member.name}</strong>
                    <span>Mã PIN: <b>${member.pin || '****'}</b></span>
                </div>
                <span class="staff-role-badge ${member.role === 'cashier' ? 'cashier' : ''}">${roleLabel}</span>
            </div>
            <dl class="staff-card-details">
                <div><dt>Ca làm việc</dt><dd>${member.shift || 'Cả ngày'}</dd></div>
                <div><dt>Lương cơ bản</dt><dd>${(member.salary || 0).toLocaleString('vi-VN')}đ</dd></div>
            </dl>
            <div class="staff-card-actions">
                <button onclick="openChangePinModal('${member.id}')" class="btn"><i class="fa-solid fa-key"></i> Đổi mã PIN</button>
                <button onclick="deleteStaffMember('${member.id}')" class="btn danger-icon" title="Xóa nhân sự"><i class="fa-solid fa-trash"></i></button>
            </div>`;
        container.appendChild(card);
    });
}

