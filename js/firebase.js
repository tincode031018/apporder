
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
    console.warn("Firebase config is missing or invalid. App may not work correctly.");
}

window.showToast = function(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = message || 'Thành công!';
    toast.classList.remove('hidden');
    if (window._toastTimeout) clearTimeout(window._toastTimeout);
    window._toastTimeout = setTimeout(() => toast.classList.add('hidden'), 2800);
};
function showToast(message) { window.showToast(message); }

function syncWithFirebase() {
    if (!db) return;
    db.collection('tables').onSnapshot(snapshot => {
        const tables = snapshot.docs.map(doc => doc.data()).sort((a, b) => a.id - b.id);
        if (!tables.length) INITIAL_TABLES.forEach(table => db.collection('tables').doc(String(table.id)).set(table));
        else {
            state.tables = tables;
            renderTableSelection(); updateFloorStats();
            if (views.admin?.classList.contains('active')) drawFloorPlan();
            if (views.cashier?.classList.contains('active')) { renderCashierTables(); if (state.cashierSelectedTableId) selectCashierTable(state.cashierSelectedTableId); }
            if (views.userMenu?.classList.contains('active')) updateCartUI();
        }
    });
    db.collection('menu').onSnapshot(snapshot => { state.menu = snapshot.docs.map(doc => doc.data()); renderAdminMenu(); renderMenu(document.querySelector('.cat-btn.active')?.dataset.cat || 'all'); updateMenuStats(); });
    db.collection('categories').onSnapshot(snapshot => { state.categories = snapshot.docs.map(doc => doc.data()); renderAdminCats(); renderCategoryFilters(); updateCategoryStats(); });
    db.collection('kitchen_orders').onSnapshot(snapshot => { state.kitchenOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); renderKitchenOrders(); updateKdsBadge(); });
    db.collection('inventory').onSnapshot(snapshot => { state.inventory = snapshot.docs.map(doc => doc.data()); renderInventoryList(); updateInventoryStats(); });
    db.collection('staff').onSnapshot(snapshot => {
        state.staffMembers = snapshot.docs.map(doc => doc.data());
        state.staffLoaded = true;
        INITIAL_STAFF.forEach(seed => { if (!state.staffMembers.some(member => member.role === seed.role)) db.collection('staff').doc(seed.id).set(seed); });
        renderStaffList(); renderAnalyticsData();
    });
    db.collection('bills').onSnapshot(snapshot => { state.bills = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); renderAnalyticsData(); renderAdminMenu(); updateMenuStats(); if (views.cashier?.classList.contains('active')) updateCashierShiftSummary(); });
    db.collection('settings').doc('financial').onSnapshot(doc => { state.fixedCostSettings = doc?.exists ? doc.data() : {}; renderAnalyticsData(); });
    db.collection('settings').doc('payment_qr').onSnapshot(doc => { state.paymentQrSettings = doc?.exists ? doc.data() : {}; renderPaymentQrAdmin(); if (state.cashierPaymentMethod === 'qr' && state.cashierSelectedTableId) recalcCashierFinalTotal(); });
}

// Global Toast Notification Helper
