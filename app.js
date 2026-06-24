// --- Firebase Configuration ---
// BẠN CẦN THAY THẾ CÁC THÔNG SỐ DƯỚI ĐÂY BẰNG CẤU HÌNH CỦA BẠN TỪ FIREBASE CONSOLE
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
let db;
let storage;
const { initializeApp, getFirestore, collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, getStorage, ref, uploadBytes, getDownloadURL } = window.FirebaseLib;

try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    storage = getStorage(app);
} catch (e) {
    console.warn("Firebase config is missing or invalid. App will use dummy data or fail.");
}

// --- Initial Data (only used if DB is empty) ---
const INITIAL_TABLES = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    status: 'empty',
    x: (i % 3) * 120 + 60,
    y: Math.floor(i / 3) * 100 + 60,
    orders: []
}));

const INITIAL_CATS = [
    { id: 'main', name: 'Món chính' },
    { id: 'drink', name: 'Đồ uống' },
    { id: 'dessert', name: 'Tráng miệng' }
];

// --- App State ---
let state = {
    role: null,
    currentTableId: null,
    cart: [],
    tables: [],
    menu: [],
    categories: []
};

// --- Real-time Sync ---
function syncWithFirebase() {
    // Sync Tables
    onSnapshot(collection(db, "tables"), (snapshot) => {
        let tables = snapshot.docs.map(doc => doc.data()).sort((a, b) => a.id - b.id);
        if (tables.length === 0) {
            // Seed initial tables if empty
            INITIAL_TABLES.forEach(t => setDoc(doc(db, "tables", t.id.toString()), t));
        } else {
            state.tables = tables;
            renderTableSelection();
            if (views.admin.classList.contains('active')) {
                 drawFloorPlan();
                 updateStats();
            }
        }
    });

    // Sync Menu
    onSnapshot(collection(db, "menu"), (snapshot) => {
        state.menu = snapshot.docs.map(doc => doc.data());
        renderAdminMenu();
        renderMenu(document.querySelector('.cat-btn.active')?.dataset.cat || 'all');
    });

    // Sync Categories
    onSnapshot(collection(db, "categories"), (snapshot) => {
        let cats = snapshot.docs.map(doc => doc.data());
        if (cats.length === 0) {
            INITIAL_CATS.forEach(c => setDoc(doc(db, "categories", c.id), c));
        } else {
            state.categories = cats;
            renderAdminCats();
            renderCategoryFilters();
        }
    });
}



// --- DOM Elements ---
const views = {
    login: document.getElementById('loginView'),
    tableSelection: document.getElementById('tableSelectionView'),
    userMenu: document.getElementById('userMenuView'),
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

            if (role === 'user') {
                document.getElementById('staffLogin').classList.remove('hidden');
                document.getElementById('adminLogin').classList.add('hidden');
            } else {
                document.getElementById('adminLogin').classList.remove('hidden');
                document.getElementById('staffLogin').classList.add('hidden');
            }
        });
    });

    // Staff Login
    document.getElementById('loginStaffBtn').addEventListener('click', () => {
        const code = document.getElementById('staffCode').value;
        if (code === '1111') {
            window.switchView('tableSelection');

            renderTableSelection();
        } else {
            alert('Mã nhân viên không chính xác (Thử 1111)');
        }
    });


    // Admin Login
    document.getElementById('loginAdminBtn').addEventListener('click', () => {
        const code = document.getElementById('adminCode').value;
        if (code === '1234') {
            window.switchView('admin');

            initCanvas();
        } else {
            alert('Mã không chính xác (Thử 1234)');
        }
    });

    // User Start Order
    document.getElementById('startOrderBtn').addEventListener('click', () => {
        if (state.currentTableId) {
            const table = state.tables.find(t => t.id === state.currentTableId);
            if (table.status === 'empty') {
                table.status = 'occupied';
                saveState();
            }
            document.getElementById('userTableTitle').innerText = `Bàn ${state.currentTableId.toString().padStart(2, '0')}`;
            window.switchView('userMenu');

        }
    });

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
    document.getElementById('closeCartBtn').addEventListener('click', closeCart);
    document.getElementById('checkoutBtn').addEventListener('click', checkout);

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
    document.getElementById('userTableTitle').innerText = `Bàn ${state.currentTableId.toString().padStart(2, '0')}`;
    switchView('userMenu');
};

window.handleActionBook = async () => {
    const table = state.tables.find(t => t.id === state.currentTableId);
    if (!table) return;
    const newStatus = table.status === 'booked' ? 'empty' : 'booked';
    await updateDoc(doc(db, "tables", table.id.toString()), { status: newStatus });
    closeTableActions();
    showToast(`Đã ${newStatus === 'booked' ? 'đặt' : 'hủy đặt'} bàn ${table.id}`);
};

window.handleActionCheckout = async () => {
    const table = state.tables.find(t => t.id === state.currentTableId);
    if (!table) return;
    if (table.orders.length === 0 && table.status !== 'occupied') {
        return showToast('Bàn hiện đang trống');
    }
    const total = table.orders.reduce((acc, curr) => acc + (curr.price * curr.qty), 0);
    if (confirm(`Tính tiền Bàn ${table.id}?\nTổng cộng: ${total.toLocaleString()}đ`)) {
        await updateDoc(doc(db, "tables", table.id.toString()), { 
            status: 'empty',
            orders: []
        });
        closeTableActions();
        showToast(`Đã thanh toán Bàn ${table.id}`);
    }
};
window.handleLogout = () => {
    state.role = null;
    state.currentTableId = null;
    state.cart = [];
    updateCartUI();
    window.switchView('login');
};

window.handleAdminTab = (tab) => {
    console.log('Switching admin tab to:', tab.dataset.tab);
    document.querySelectorAll('.admin-tab').forEach(t => {

        t.classList.remove('active');
        t.style.color = 'var(--text-secondary)';
        t.style.borderBottom = 'none';
    });
    tab.classList.add('active');
    tab.style.color = 'var(--primary)';
    tab.style.borderBottom = '2px solid var(--primary)';
    
    const target = tab.dataset.tab;
    if (target === 'floorplan') {
        document.getElementById('adminFloorPlanTab').classList.remove('hidden');
        document.getElementById('adminMenuMgmtTab').classList.add('hidden');
        document.getElementById('adminCatMgmtTab').classList.add('hidden');
        initCanvas();
    } else if (target === 'menumgmt') {
        document.getElementById('adminFloorPlanTab').classList.add('hidden');
        document.getElementById('adminMenuMgmtTab').classList.remove('hidden');
        document.getElementById('adminCatMgmtTab').classList.add('hidden');
        renderAdminMenu();
    } else {
        document.getElementById('adminFloorPlanTab').classList.add('hidden');
        document.getElementById('adminMenuMgmtTab').classList.add('hidden');
        document.getElementById('adminCatMgmtTab').classList.remove('hidden');
        renderAdminCats();
    }
};




// --- View Controller ---
function switchView(viewName) {
    console.log('Switching to view:', viewName);
    if (!views[viewName]) {
        console.error('View not found:', viewName);
        return;
    }
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
    
    if (viewName === 'userMenu') {
        renderCategoryFilters();
        renderMenu('all');
    }

    if (viewName !== 'login') {
        nav.classList.remove('hidden');
    } else {
        nav.classList.add('hidden');
    }
}

window.switchView = switchView;


// --- User: Table Selection ---
function renderTableSelection() {
    console.log('Rendering table selection...');
    tableGrid.innerHTML = '';
    state.tables.forEach(table => {
        const btn = document.createElement('button');
        btn.className = `btn glass-panel ${table.status}`;
        btn.style.padding = '15px 10px';
        btn.style.flexDirection = 'column';
        btn.style.height = 'auto';
        const total = (table.orders || []).reduce((acc, curr) => acc + (curr.price * curr.qty), 0);
        
        btn.innerHTML = `
            <div style="font-weight: 700; font-size: 1.1rem;">${table.id.toString().padStart(2, '0')}</div>
            <div style="font-size: 0.6rem; opacity: 0.7; margin-bottom: 5px;">${table.status === 'occupied' ? 'CÓ KHÁCH' : (table.status === 'booked' ? 'ĐẶT TRƯỚC' : 'TRỐNG')}</div>
            ${total > 0 ? `<div style="font-size: 0.75rem; font-weight: 700; background: var(--danger); color: white; padding: 2px 8px; border-radius: 10px;">${total.toLocaleString()}đ</div>` : ''}
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
            console.log('Table clicked:', table.id);
            window.openTableActions(table.id);
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
    statusEl.style.background = table.status === 'empty' ? '#dcfce7' : (table.status === 'booked' ? '#fef9c3' : '#fee2e2');
    statusEl.style.color = table.status === 'empty' ? '#166534' : (table.status === 'booked' ? '#854d0e' : '#991b1b');

    // Render current orders
    const detailsEl = document.getElementById('actionOrderDetails');
    const totalEl = document.getElementById('actionTotalAmount');
    
    // Ensure orders array exists
    if (!table.orders) table.orders = [];

    if (table.orders.length === 0) {
        detailsEl.innerHTML = `<p style="font-size: 0.8rem; opacity: 0.6; text-align: center; margin: 0;">Bàn hiện chưa có món</p>`;
        totalEl.innerText = '0đ';
    } else {
        let total = 0;
        detailsEl.innerHTML = table.orders.map(item => {
            const itemTotal = (item.price || 0) * (item.qty || 0);
            total += itemTotal;
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 5px;">
                    <div>
                        <div style="font-size: 0.9rem; font-weight: 600;">${item.name}</div>
                        <div style="font-size: 0.75rem; opacity: 0.7;">${item.qty} x ${(item.price || 0).toLocaleString()}đ</div>
                    </div>
                    <div style="font-weight: 600; font-size: 0.9rem;">${itemTotal.toLocaleString()}đ</div>
                </div>
            `;
        }).join('');
        totalEl.innerText = total.toLocaleString() + 'đ';
    }

    const overlay = document.getElementById('tableActionOverlay');
    const sheet = document.getElementById('tableActionSheet');
    overlay.classList.remove('hidden');
    setTimeout(() => sheet.style.transform = 'translateY(0)', 10);
};



function closeTableActions() {
    const overlay = document.getElementById('tableActionOverlay');
    const sheet = document.getElementById('tableActionSheet');
    sheet.style.transform = 'translateY(100%)';
    setTimeout(() => overlay.classList.add('hidden'), 300);
}


// --- User: Menu & Cart ---
function renderMenu(category) {
    menuContainer.innerHTML = '';
    const items = category === 'all' ? state.menu : state.menu.filter(m => m.cat === category);
    
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'menu-card';
        card.innerHTML = `
            <img src="${item.img}" alt="${item.name}">
            <div class="menu-card-content">
                <h4 style="font-size: 0.9rem; margin-bottom: 5px;">${item.name}</h4>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="price">${item.price.toLocaleString()}đ</span>
                    <button class="btn btn-primary" onclick="addToCart(${item.id})" style="padding: 5px 10px; border-radius: 8px;">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                </div>
            </div>
        `;
        menuContainer.appendChild(card);
    });
}

window.addToCart = (id) => {
    const item = state.menu.find(m => m.id === id);
    const inCart = state.cart.find(c => c.id === id);
    if (inCart) {
        inCart.qty++;
    } else {
        state.cart.push({ ...item, qty: 1 });
    }
    updateCartUI();
    showToast(`Đã thêm ${item.name}`);
};


function updateCartUI() {
    const count = state.cart.reduce((acc, curr) => acc + curr.qty, 0);
    cartCount.innerText = count;
    
    cartItemsList.innerHTML = '';
    let total = 0;
    state.cart.forEach(item => {
        total += item.price * item.qty;
        const div = document.createElement('div');
        div.style = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;';
        div.innerHTML = `
            <div>
                <div style="font-weight: 500;">${item.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">${item.price.toLocaleString()}đ</div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <button onclick="changeQty(${item.id}, -1)" class="btn glass-panel" style="padding: 5px 10px;">-</button>
                <span>${item.qty}</span>
                <button onclick="changeQty(${item.id}, 1)" class="btn glass-panel" style="padding: 5px 10px;">+</button>
            </div>
        `;
        cartItemsList.appendChild(div);
    });
    cartTotalPrice.innerText = total.toLocaleString() + 'đ';
}

window.changeQty = (id, delta) => {
    const item = state.cart.find(c => c.id === id);
    if (item) {
        item.qty += delta;
        if (item.qty <= 0) {
            state.cart = state.cart.filter(c => c.id !== id);
        }
    }
    updateCartUI();
};

function openCart() {
    cartOverlay.classList.remove('hidden');
    setTimeout(() => cartSheet.style.transform = 'translateY(0)', 10);
}

function closeCart() {
    cartSheet.style.transform = 'translateY(100%)';
    setTimeout(() => cartOverlay.classList.add('hidden'), 300);
}

window.checkout = function() {
    if (state.cart.length === 0) return alert('Giỏ hàng trống!');
    
    // Find the correct table in the state
    const tableIndex = state.tables.findIndex(t => t.id === state.currentTableId);
    if (tableIndex === -1) {
        return alert('Không xác định được bàn. Vui lòng chọn lại bàn.');
    }
    
    const table = state.tables[tableIndex];
    if (!table.orders) table.orders = [];

    console.log('Checkout for table:', table.id, 'Cart:', state.cart);

    // Merge cart items into table orders
    state.cart.forEach(cartItem => {
        const existing = table.orders.find(o => o.id === cartItem.id);
        if (existing) {
            existing.qty += cartItem.qty;
        } else {
            table.orders.push({ 
                id: cartItem.id, 
                name: cartItem.name, 
                price: cartItem.price, 
                qty: cartItem.qty 
            });
        }
    });

    table.status = 'occupied';
    
    // Clear and close
    state.cart = [];
    updateCartUI();
    saveState();
    
    // Refresh the grid and show feedback
    renderTableSelection();
    closeCart();
    showToast('Đặt món thành công!');
    
    // Force a small delay then switch view to show the updated table
    setTimeout(() => {
        window.switchView('tableSelection');
    }, 100);
};



// --- Admin: Canvas Floor Plan ---
let ctx;
function initCanvas() {
    const canvas = document.getElementById('floorPlanCanvas');
    ctx = canvas.getContext('2d');
    
    resizeCanvas();
    drawFloorPlan();
    
    canvas.addEventListener('click', (e) => {
        const mouseX = e.offsetX;
        const mouseY = e.offsetY;
        
        state.tables.forEach(table => {
            const dx = mouseX - table.x;
            const dy = mouseY - table.y;
            // Check if click is inside circle (radius 30)
            if (Math.sqrt(dx*dx + dy*dy) < 30) {
                // Toggle status
                if (table.status === 'empty') table.status = 'booked';
                else if (table.status === 'booked') table.status = 'occupied';
                else table.status = 'empty';
                
                saveState();
                drawFloorPlan();
                updateStats();
            }
        });
    });
}

function drawFloorPlan() {
    if (!ctx) return;
    const canvas = document.getElementById('floorPlanCanvas');
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    
    state.tables.forEach(table => {
        // Draw shadow
        ctx.beginPath();
        ctx.arc(table.x, table.y + 4, 30, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // Draw Table
        ctx.beginPath();
        ctx.arc(table.x, table.y, 30, 0, Math.PI * 2);
        
        let color = '#10b981'; // empty
        if (table.status === 'occupied') color = '#ef4444';
        if (table.status === 'booked') color = '#f59e0b';
        
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // Draw ID
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Outfit';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(table.id, table.x, table.y);
        
        // Draw status text below
        ctx.font = '500 10px Outfit';
        ctx.fillText(table.status.toUpperCase(), table.x, table.y + 45);
    });
}

function updateStats() {
    const empty = state.tables.filter(t => t.status === 'empty').length;
    const booked = state.tables.filter(t => t.status === 'booked').length;
    const occupied = state.tables.filter(t => t.status === 'occupied').length;
    
    if (document.getElementById('statEmpty')) {
        document.getElementById('statEmpty').innerText = empty;
        document.getElementById('statBooked').innerText = booked;
        document.getElementById('statOccupied').innerText = occupied;
    }
}

// --- Admin: Table Management ---
function addTable() {
    const newId = state.tables.length > 0 ? Math.max(...state.tables.map(t => t.id)) + 1 : 1;
    const i = state.tables.length;
    const newTable = {
        id: newId,
        status: 'empty',
        x: (i % 3) * 120 + 60,
        y: Math.floor(i / 3) * 100 + 60,
        orders: []
    };
    state.tables.push(newTable);
    saveState();
    
    // Update UI
    renderTableSelection();
    if (views.admin.classList.contains('active')) {
        resizeCanvas();
        drawFloorPlan();
    }
    updateStats();
    showToast(`Đã thêm Bàn ${newId}`);
}

function removeTable() {
    if (state.tables.length === 0) return;
    
    const removed = state.tables.pop();
    saveState();
    
    renderTableSelection();
    if (views.admin.classList.contains('active')) {
        resizeCanvas();
        drawFloorPlan();
    }
    updateStats();
    showToast(`Đã xóa Bàn ${removed.id}`);
}

function resizeCanvas() {
    const canvas = document.getElementById('floorPlanCanvas');
    if (!canvas) return;
    
    // Adjust canvas height based on table rows
    const rows = Math.ceil(state.tables.length / 3);
    const neededHeight = Math.max(400, rows * 100 + 100);
    
    const container = canvas.parentElement;
    container.style.height = neededHeight + 'px';
    container.style.aspectRatio = 'auto'; // Disable aspect-ratio
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx = canvas.getContext('2d'); // Re-get context
    ctx.scale(dpr, dpr);
}


// --- Admin: Menu Management ---
function renderAdminMenu() {
    const list = document.getElementById('adminMenuList');
    list.innerHTML = '';
    state.menu.forEach(item => {
        const row = document.createElement('div');
        row.className = 'glass-panel';
        row.style.display = 'flex';
        row.style.gap = '15px';
        row.style.padding = '15px';
        row.style.alignItems = 'center';
        row.innerHTML = `
            <img src="${item.img}" style="width: 50px; height: 50px; border-radius: 10px; object-fit: cover;">
            <div style="flex: 1;">
                <div style="font-weight: 600;">${item.name}</div>
                <div style="font-size: 0.8rem; opacity: 0.7;">${item.price.toLocaleString()}đ • ${item.cat}</div>
            </div>
            <button class="btn" onclick="deleteMenuItem(${item.id})" style="color: var(--danger); border: none; background: none; padding: 5px;">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        list.appendChild(row);
    });
}

window.addMenuItem = function() {
    // Populate Categories select
    const select = document.getElementById('editItemCat');
    select.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    // Clear previous values
    document.getElementById('editItemName').value = '';
    document.getElementById('editItemPrice').value = '';
    document.getElementById('editItemFile').value = '';
    document.getElementById('imagePreview').style.display = 'none';
    
    document.getElementById('menuItemModal').classList.remove('hidden');
};



window.closeMenuModal = () => {
    document.getElementById('menuItemModal').classList.add('hidden');
};

window.saveMenuItem = () => {
    const name = document.getElementById('editItemName').value;
    const price = parseInt(document.getElementById('editItemPrice').value);
    const cat = document.getElementById('editItemCat').value;
    const fileInput = document.getElementById('editItemFile');
    
    if (!name || isNaN(price)) {
        return alert('Vui lòng nhập đầy đủ tên và giá món');
    }
    
    const saveNewItem = (imgData) => {
        const newItem = {
            id: Date.now(),
            name,
            price,
            cat,
            img: imgData || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'
        };
        
        state.menu.push(newItem);
        saveState();
        renderAdminMenu();
        closeMenuModal();
        showToast('Đã thêm món mới');
    };

    if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => saveNewItem(e.target.result);
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        saveNewItem();
    }
};



window.deleteMenuItem = (id) => {
    if (confirm('Xóa món này?')) {
        state.menu = state.menu.filter(m => m.id !== id);
        saveState();
        renderAdminMenu();
    }
};

// --- Admin: Category Management ---
function renderAdminCats() {
    const list = document.getElementById('adminCatList');
    list.innerHTML = '';
    state.categories.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'glass-panel';
        row.style.display = 'flex';
        row.style.gap = '15px';
        row.style.padding = '15px';
        row.style.alignItems = 'center';
        row.innerHTML = `
            <div style="flex: 1;">
                <div style="font-weight: 600;">${cat.name}</div>
                <div style="font-size: 0.8rem; opacity: 0.7;">ID: ${cat.id}</div>
            </div>
            <button class="btn" onclick="deleteCategory('${cat.id}')" style="color: var(--danger); border: none; background: none; padding: 5px;">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        list.appendChild(row);
    });
}

window.addCategory = () => {
    const name = prompt('Tên danh mục mới:');
    if (!name) return;
    const id = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
    
    if (state.categories.find(c => c.id === id)) {
        return alert('Danh mục này đã tồn tại');
    }
    
    state.categories.push({ id, name });
    saveState();
    renderAdminCats();
    renderCategoryFilters();
    showToast('Đã thêm danh mục mới');
};

window.deleteCategory = (id) => {
    if (id === 'main') return alert('Không thể xóa danh mục mặc định');
    if (confirm('Xóa danh mục này sẽ ảnh hưởng đến các món đang thuộc danh mục này. Xác nhận xóa?')) {
        state.categories = state.categories.filter(c => c.id !== id);
        saveState();
        renderAdminCats();
        renderCategoryFilters();
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

// --- Utils ---

function saveState() {
    // Firebase handles individual updates now
}



function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// Start the app
init();
