// ==================== 全局状态 ====================
const API_BASE = '';
let authToken = localStorage.getItem('authToken') || null;
let currentPhone = null;
let conversations = [];
let ws = null;
let wsReconnectTimer = null;

// ==================== DOM 元素 ====================
const loginPage = document.getElementById('login-page');
const mainPage = document.getElementById('main-page');
const loginForm = document.getElementById('login-form');
const passwordInput = document.getElementById('password-input');
const loginError = document.getElementById('login-error');

const conversationsPanel = document.getElementById('conversations-panel');
const conversationsList = document.getElementById('conversations-list');
const messagesPanel = document.getElementById('messages-panel');
const messagesContainer = document.getElementById('messages-container');
const contactName = document.getElementById('contact-name');
const inputArea = document.getElementById('input-area');
const messageInput = document.getElementById('message-input');

const newMsgBtn = document.getElementById('new-msg-btn');
const settingsBtn = document.getElementById('settings-btn');
const backBtn = document.getElementById('back-btn');
const sendBtn = document.getElementById('send-btn');

const newMsgModal = document.getElementById('new-msg-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const newMsgForm = document.getElementById('new-msg-form');

const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const changePasswordForm = document.getElementById('change-password-form');
const logoutBtn = document.getElementById('logout-btn');

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

function formatTime(timeStr) {
    if (!timeStr) return '';
    try {
        const date = new Date(timeStr);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();

        if (isToday) {
            return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    } catch {
        return timeStr;
    }
}

function getAvatarText(phone) {
    if (!phone) return '?';
    // 返回后两位数字
    return phone.slice(-2);
}

function getAvatarColor(phone) {
    const colors = [
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
        'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    ];
    const hash = phone.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return colors[hash % colors.length];
}

// ==================== WebSocket ====================
function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    console.log('正在连接 WebSocket:', wsUrl);
    updateConnectionStatus('connecting');

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket 已连接');
        updateConnectionStatus('connected');
        if (wsReconnectTimer) {
            clearTimeout(wsReconnectTimer);
            wsReconnectTimer = null;
        }
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
        } catch (e) {
            console.error('解析 WebSocket 消息失败:', e);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket 已断开，5秒后重连...');
        updateConnectionStatus('disconnected');
        scheduleReconnect();
    };

    ws.onerror = (error) => {
        console.error('WebSocket 错误:', error);
        updateConnectionStatus('disconnected');
    };
}

function scheduleReconnect() {
    if (wsReconnectTimer) return;
    wsReconnectTimer = setTimeout(() => {
        wsReconnectTimer = null;
        if (authToken) {
            connectWebSocket();
        }
    }, 5000);
}

function handleWebSocketMessage(message) {
    console.log('收到 WebSocket 消息:', message.type);

    switch (message.type) {
        case 'connected':
            console.log('WebSocket 连接成功');
            break;

        case 'new_message':
            // 新短信到达
            handleNewMessage(message.data);
            break;

        case 'send_queued':
            // 发送任务已加入队列
            showToast('短信已加入发送队列');
            break;

        case 'send_status':
            // 发送状态更新
            handleSendStatus(message.data);
            break;
    }
}

function handleNewMessage(data) {
    // 刷新会话列表
    loadConversations();

    // 如果当前正在查看这个号码的对话，刷新消息
    if (currentPhone === data.sender) {
        loadMessages(currentPhone);
    }

    // 显示通知
    showToast(`新短信: ${data.sender}`);

    // 如果支持通知权限，发送桌面通知
    if (Notification.permission === 'granted') {
        new Notification('新短信', {
            body: `${data.sender}: ${data.content.substring(0, 50)}`,
            icon: '/favicon.ico'
        });
    }
}

function handleSendStatus(data) {
    if (data.status === 'sent') {
        showToast('短信发送成功');
        // 刷新当前对话
        if (currentPhone) {
            loadMessages(currentPhone);
        }
        loadConversations();
    } else if (data.status === 'failed') {
        showToast('短信发送失败');
    }
}

function updateConnectionStatus(status) {
    let statusEl = document.querySelector('.connection-status');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.className = 'connection-status';
        const listContainer = document.getElementById('conversations-list');
        if (listContainer) {
            listContainer.parentNode.insertBefore(statusEl, listContainer);
        }
    }

    const statusTexts = {
        'connected': '已连接',
        'connecting': '连接中...',
        'disconnected': '已断开'
    };

    statusEl.innerHTML = `
        <span class="status-dot ${status}"></span>
        <span>${statusTexts[status] || status}</span>
    `;
}

function disconnectWebSocket() {
    if (ws) {
        ws.close();
        ws = null;
    }
    if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
    }
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
            // 未授权，跳转登录
            logout();
            return null;
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        showToast('网络请求失败');
        return null;
    }
}

// ==================== 认证相关 ====================
async function login(password) {
    const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password })
    });

    if (data?.success) {
        authToken = data.token;
        localStorage.setItem('authToken', authToken);
        showMainPage();
        loadConversations();
        connectWebSocket();
        requestNotificationPermission();
    } else {
        loginError.textContent = data?.error || '登录失败';
    }
}

function logout() {
    authToken = null;
    localStorage.removeItem('authToken');
    currentPhone = null;
    disconnectWebSocket();
    showLoginPage();
}

async function checkAuth() {
    if (!authToken) {
        showLoginPage();
        return;
    }

    const data = await apiRequest('/api/auth/check');
    if (data?.success) {
        showMainPage();
        loadConversations();
        connectWebSocket();
        requestNotificationPermission();
    } else {
        showLoginPage();
    }
}

async function changePassword(oldPassword, newPassword) {
    const data = await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword })
    });

    if (data?.success) {
        showToast('密码修改成功');
        settingsModal.classList.remove('active');
        changePasswordForm.reset();
    } else {
        showToast(data?.error || '修改失败');
    }
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// ==================== 页面切换 ====================
function showLoginPage() {
    loginPage.classList.add('active');
    mainPage.classList.remove('active');
    loginError.textContent = '';
    passwordInput.value = '';
}

function showMainPage() {
    loginPage.classList.remove('active');
    mainPage.classList.add('active');
}

// ==================== 会话相关 ====================
async function loadConversations() {
    conversationsList.innerHTML = '<div class="loading"></div>';

    const data = await apiRequest('/api/sms/conversations');

    if (data?.success) {
        conversations = data.data;
        renderConversations();
    } else {
        conversationsList.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
}

function renderConversations() {
    if (conversations.length === 0) {
        conversationsList.innerHTML = '<div class="empty-state"><p>暂无短信</p></div>';
        return;
    }

    conversationsList.innerHTML = conversations.map(conv => `
        <div class="conversation-item ${currentPhone === conv.phone ? 'active' : ''}" 
             data-phone="${conv.phone}">
            <div class="avatar" style="background: ${getAvatarColor(conv.phone)}">
                ${getAvatarText(conv.phone)}
            </div>
            <div class="conversation-info">
                <div class="conversation-header">
                    <span class="conversation-name">${conv.phone}</span>
                    <span class="conversation-time">${formatTime(conv.lastTime)}</span>
                </div>
                <div class="conversation-preview">${conv.lastMessage || ''}</div>
            </div>
        </div>
    `).join('');

    // 绑定点击事件
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', () => {
            const phone = item.dataset.phone;
            selectConversation(phone);
        });
    });
}

async function selectConversation(phone) {
    currentPhone = phone;

    // 更新选中状态
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.toggle('active', item.dataset.phone === phone);
    });

    // 移动端显示消息面板
    messagesPanel.classList.add('visible');

    // 更新标题
    contactName.textContent = phone;

    // 显示输入区域
    inputArea.classList.remove('hidden');

    // 加载消息
    await loadMessages(phone);
}

async function loadMessages(phone) {
    messagesContainer.innerHTML = '<div class="loading"></div>';

    const data = await apiRequest(`/api/sms/messages/${encodeURIComponent(phone)}`);

    if (data?.success) {
        renderMessages(data.data);
    } else {
        messagesContainer.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
}

function renderMessages(messages) {
    if (messages.length === 0) {
        messagesContainer.innerHTML = '<div class="empty-state"><p>暂无消息</p></div>';
        return;
    }

    messagesContainer.innerHTML = messages.map(msg => {
        const statusIcon = getStatusIcon(msg.status, msg.isOutgoing);
        return `
            <div class="message-bubble ${msg.isOutgoing ? 'outgoing' : 'incoming'}">
                ${escapeHtml(msg.content)}
            </div>
            <div class="message-time ${msg.isOutgoing ? 'outgoing' : ''}">
                ${formatTime(msg.time)}${statusIcon}
            </div>
        `;
    }).join('');

    // 滚动到底部
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function getStatusIcon(status, isOutgoing) {
    if (!isOutgoing) return '';

    switch (status) {
        case 'pending':
            return ' <span class="status-icon pending" title="发送中">⏳</span>';
        case 'sent':
            return ' <span class="status-icon sent" title="已发送">✓</span>';
        case 'failed':
            return ' <span class="status-icon failed" title="发送失败">✗</span>';
        default:
            return '';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== 发送短信 ====================
async function sendMessage(recipient, content) {
    const data = await apiRequest('/api/sms/send', {
        method: 'POST',
        body: JSON.stringify({ recipient, content })
    });

    if (data?.success) {
        showToast('已添加到发送队列');
        return true;
    } else {
        showToast(data?.error || '发送失败');
        return false;
    }
}

// ==================== 事件绑定 ====================
// 登录表单
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    login(passwordInput.value);
});

// 返回按钮（移动端）
backBtn.addEventListener('click', () => {
    messagesPanel.classList.remove('visible');
    currentPhone = null;
});

// 发送按钮
sendBtn.addEventListener('click', async () => {
    const content = messageInput.value.trim();
    if (!content || !currentPhone) return;

    const success = await sendMessage(currentPhone, content);
    if (success) {
        messageInput.value = '';
    }
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
    }
});

// 新消息弹窗
newMsgBtn.addEventListener('click', () => {
    newMsgModal.classList.add('active');
});

closeModalBtn.addEventListener('click', () => {
    newMsgModal.classList.remove('active');
});

newMsgForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const recipient = document.getElementById('new-recipient').value.trim();
    const content = document.getElementById('new-content').value.trim();

    if (!recipient || !content) return;

    const success = await sendMessage(recipient, content);
    if (success) {
        newMsgModal.classList.remove('active');
        newMsgForm.reset();
    }
});

// 设置弹窗
settingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('active');
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('active');
});

changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;
    await changePassword(oldPassword, newPassword);
});

logoutBtn.addEventListener('click', () => {
    settingsModal.classList.remove('active');
    logout();
});

// 点击弹窗外部关闭
[newMsgModal, settingsModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

// ==================== 初始化 ====================
checkAuth();
