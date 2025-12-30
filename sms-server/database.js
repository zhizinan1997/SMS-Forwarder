const Database = require('better-sqlite3');
const path = require('path');

// 数据库路径
const dbPath = path.join(__dirname, 'data', 'sms.db');

// 确保 data 目录存在
const fs = require('fs');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// [数据库初始化]
function initDatabase() {
    // 短信主表: 存储所有收到的短信以及网页代发出的短信汇总
    db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT NOT NULL,           -- 发件人 (如果是发出的，这里存收件人)
            content TEXT NOT NULL,          -- 正文
            received_at TEXT NOT NULL,      -- 时间戳
            device_id TEXT DEFAULT 'air780e_01',
            is_outgoing INTEGER DEFAULT 0,  -- 是否是发出的信息 (0:收, 1:发)
            status TEXT DEFAULT 'received', -- 状态: received, pending, sent, failed
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    `);

    // 待发送队列表: 设备端会轮询此表进行物理发送
    db.exec(`
        CREATE TABLE IF NOT EXISTS outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipient TEXT NOT NULL,
            content TEXT NOT NULL,
            device_id TEXT DEFAULT 'air780e_01',
            status TEXT DEFAULT 'pending',  -- pending: 待发, sent: 已发, failed: 失败
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            sent_at TEXT
        )
    `);

    // 配置表: 存储系统账号密码等持久化设置
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);

    // 管理员表
    db.exec(`
        CREATE TABLE IF NOT EXISTS admin (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    `);

    // 子账号表（密码 -> 筛选规则）
    db.exec(`
        CREATE TABLE IF NOT EXISTS sub_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            password TEXT NOT NULL UNIQUE,
            filter_type TEXT NOT NULL DEFAULT 'all',
            filter_value TEXT,
            description TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    `);

    // 初始化默认登录密码
    const stmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    stmt.run('password', 'admin');

    console.log('SQLite 数据库初始化已应用');
}

// === 短信相关操作 ===

// 保存收到的短信
function saveMessage(sender, content, receivedAt, deviceId = 'air780e_01') {
    const stmt = db.prepare(`
        INSERT INTO messages (sender, content, received_at, device_id, is_outgoing, status)
        VALUES (?, ?, ?, ?, 0, 'received')
    `);
    const result = stmt.run(sender, content, receivedAt, deviceId);
    return result.lastInsertRowid;
}

// 获取所有会话（包含收发消息，显示最新一条）
function getConversations() {
    // 使用子查询获取每个号码的最新一条消息的 ID
    const stmt = db.prepare(`
        SELECT 
            m.sender as phone,
            m.content as lastMessage,
            m.received_at as lastTime,
            m.is_outgoing as isOutgoing,
            counts.messageCount
        FROM messages m
        INNER JOIN (
            SELECT sender, MAX(id) as maxId, COUNT(*) as messageCount
            FROM messages
            GROUP BY sender
        ) counts ON m.id = counts.maxId
        ORDER BY m.received_at DESC, m.id DESC
    `);
    return stmt.all();
}

// 获取与某个号码的所有对话（双向）
function getMessagesByPhone(phone) {
    const stmt = db.prepare(`
        SELECT 
            id,
            sender,
            content,
            received_at as time,
            is_outgoing as isOutgoing,
            status
        FROM messages
        WHERE sender = ?
        ORDER BY received_at ASC
    `);
    return stmt.all(phone);
}

// 获取所有短信（分页）
function getAllMessages(limit = 100, offset = 0) {
    const stmt = db.prepare(`
        SELECT * FROM messages
        ORDER BY received_at DESC
        LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset);
}

// === 发件箱操作 ===

// [核心操作] 将网页发出的代发任务加入待办
function addToOutbox(recipient, content, time, deviceId = 'air780e_01') {
    const stmt = db.prepare(`
        INSERT INTO outbox (recipient, content, device_id, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
    `);
    const result = stmt.run(recipient, content, deviceId, time);

    // 同步到 messages 主表以便在网页列表中立即看到“发送中”的消息
    const msgStmt = db.prepare(`
        INSERT INTO messages (sender, content, received_at, device_id, is_outgoing, status)
        VALUES (?, ?, ?, ?, 1, 'pending')
    `);
    msgStmt.run(recipient, content, time, deviceId);

    return result.lastInsertRowid;
}

// 获取待发送短信
function getPendingMessages(deviceId = 'air780e_01') {
    const stmt = db.prepare(`
        SELECT * FROM outbox
        WHERE device_id = ? AND status = 'pending'
        ORDER BY created_at ASC
    `);
    return stmt.all(deviceId);
}

// 更新发送状态
function updateOutboxStatus(id, status, time) {
    // 更新 outbox 表
    const stmt = db.prepare(`
        UPDATE outbox 
        SET status = ?, sent_at = ?
        WHERE id = ?
    `);
    stmt.run(status, time, id);

    // 获取发件信息
    const outboxItem = db.prepare('SELECT * FROM outbox WHERE id = ?').get(id);
    if (outboxItem) {
        // 更新 messages 表中对应的消息状态
        const updateMsgStmt = db.prepare(`
            UPDATE messages 
            SET status = ?
            WHERE sender = ? AND content = ? AND is_outgoing = 1 AND status = 'pending'
        `);
        updateMsgStmt.run(status, outboxItem.recipient, outboxItem.content);
    }
}

// 获取发件箱列表（带状态）
function getOutboxMessages(limit = 100, offset = 0) {
    const stmt = db.prepare(`
        SELECT 
            id,
            recipient,
            content,
            device_id,
            status,
            created_at,
            sent_at
        FROM outbox
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset);
}

// === 设置操作 ===

// 获取设置
function getSetting(key) {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get(key);
    return row ? row.value : null;
}

// 设置值
function setSetting(key, value) {
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    stmt.run(key, value);
}

// 验证密码
function verifyPassword(password) {
    const storedPassword = getSetting('password');
    return password === storedPassword;
}

// 修改密码
function changePassword(newPassword) {
    setSetting('password', newPassword);
}

// === 管理员操作 ===

// 检查是否已初始化管理员
function isAdminInitialized() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM admin');
    const row = stmt.get();
    return row.count > 0;
}

// 首次设置管理员
function initAdmin(username, password) {
    const stmt = db.prepare('INSERT INTO admin (username, password) VALUES (?, ?)');
    const result = stmt.run(username, password);
    return result.lastInsertRowid;
}

// 验证管理员登录
function verifyAdmin(username, password) {
    const stmt = db.prepare('SELECT * FROM admin WHERE username = ? AND password = ?');
    const row = stmt.get(username, password);
    return row || null;
}

// 获取管理员信息
function getAdmin() {
    const stmt = db.prepare('SELECT id, username, created_at FROM admin LIMIT 1');
    return stmt.get() || null;
}

// 修改管理员密码
function changeAdminPassword(username, oldPassword, newPassword) {
    const admin = verifyAdmin(username, oldPassword);
    if (!admin) return false;
    const stmt = db.prepare('UPDATE admin SET password = ? WHERE id = ?');
    stmt.run(newPassword, admin.id);
    return true;
}

// === 子账号操作 ===

// 获取所有子账号
function getSubAccounts() {
    const stmt = db.prepare('SELECT id, password, filter_type, filter_value, description, created_at FROM sub_accounts ORDER BY created_at DESC');
    return stmt.all();
}

// 添加子账号
function addSubAccount(password, filterType, filterValue, description) {
    const stmt = db.prepare('INSERT INTO sub_accounts (password, filter_type, filter_value, description) VALUES (?, ?, ?, ?)');
    const result = stmt.run(password, filterType, filterValue || null, description || null);
    return result.lastInsertRowid;
}

// 更新子账号
function updateSubAccount(id, password, filterType, filterValue, description) {
    const stmt = db.prepare('UPDATE sub_accounts SET password = ?, filter_type = ?, filter_value = ?, description = ? WHERE id = ?');
    stmt.run(password, filterType, filterValue || null, description || null, id);
}

// 删除子账号
function deleteSubAccount(id) {
    const stmt = db.prepare('DELETE FROM sub_accounts WHERE id = ?');
    stmt.run(id);
}

// 根据密码查找子账号
function getSubAccountByPassword(password) {
    const stmt = db.prepare('SELECT * FROM sub_accounts WHERE password = ?');
    return stmt.get(password) || null;
}

// === 带筛选的短信查询 ===

// 构建筛选 WHERE 子句
function buildFilterClause(filterType, filterValue) {
    if (!filterType || filterType === 'all') {
        return { clause: '', params: [] };
    }
    if (filterType === 'content_contains' && filterValue) {
        return { clause: ' AND content LIKE ?', params: [`%${filterValue}%`] };
    }
    if (filterType === 'sender_match' && filterValue) {
        return { clause: ' AND sender LIKE ?', params: [`%${filterValue}%`] };
    }
    return { clause: '', params: [] };
}

// 获取过滤后的会话列表
function getFilteredConversations(filterType, filterValue) {
    const filter = buildFilterClause(filterType, filterValue);
    const stmt = db.prepare(`
        SELECT 
            m.sender as phone,
            m.content as lastMessage,
            m.received_at as lastTime,
            m.is_outgoing as isOutgoing,
            counts.messageCount
        FROM messages m
        INNER JOIN (
            SELECT sender, MAX(id) as maxId, COUNT(*) as messageCount
            FROM messages
            WHERE 1=1 ${filter.clause}
            GROUP BY sender
        ) counts ON m.id = counts.maxId
        ORDER BY m.received_at DESC, m.id DESC
    `);
    return stmt.all(...filter.params);
}

// 获取过滤后的某号码消息
function getFilteredMessagesByPhone(phone, filterType, filterValue) {
    const filter = buildFilterClause(filterType, filterValue);
    const stmt = db.prepare(`
        SELECT 
            id,
            sender,
            content,
            received_at as time,
            is_outgoing as isOutgoing,
            status
        FROM messages
        WHERE sender = ? ${filter.clause}
        ORDER BY received_at ASC
    `);
    return stmt.all(phone, ...filter.params);
}

// 获取过滤后的所有短信
function getFilteredMessages(filterType, filterValue, limit = 100, offset = 0) {
    const filter = buildFilterClause(filterType, filterValue);
    const stmt = db.prepare(`
        SELECT * FROM messages
        WHERE 1=1 ${filter.clause}
        ORDER BY received_at DESC
        LIMIT ? OFFSET ?
    `);
    return stmt.all(...filter.params, limit, offset);
}

// 初始化
initDatabase();

module.exports = {
    db,
    saveMessage,
    getConversations,
    getMessagesByPhone,
    getAllMessages,
    addToOutbox,
    getPendingMessages,
    updateOutboxStatus,
    getOutboxMessages,
    getSetting,
    setSetting,
    verifyPassword,
    changePassword,
    // 管理员
    isAdminInitialized,
    initAdmin,
    verifyAdmin,
    getAdmin,
    changeAdminPassword,
    // 子账号
    getSubAccounts,
    addSubAccount,
    updateSubAccount,
    deleteSubAccount,
    getSubAccountByPassword,
    // 筛选查询
    getFilteredConversations,
    getFilteredMessagesByPhone,
    getFilteredMessages
};

