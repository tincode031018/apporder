// --- Theme (Light / Dark) ---
const THEME_STORAGE_KEY = 'gastroorder_theme';

function updateThemeToggleIcons(theme) {
    const isDark = theme === 'dark';
    const iconEls = document.querySelectorAll('#themeToggleBtn i, #themeToggleLogin i');
    iconEls.forEach(icon => {
        icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    });
    const labelEl = document.getElementById('themeToggleLogin');
    if (labelEl) {
        const span = labelEl.querySelector('span');
        if (span) span.textContent = isDark ? 'Light' : 'Dark';
    }
}

function applyTheme() {
    let theme = localStorage.getItem(THEME_STORAGE_KEY);
    if (theme !== 'dark' && theme !== 'light') theme = 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1220' : '#f8fafc');
    updateThemeToggleIcons(theme);
}

window.toggleTheme = function() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme();
};

// Apply saved theme as early as possible (script is at end of <body>, DOM is ready).
try { applyTheme(); } catch (e) {}

// --- Initial Data (only used if DB is empty) ---
const INITIAL_TABLES = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    status: 'empty',
    x: (i % 3) * 120 + 60,
    y: Math.floor(i / 3) * 100 + 60,
    orders: [],
    mergedWith: null
}));

// Default staff accounts & PINs (only created if a role is missing, e.g. on an empty DB).
// Bếp (kitchen) = 2222, Thu ngân (cashier) = 3333, Quản trị viên (admin) = 1234
const INITIAL_STAFF = [
    { id: 'staff_admin',   name: 'Quản trị viên', role: 'admin',   pin: '1234', shift: 'Cả ngày (Full-time)', salary: 7500000, revenue: 0 },
    { id: 'staff_kitchen', name: 'Bếp',           role: 'kitchen', pin: '2222', shift: 'Cả ngày (Full-time)', salary: 7500000, revenue: 0 },
    { id: 'staff_cashier', name: 'Thu ngân',      role: 'cashier', pin: '3333', shift: 'Cả ngày (Full-time)', salary: 7500000, revenue: 0 }
];

// The web app talks only to a local Printer Bridge. Browsers do
// not expose raw UDP sockets, so discovery and ESC/POS delivery stay outside
// the page and on the cashier's trusted LAN machine.
const PRINTER_SETTINGS_KEY = 'gastroorder_printer_settings';
const PRINTER_BRIDGE_URL = 'http://127.0.0.1:9150';

// --- App State ---
let state = {
    role: null,
    currentStaff: null,
    currentTableId: null,
    cart: [],
    tables: [],
    menu: [],
    categories: [],
    kitchenOrders: [],
    inventory: [],
    staffMembers: INITIAL_STAFF.map(member => ({ ...member })),
    staffLoaded: false,
    bills: [],
    fixedCostSettings: {},
    printerSettings: {},
    paymentQrSettings: {},
    menuView: localStorage.getItem('gastroorder_menu_view') || 'grid',
    currentMenuCategory: 'all'
};

function loadPrinterSettings() {
    try { return JSON.parse(localStorage.getItem(PRINTER_SETTINGS_KEY)) || {}; }
    catch (e) { return {}; }
}


