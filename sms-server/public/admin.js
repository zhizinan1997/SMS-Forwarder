// ==================== 全局状态 ====================
const API_BASE = '';
let authToken = localStorage.getItem('adminToken') || null;
let adminUsername = localStorage.getItem('adminUsername') || null;
let editingAccountId = null;
let deleteAccountId = null;

// ==================== DOM 元素 ====================
const initPage = document.getElementById('init-page');
const loginPage = document.getElementById('login-page');
const mainPage = document.getElementById('main-page');

const initForm = document.getElementById('init-form');
const initError = document.getElementById('init-error');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');

const adminUsernameEl = document.getElementById('admin-username');
const changePasswordForm = document.getElementById('change-password-form');
const logoutBtn = document.getElementById('logout-btn');

const addAccountBtn = document.getElementById('add-account-btn');
const accountsList = document.getElementById('accounts-list');

const accountModal = document.getElementById('account-modal');
const modalTitle = document.getElementById('modal-title');
const accountForm = document.getElementById('account-form');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelBtn = document.getElementById('cancel-btn');

const confirmModal = document.getElementById('confirm-modal');
const confirmMessage = document.getElementById('confirm-message');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

// ==================== 工具函数 ====================
function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
}

// ==================== API 调用 ====================
async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });

        const data = await response.json();

        if (response.status === 401) {
            logout();
            return null;
        }

        if (response.status === 403) {
            showToast('需要管理员权限');
            return null;
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        showToast('网络请求失败');
        return null;
    }
}

// ==================== 页面切换 ====================
function showPage(page) {
    [initPage, loginPage, mainPage].forEach(p => p.classList.remove('active'));
    page.classList.add('active');
}

// ==================== 初始化检查 ====================
async function checkAdminStatus() {
    const data = await apiRequest('/api/admin/status');

    if (!data) return;

    if (!data.initialized) {
        // 未初始化，显示初始化页面
        showPage(initPage);
    } else if (authToken) {
        // 已登录，验证 token
        const check = await apiRequest('/api/admin/info');
        if (check?.success) {
            adminUsernameEl.textContent = check.data.username;
            showPage(mainPage);
            loadSubAccounts();
        } else {
            logout();
        }
    } else {
        // 未登录
        showPage(loginPage);
    }
}

// ==================== 初始化管理员 ====================
initForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    initError.textContent = '';

    const username = document.getElementById('init-username').value.trim();
    const password = document.getElementById('init-password').value;
    const confirm = document.getElementById('init-password-confirm').value;

    if (password !== confirm) {
        initError.textContent = '两次输入的密码不一致';
        return;
    }

    const data = await apiRequest('/api/admin/init', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    });

    if (data?.success) {
        showToast('管理员账号创建成功');
        initForm.reset();
        showPage(loginPage);
    } else {
        initError.textContent = data?.error || '创建失败';
    }
});

// ==================== 登录 ====================
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    const data = await apiRequest('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    });

    if (data?.success) {
        authToken = data.token;
        adminUsername = data.username;
        localStorage.setItem('adminToken', authToken);
        localStorage.setItem('adminUsername', adminUsername);
        adminUsernameEl.textContent = adminUsername;
        showPage(mainPage);
        loadSubAccounts();
    } else {
        loginError.textContent = data?.error || '登录失败';
    }
});

// ==================== 登出 ====================
function logout() {
    authToken = null;
    adminUsername = null;
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUsername');
    showPage(loginPage);
}

logoutBtn.addEventListener('click', logout);

// ==================== 修改密码 ====================
changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;

    const data = await apiRequest('/api/admin/change-password', {
        method: 'POST',
        body: JSON.stringify({
            username: adminUsername,
            oldPassword,
            newPassword
        })
    });

    if (data?.success) {
        showToast('密码修改成功');
        changePasswordForm.reset();
    } else {
        showToast(data?.error || '修改失败');
    }
});

// ==================== 子账号管理 ====================
async function loadSubAccounts() {
    const data = await apiRequest('/api/admin/sub-accounts');

    if (!data?.success) {
        accountsList.innerHTML = '<div class="no-accounts">加载失败</div>';
        return;
    }

    if (data.data.length === 0) {
        accountsList.innerHTML = '<div class="no-accounts">暂无子账号，点击上方按钮添加</div>';
        return;
    }

    accountsList.innerHTML = data.data.map(account => `
        <div class="account-item" data-id="${account.id}">
            <div class="account-info">
                <div class="account-password">${escapeHtml(account.password)}</div>
                <div class="account-filter">
                    <span class="filter-type">${getFilterTypeName(account.filter_type)}</span>
                    ${account.filter_value ? escapeHtml(account.filter_value) : ''}
                </div>
                ${account.description ? `<div class="account-description">${escapeHtml(account.description)}</div>` : ''}
            </div>
            <div class="account-actions">
                <button class="edit-btn" title="编辑">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="delete-btn" title="删除">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');

    // 绑定事件
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const item = e.target.closest('.account-item');
            const account = data.data.find(a => a.id === parseInt(item.dataset.id));
            openEditModal(account);
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const item = e.target.closest('.account-item');
            const account = data.data.find(a => a.id === parseInt(item.dataset.id));
            openDeleteConfirm(account);
        });
    });
}

function getFilterTypeName(type) {
    const names = {
        'all': '全部',
        'content_contains': '内容包含',
        'sender_match': '发送者匹配'
    };
    return names[type] || type;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== 添加/编辑弹窗 ====================
addAccountBtn.addEventListener('click', () => {
    editingAccountId = null;
    modalTitle.textContent = '添加子账号';
    accountForm.reset();
    accountModal.classList.add('active');
});

function openEditModal(account) {
    editingAccountId = account.id;
    modalTitle.textContent = '编辑子账号';
    document.getElementById('account-id').value = account.id;
    document.getElementById('account-password').value = account.password;
    document.getElementById('account-filter-type').value = account.filter_type;
    document.getElementById('account-filter-value').value = account.filter_value || '';
    document.getElementById('account-description').value = account.description || '';
    accountModal.classList.add('active');
}

function closeAccountModal() {
    accountModal.classList.remove('active');
    editingAccountId = null;
    accountForm.reset();
}

closeModalBtn.addEventListener('click', closeAccountModal);
cancelBtn.addEventListener('click', closeAccountModal);
accountModal.addEventListener('click', (e) => {
    if (e.target === accountModal) closeAccountModal();
});

accountForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = document.getElementById('account-password').value.trim();
    const filterType = document.getElementById('account-filter-type').value;
    const filterValue = document.getElementById('account-filter-value').value.trim();
    const description = document.getElementById('account-description').value.trim();

    const payload = { password, filterType, filterValue, description };

    let data;
    if (editingAccountId) {
        data = await apiRequest(`/api/admin/sub-accounts/${editingAccountId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
    } else {
        data = await apiRequest('/api/admin/sub-accounts', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    if (data?.success) {
        showToast(editingAccountId ? '子账号更新成功' : '子账号添加成功');
        closeAccountModal();
        loadSubAccounts();
    } else {
        showToast(data?.error || '操作失败');
    }
});

// ==================== 删除确认 ====================
function openDeleteConfirm(account) {
    deleteAccountId = account.id;
    confirmMessage.textContent = `确定要删除密码为 "${account.password}" 的子账号吗？此操作不可撤销。`;
    confirmModal.classList.add('active');
}

function closeConfirmModal() {
    confirmModal.classList.remove('active');
    deleteAccountId = null;
}

confirmCancelBtn.addEventListener('click', closeConfirmModal);
confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeConfirmModal();
});

confirmDeleteBtn.addEventListener('click', async () => {
    if (!deleteAccountId) return;

    const data = await apiRequest(`/api/admin/sub-accounts/${deleteAccountId}`, {
        method: 'DELETE'
    });

    if (data?.success) {
        showToast('子账号删除成功');
        closeConfirmModal();
        loadSubAccounts();
    } else {
        showToast(data?.error || '删除失败');
    }
});

// ==================== 初始化 ====================
checkAdminStatus();
