// Application bootstrap. Feature modules are loaded before this file.
const COLLECTION_VIEW_KEY = 'gastroorder_collection_view_';

function getCollectionTarget(scope) {
    const targets = {
        kds: document.getElementById('kdsBoard'),
        cashier: document.getElementById('cashierTablesList'),
        inventory: document.getElementById('inventoryList'),
        staff: document.getElementById('staffListContainer'),
        menuAdmin: document.getElementById('adminMenuList'),
        category: document.getElementById('adminCatList')
    };
    return targets[scope];
}

window.setCollectionView = function(scope, view) {
    const selectedView = view === 'list' ? 'list' : 'grid';
    localStorage.setItem(COLLECTION_VIEW_KEY + scope, selectedView);
    const target = getCollectionTarget(scope);
    if (target) {
        target.classList.toggle('collection-view-list', selectedView === 'list');
        target.classList.toggle('collection-view-grid', selectedView === 'grid');
    }
    document.querySelectorAll(`.collection-view-toggle[data-scope="${scope}"] [data-view]`).forEach(button => {
        button.classList.toggle('active', button.dataset.view === selectedView);
    });
};

document.addEventListener('click', (event) => {
    const button = event.target.closest('.collection-view-toggle [data-view]');
    if (!button) return;
    event.preventDefault();
    const scope = button.closest('.collection-view-toggle')?.dataset.scope;
    if (scope) window.setCollectionView(scope, button.dataset.view);
});

function createAdminViewControls(scope) {
    const config = {
        inventory: '#adminInventoryTab > div:first-child',
        staff: '#adminStaffTab > div:first-child',
        menuAdmin: '#adminMenuMgmtTab > div:first-child',
        category: '#adminCatMgmtTab > div:first-child'
    };
    const header = document.querySelector(config[scope]);
    if (!header || header.querySelector('.collection-view-toggle')) return;
    const control = document.createElement('div');
    control.className = 'collection-view-toggle';
    control.dataset.scope = scope;
    control.setAttribute('role', 'group');
    control.setAttribute('aria-label', 'Ki?u hi?n th? danh s�ch');
    control.innerHTML = `<button class="btn" type="button" data-view="grid" onclick="setCollectionView('${scope}', 'grid')" title="D?ng lu?i"><i class="fa-solid fa-grip"></i></button><button class="btn" type="button" data-view="list" onclick="setCollectionView('${scope}', 'list')" title="D?ng danh s�ch"><i class="fa-solid fa-list"></i></button>`;
    header.appendChild(control);
}

function initializeCollectionViews() {
    ['inventory', 'staff', 'menuAdmin', 'category'].forEach(createAdminViewControls);
    ['kds', 'cashier', 'inventory', 'staff', 'menuAdmin', 'category'].forEach(scope => {
        window.setCollectionView(scope, localStorage.getItem(COLLECTION_VIEW_KEY + scope) || 'grid');
    });
}

initializeCollectionViews();
init();

window.addEventListener('resize', () => {
    if (views.admin && views.admin.classList.contains('active')) {
        const floorPlanTab = document.getElementById('adminFloorPlanTab');
        if (floorPlanTab && !floorPlanTab.classList.contains('hidden')) {
            resizeCanvas();
            drawFloorPlan();
        }
        const analyticsTab = document.getElementById('adminAnalyticsTab');
        if (analyticsTab && !analyticsTab.classList.contains('hidden')) {
            drawRevenueChart();
        }
    }
});
