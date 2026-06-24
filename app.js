
// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyBqhQrmJlZ1iDnbXsfe1APnjM_Q_M-AwgY",
  authDomain: "apporder-48db7.firebaseapp.com",
  projectId: "apporder-48db7",
  storageBucket: "apporder-48db7.firebasestorage.app",
  messagingSenderId: "332354886514",
  appId: "1:332354886514:web:44a233b7270c2e782c9beb"
};

// Initialize Firebase
let db;
let storage;
// const { initializeApp, getFirestore, collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, getStorage, ref, uploadBytes, getDownloadURL } = window.FirebaseLib;

try {
    const app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    storage = firebase.storage();
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
    { id: 'nuoc', name: 'Món nước' },
    { id: 'kho', name: 'Món khô' },
    { id: 'xao', name: 'Món xào' }
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
    db.collection("tables").onSnapshot((snapshot) => {
        let tables = snapshot.docs.map(doc => doc.data()).sort((a, b) => a.id - b.id);
        if (tables.length === 0) {
            // Seed initial tables if empty
            INITIAL_TABLES.forEach(t => db.collection("tables").doc(t.id.toString()).set(t));
        } else {
            state.tables = tables;
            renderTableSelection();
            updateFloorStats();
            if (views.admin.classList.contains('active')) {
                 drawFloorPlan();
            }
        }
    });

    // Sync Menu
    db.collection("menu").onSnapshot((snapshot) => {
        state.menu = snapshot.docs.map(doc => doc.data());
        renderAdminMenu();
        renderMenu(document.querySelector('.cat-btn.active')?.dataset.cat || 'all');
        updateMenuStats();
    });

    // Sync Categories
    db.collection("categories").onSnapshot((snapshot) => {
        let cats = snapshot.docs.map(doc => doc.data());
        if (cats.length === 0) {
            INITIAL_CATS.forEach(c => db.collection("categories").doc(c.id).set(c));
        } else {
            state.categories = cats;
            renderAdminCats();
            renderCategoryFilters();
            updateCategoryStats();
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
    const startOrderBtn = document.getElementById('startOrderBtn');
    if (startOrderBtn) {
        startOrderBtn.addEventListener('click', () => {
            if (state.currentTableId) {
                const table = state.tables.find(t => t.id === state.currentTableId);
                if (table.status === 'empty') {
                    table.status = 'occupied';
                    saveState();
                }
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
    await db.collection("tables").doc(table.id.toString()).update({ status: newStatus });
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
        await db.collection("tables").doc(table.id.toString()).update({ 
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
        updateFloorStats();
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
        updateCategoryStats();
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

    if (viewName === 'admin') {
        updateFloorStats();
        updateMenuStats();
        updateCategoryStats();
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



window.closeTableActions = function() {
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
        const isOut = item.isOutOfStock || item.outOfStock || item.status === 'out' || item.status === 'soldout';
        const card = document.createElement('div');
        card.className = 'menu-card';
        card.innerHTML = `
            ${item.img ? `<img src="${item.img}" alt="${item.name}">` : `<div style="width: 100%; aspect-ratio: 1 / 1; background: #f1f5f9; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 0.8rem;">No image</div>`}
            <div class="menu-card-content">
                <h4 style="font-size: 0.9rem; margin-bottom: 5px;">${item.name}</h4>
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span class="price">${item.price.toLocaleString()}?</span>
                    ${isOut ? '<span style="font-size: 0.7rem; font-weight: 700; color: var(--danger);">HẾT MÓN</span>' : '<button class="btn btn-primary" onclick="addToCart(' + item.id + ')" style="padding: 5px 10px; border-radius: 8px;"><i class="fa-solid fa-plus"></i></button>'}
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

window.checkout = async function() {
    if (state.cart.length === 0) return alert('Giỏ hàng trống!');
    
    const table = state.tables.find(t => t.id === state.currentTableId);
    if (!table) return alert('Không xác định được bàn.');
    
    const updatedOrders = [...(table.orders || [])];

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
    });

    await db.collection("tables").doc(table.id.toString()).update({
        orders: updatedOrders,
        status: 'occupied'
    });
    
    state.cart = [];
    updateCartUI();
    closeCart();
    showToast('Đặt món thành công!');
    
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
    const special = state.menu.filter(item => item.isSpecial || item.special || item.featured).length;
    
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
    const i = state.tables.length;
    const newTable = {
        id: newId,
        status: 'empty',
        x: (i % 3) * 120 + 60,
        y: Math.floor(i / 3) * 100 + 60,
        orders: []
    };
    await db.collection("tables").doc(newId.toString()).set(newTable);
    showToast(`Đã thêm Bàn ${newId}`);
}

window.removeTable = async () => {
    if (state.tables.length === 0) return;
    const lastTable = state.tables[state.tables.length - 1];
    await db.collection("tables").doc(lastTable.id.toString()).delete();
    showToast(`Đã xóa Bàn ${lastTable.id}`);
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
        const isSpecial = !!(item.isSpecial || item.special || item.featured);
        const isOut = !!(item.isOutOfStock || item.outOfStock || item.status === 'out' || item.status === 'soldout');
        const row = document.createElement('div');
        row.className = 'glass-panel';
        row.style.display = 'flex';
        row.style.gap = '15px';
        row.style.padding = '15px';
        row.style.alignItems = 'center';
        row.innerHTML = `
            <img src="${item.img}" style="width: 50px; height: 50px; border-radius: 10px; object-fit: cover;">
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 600;">${item.name}</div>
                <div style="font-size: 0.8rem; opacity: 0.7; margin-top: 2px;">${item.price.toLocaleString()}đ • ${item.cat}</div>
                <div style="display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;">
                    <button class="btn" onclick="toggleMenuFlag('${item.id}', 'isOutOfStock')" style="padding: 5px 10px; border: 1px solid var(--danger); color: ${isOut ? 'white' : 'var(--danger)'}; background: ${isOut ? 'var(--danger)' : 'transparent'};">
                        Hết món
                    </button>
                    <button class="btn" onclick="toggleMenuFlag('${item.id}', 'isSpecial')" style="padding: 5px 10px; border: 1px solid var(--warning); color: ${isSpecial ? 'white' : 'var(--warning)'}; background: ${isSpecial ? 'var(--warning)' : 'transparent'};">
                        Đặc biệt
                    </button>
                </div>
            </div>
            <button class="btn" onclick="deleteMenuItem(${item.id})" style="color: var(--danger); border: none; background: none; padding: 5px;">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        list.appendChild(row);
    });
    updateMenuStats();
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

window.saveMenuItem = async () => {
    const name = document.getElementById('editItemName').value;
    const price = parseInt(document.getElementById('editItemPrice').value);
    const cat = document.getElementById('editItemCat').value;
    const fileInput = document.getElementById('editItemFile');
    
    if (!name || isNaN(price)) {
        return alert('Vui lòng nhập đầy đủ tên và giá món');
    }
    
    const saveToFirestore = async (imgUrl) => {
        const id = Date.now().toString();
        const newItem = {
            id,
            name,
            price,
            cat,
            ...(imgUrl ? { img: imgUrl } : {})
        };
        
        await db.collection("menu").doc(id).set(newItem);
        closeMenuModal();
        showToast('Đã thêm món mới');
    };

    if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        const storageRef = storage.ref('menu/' + Date.now() + '_' + file.name);
        try {
            showToast('Đang tải ảnh lên...');
            const snapshot = await storageRef.put(file);
            const downloadURL = await snapshot.ref.getDownloadURL();
            saveToFirestore(downloadURL);
        } catch (error) {
            console.error("Upload failed", error);
            alert("Lỗi khi tải ảnh lên Firebase Storage");
        }
    } else {
        saveToFirestore();
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
    patch[field] = !item[field];
    await db.collection("menu").doc(id.toString()).update(patch);
    showToast(patch[field] ? 'Đã cập nhật món' : 'Đã bỏ trạng thái');
    updateMenuStats();
};

// --- Admin: Category Management ---
// --- Admin: Category Management ---
function renderAdminCats() {
    const list = document.getElementById('adminCatList');
    list.innerHTML = '';
    state.categories.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'glass-panel';
        row.style.display = 'flex';
        row.style.gap = '12px';
        row.style.padding = '15px';
        row.style.alignItems = 'center';
        row.innerHTML = `
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 600;">${cat.name}</div>
                <div style="font-size: 0.8rem; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">ID: ${cat.id}</div>
            </div>
            <button class="btn" onclick="editCategory('${cat.id}')" title="Đổi tên" style="color: var(--primary); border: none; background: none; padding: 5px;">
                <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn" onclick="deleteCategory('${cat.id}')" title="Xóa" style="color: var(--danger); border: none; background: none; padding: 5px;">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        list.appendChild(row);
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
