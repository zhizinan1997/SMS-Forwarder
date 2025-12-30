// ==========================================
//          SMS-Forwarder 后端主程序
//    支持 REST API 接收短信、管理发件箱及 WebSocket 推送
// ==========================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const db = require('./database');

const app = express();
const server = http.createServer(app);

// 初始化 WebSocket 服务
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;

// [中间件配置]
app.use(cors()); // 启用跨域支持
app.use(express.json()); // 解析 JSON 请求体
app.use(express.static(path.join(__dirname, 'public'))); // 托管前端静态文件

/**
 * 标准化手机号格式
 * 为保证匹配准确，将中国大陆手机号统一格式化为 +861xxxxxxxxxx
 */
function normalizePhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') return null;

    // 去除所有无效符号
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');

    // 去除已有的 +86 或 86 前缀，以便统一处理
    if (cleaned.startsWith('+86')) {
        cleaned = cleaned.substring(3);
    } else if (cleaned.startsWith('86') && cleaned.length === 13) {
        cleaned = cleaned.substring(2);
    }

    // 验证逻辑: 必须是 11 位纯数字
    if (!/^\d{11}$/.test(cleaned)) {
        // 短号处理 (如 10086)
        if (/^\d{3,10}$/.test(cleaned)) {
            return cleaned;
        }
        console.warn('无效手机号格式:', phone);
        return null;
    }

    return '+86' + cleaned;
}

// 简单的 Session 内存存储
const sessions = new Map();

// 生成随机 Session Token
function generateToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * 认证中间件
 * 用于保护需要登录才能访问的 API 导出
 */
function authMiddleware(req, res, next) {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    // 检查 Token 是否存在且未过期
    if (!token || !sessions.has(token)) {
        return res.status(401).json({ error: '未授权，请先登录' });
    }
    // 续期 Session
    sessions.set(token, Date.now() + 24 * 60 * 60 * 1000);
    next();
}

// 清理过期 session
setInterval(() => {
    const now = Date.now();
    for (const [token, expiresAt] of sessions) {
        if (now > expiresAt) {
            sessions.delete(token);
        }
    }
}, 60 * 1000); // 每分钟清理一次

// ==================== WebSocket 实时推送 ====================

// 广播消息给所有在线的网页客户端
function broadcast(type, data) {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// WebSocket 连接建立处理
wss.on('connection', (ws) => {
    console.log(`[${new Date().toLocaleString()}] 新的浏览器连接`);

    ws.send(JSON.stringify({ type: 'connected', data: { message: '服务器连接成功' } }));

    ws.on('close', () => {
        console.log(`[${new Date().toLocaleString()}] 浏览器已断开`);
    });

    ws.on('error', (err) => {
        console.error('WebSocket 错误:', err);
    });
});

// ==================== 认证接口 ====================

// 登录
app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: '请输入密码' });
    }

    if (db.verifyPassword(password)) {
        const token = generateToken();
        sessions.set(token, Date.now() + 24 * 60 * 60 * 1000); // 24小时有效
        res.json({ success: true, token });
    } else {
        res.status(401).json({ error: '密码错误' });
    }
});

// 登出
app.post('/api/auth/logout', (req, res) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (token) {
        sessions.delete(token);
    }
    res.json({ success: true });
});

// 修改密码
app.post('/api/auth/change-password', authMiddleware, (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: '请输入旧密码和新密码' });
    }

    if (!db.verifyPassword(oldPassword)) {
        return res.status(401).json({ error: '旧密码错误' });
    }

    if (newPassword.length < 4) {
        return res.status(400).json({ error: '新密码至少4位' });
    }

    db.changePassword(newPassword);
    res.json({ success: true, message: '密码修改成功' });
});

// 检查登录状态
app.get('/api/auth/check', authMiddleware, (req, res) => {
    res.json({ success: true, authenticated: true });
});

// ==================== 短信接收接口 ====================

/**
 * 接收来自模块设备推送的短信
 * (此接口不校验 Bearer 令牌，以便设备直接访问)
 */
app.post('/api/sms/receive', (req, res) => {
    const { sender, content, time, device_id } = req.body;

    if (!sender || !content) {
        return res.status(400).json({ error: '参数不完整' });
    }

    const receivedAt = time || new Date().toLocaleString('zh-CN');
    const deviceId = device_id || 'air780e_01';

    try {
        // 存储至数据库
        const id = db.saveMessage(sender, content, receivedAt, deviceId);
        console.log(`[${new Date().toLocaleString()}] 收到来自设备(${deviceId})的短信: ${sender}`);

        // 通过 WS 同步给所有打开网页的用户
        broadcast('new_message', {
            id,
            sender,
            content,
            time: receivedAt,
            device_id: deviceId
        });

        res.json({ success: true, id });
    } catch (error) {
        console.error('数据库保存失败:', error);
        res.status(500).json({ error: '系统错误' });
    }
});

// 获取会话列表
app.get('/api/sms/conversations', authMiddleware, (req, res) => {
    try {
        const conversations = db.getConversations();
        res.json({ success: true, data: conversations });
    } catch (error) {
        console.error('获取会话列表失败:', error);
        res.status(500).json({ error: '获取失败' });
    }
});

// 获取与某个号码的对话
app.get('/api/sms/messages/:phone', authMiddleware, (req, res) => {
    const { phone } = req.params;

    try {
        const messages = db.getMessagesByPhone(phone);
        res.json({ success: true, data: messages });
    } catch (error) {
        console.error('获取消息失败:', error);
        res.status(500).json({ error: '获取失败' });
    }
});

// 获取所有短信
app.get('/api/sms/list', authMiddleware, (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    try {
        const messages = db.getAllMessages(limit, offset);
        res.json({ success: true, data: messages });
    } catch (error) {
        console.error('获取短信列表失败:', error);
        res.status(500).json({ error: '获取失败' });
    }
});

// [WEB 端请求] 创建由于本设备发出的短信任务
app.post('/api/sms/send', authMiddleware, (req, res) => {
    const { recipient, content, device_id } = req.body;

    if (!recipient || !content) {
        return res.status(400).json({ error: '收件人和内容不能为空' });
    }

    // 格式化号码
    const normalizedRecipient = normalizePhoneNumber(recipient);
    if (!normalizedRecipient) {
        return res.status(400).json({ error: '无效的手机号码' });
    }

    const deviceId = device_id || 'air780e_01';

    try {
        // 存入代发队列 (Outbox)
        const id = db.addToOutbox(normalizedRecipient, content, deviceId);
        console.log(`[发送任务已入库] -> ${normalizedRecipient}`);

        // WS 通知前端状态已变更
        broadcast('send_queued', { id, recipient: normalizedRecipient, content });

        res.json({ success: true, id, message: '已加入待发送队列' });
    } catch (error) {
        console.error('入库失败:', error);
        res.status(500).json({ error: '系统入库失败' });
    }
});

// 设备轮询待发送短信
app.get('/api/sms/pending', (req, res) => {
    const deviceId = req.query.device_id || 'air780e_01';

    try {
        const pending = db.getPendingMessages(deviceId);
        res.json({ success: true, data: pending });
    } catch (error) {
        console.error('获取待发送短信失败:', error);
        res.status(500).json({ error: '获取失败' });
    }
});

// 获取发件箱列表（带发送状态）
app.get('/api/sms/outbox', authMiddleware, (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    try {
        const messages = db.getOutboxMessages(limit, offset);
        res.json({ success: true, data: messages });
    } catch (error) {
        console.error('获取发件箱失败:', error);
        res.status(500).json({ error: '获取失败' });
    }
});

// 设备回报发送结果
app.post('/api/sms/sent', (req, res) => {
    const { id, status } = req.body;

    if (!id || !status) {
        return res.status(400).json({ error: '缺少必要参数: id, status' });
    }

    try {
        db.updateOutboxStatus(id, status);
        console.log(`[${new Date().toLocaleString()}] 短信发送状态更新: ID=${id}, status=${status}`);

        // 广播发送状态更新
        broadcast('send_status', { id, status });

        res.json({ success: true });
    } catch (error) {
        console.error('更新发送状态失败:', error);
        res.status(500).json({ error: '更新失败' });
    }
});

// ==================== 启动服务器 ====================

server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════╗
║       SMS Web Platform 已启动              ║
╠════════════════════════════════════════════╣
║  访问地址: http://localhost:${PORT}            ║
║  默认密码: admin                           ║
║  WebSocket: ws://localhost:${PORT}             ║
╚════════════════════════════════════════════╝
    `);
});
