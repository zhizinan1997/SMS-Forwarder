-- ==========================================
--          后端通信模块 (util_server)
--  负责与 Node.js 后端同步状态和代发短信任务
-- ==========================================

local util_server = {}

-- 发送结果追踪缓存，用于匹配短信发送异步回调
local send_results = {}

--- [私有] 从后端获取待发送短信列表
-- @return table 待发送短信列表
local function getPendingMessages()
    local url = config.SERVER_API .. "/api/sms/pending?device_id=" .. (config.DEVICE_ID or "air780e_01")
    log.info("util_server", "GET", url)
    
    local code, headers, body = util_http.fetch(nil, "GET", url)
    
    -- HTTP 200 且 body 存在时解析返回的 JSON
    if code == 200 and body then
        local ok, data = pcall(json.decode, body)
        if ok and data and data.success and data.data then
            return data.data
        end
    end
    
    log.warn("util_server", "获取待发送短信失败", "code:", code)
    return {}
end

--- [私有] 向后端上报短信最终发送结果
-- @param id number 后端分配的任务 ID
-- @param status string 发送状态 (sent 或 failed)
local function reportSendResult(id, status)
    local url = config.SERVER_API .. "/api/sms/sent"
    local header = {
        ["Content-Type"] = "application/json; charset=utf-8"
    }
    local body = json.encode({
        id = id,
        status = status
    })
    
    log.info("util_server", "POST", url, "id:", id, "status:", status)
    local code, _, resp = util_http.fetch(nil, "POST", url, header, body)
    
    if code == 200 then
        log.info("util_server", "发送状态上报成功")
    else
        log.warn("util_server", "发送状态上报失败", "code:", code)
    end
end

--- [私有] 清理手机号中的无关符号
-- @param phone string 原始号码
-- @return string 处理后的号码
local function cleanPhoneNumber(phone)
    if not phone or phone == "" then return nil end
    
    -- 正则去除 空格、连字符、括号
    local cleaned = phone:gsub("[%s%-%(%)]+", "")
    
    if cleaned == "" then return nil end
    
    log.info("util_server", "清理手机号", phone, "->", cleaned)
    return cleaned
end

--- [私有] 发送短信并追踪其发送结果回调
-- 由于短信发送是异步过程，此方法通过循环等待回调来确认结果
-- @param id number 任务 ID
-- @param recipient string 接收人
-- @param content string 短信内容
local function sendSmsWithCallback(id, recipient, content)
    -- 号码二次清理，确保合规
    local cleanedRecipient = cleanPhoneNumber(recipient)
    if not cleanedRecipient then
        log.error("util_server", "无效手机号", recipient)
        reportSendResult(id, "failed")
        return
    end
    
    log.info("util_server", "执行代发短信", "id:", id, "to:", cleanedRecipient, "content:", content:sub(1, 30))
    
    -- 将此 ID 存入追踪列表，设置为 pending 状态
    send_results[id] = {
        recipient = cleanedRecipient,
        status = "pending",
        time = os.time()
    }
    
    -- 调用底层发送接口
    local result = sms.send(cleanedRecipient, content)
    
    if not result then
        -- 接口立即返回失败（例如模块忙或参数错）
        log.error("util_server", "短信发送请求提交失败", "id:", id)
        send_results[id] = nil
        reportSendResult(id, "failed")
        return
    end
    
    log.info("util_server", "短信发送请求已提交", "id:", id, "开始等待回调...")
    
    -- 等待异步回调通知 (最多等待 30 秒)
    local timeout = 30
    local waited = 0
    while waited < timeout do
        sys.wait(1000)
        waited = waited + 1
        
        -- 检查此任务 ID 是否已被 onSmsSent 更新
        if send_results[id] and send_results[id].status ~= "pending" then
            local status = send_results[id].status
            log.info("util_server", "收到异步反馈", "id:", id, "status:", status)
            send_results[id] = nil
            reportSendResult(id, status)
            return
        end
    end
    
    -- 如果超时未收到结果，通常认为已成功发出
    log.warn("util_server", "等待发送结果超时", "id:", id, "假设已成功")
    send_results[id] = nil
    reportSendResult(id, "sent")
end

--- [供 main 调用] 处理系统发布的短信发送结果事件
-- @param sent boolean 物理层是否发送成功
-- @param phone string 对应的号码
function util_server.onSmsSent(sent, phone)
    log.info("util_server", "全域发送回调触发", "sent:", sent, "phone:", phone)
    
    -- 在当前追踪列表中寻找对应的号码
    for id, info in pairs(send_results) do
        -- 只要号码包含追踪的号码，就认为匹配成功
        if info.recipient == phone or info.recipient:find(phone, 1, true) or phone:find(info.recipient, 1, true) then
            info.status = sent and "sent" or "failed"
            log.info("util_server", "匹配到本地缓存任务", "id:", id, "status:", info.status)
            return
        end
    end
    
    log.warn("util_server", "未发现此号码的待办任务", "phone:", phone)
end

--- [私有] 单次执行处理待办列表
local function processPendingMessages()
    local pending = getPendingMessages()
    
    if #pending == 0 then
        return
    end
    
    log.info("util_server", "从后端领到", #pending, "条代发任务")
    
    for _, item in ipairs(pending) do
        sendSmsWithCallback(item.id, item.recipient, item.content)
        
        -- 短信发送间隔 (5秒)，防止触发运营商反骚扰拦截
        sys.wait(5000)
    end
end

--- [供 main 调用] 初始化服务器轮询主任务
function util_server.init()
    if not config.SERVER_API or config.SERVER_API == "" then
        log.warn("util_server", "未配置 SERVER_API，代发功能不可用")
        return
    end
    
    local interval = config.SERVER_POLL_INTERVAL or 0
    
    if interval <= 0 then
        log.info("util_server", "轮询间隔设置为 0，代发功能已关闭")
        return
    end
    
    -- 强制建议最小轮询间隔 10 秒，保护电量和数据流量
    if interval < 10000 then
        interval = 10000
        log.warn("util_server", "轮询间隔过小，已强行调整为 10 秒")
    end
    
    log.info("util_server", "代发推送轮询任务已就绪，间隔:", interval, "ms")
    
    -- 启动核心轮询协程
    sys.taskInit(function()
        -- 等待联网
        sys.waitUntil("IP_READY")
        sys.wait(5000)
        
        while true do
            processPendingMessages()
            sys.wait(interval) -- 等待下次轮询
        end
    end)
end

return util_server
