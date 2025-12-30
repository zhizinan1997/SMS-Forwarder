-- ==========================================
--          SMS-Forwarder 入口程序
-- ==========================================

PROJECT = "air780e_forwarder"
VERSION = "1.0.0"

-- 设置日志级别
log.setLevel("DEBUG")
log.info("main", PROJECT, VERSION)
log.info("main", "开机原因", pm.lastReson())

sys = require "sys"
sysplus = require "sysplus"

-- [硬件保障]
-- 初始化看门狗 (9秒)，防止程序死循环或由于未知原因卡死
wdt.init(9000)
-- 启动定时任务进行喂狗 (每3秒一次)
sys.timerLoopStart(wdt.feed, 3000)

-- [网络基础配置]
-- 设置公共 DNS，提高网络访问稳定性
socket.setDNS(nil, 1, "119.29.29.29")
socket.setDNS(nil, 2, "223.5.5.5")

-- 设置 SIM 自动恢复机制，降低因信号差导致的掉网概论
mobile.setAuto(1000 * 10)

-- 开启 IPv6 支持，适配当前主流运营商网络
mobile.ipv6(true)

-- [按键控制 (POWERKEY)]
-- 处理电源键的短按与长按逻辑
local button_last_press_time, button_last_release_time = 0, 0
gpio.setup(
    35,
    function()
        local current_time = mcu.ticks()
        -- 按下瞬间记录时间
        if gpio.get(35) == 0 then
            button_last_press_time = current_time
            return
        end
        -- 释放时逻辑处理
        if button_last_press_time == 0 then -- 异常状态: 开机前已按下
            return
        end
        if current_time - button_last_release_time < 250 then -- 消抖与防止连按
            return
        end
        local duration = current_time - button_last_press_time -- 计算按键持续时长
        button_last_release_time = current_time
        
        -- 根据时长区分长短按并发布系统事件
        if duration > 2000 then
            log.debug("EVENT.POWERKEY_LONG_PRESS", duration)
            sys.publish("POWERKEY_LONG_PRESS", duration)
        elseif duration > 50 then
            log.debug("EVENT.POWERKEY_SHORT_PRESS", duration)
            sys.publish("POWERKEY_SHORT_PRESS", duration)
        end
    end,
    gpio.PULLUP
)

-- [模块加载]
config = require "config"
util_http = require "util_http"
util_netled = require "util_netled"
util_mobile = require "util_mobile"
util_location = require "util_location"
util_notify = require "util_notify"
util_server = require "util_server"

-- [事件订阅]
-- 注册短信发送结果回调: 模块尝试发送短信后会进入此处
sys.subscribe("SMS_SEND_RESULT", function(result, phone)
    log.info("main", "SMS_SEND_RESULT", "result:", result, "phone:", phone)
    -- 如果配置了后端服务器，将发送结果上报
    if util_server and util_server.onSmsSent then
        util_server.onSmsSent(result, phone or "")
    end
end)

-- [短信接收处理]
-- 当模块收到新短信时触发执行
sms.setNewSmsCb(
    function(sender_number, sms_content, m)
        local time = string.format("%d/%02d/%02d %02d:%02d:%02d", m.year + 2000, m.mon, m.day, m.hour, m.min, m.sec)
        log.info("smsCallback", time, sender_number, sms_content)

        -- 解析短信控制命令: 即通过发送特定格式短信由本设备代发短信
        -- 格式: SMS,接收号码,内容
        local is_sms_ctrl = false
        local receiver_number, sms_content_to_be_sent = sms_content:match("^SMS,(+?%d+),(.+)$")
        receiver_number, sms_content_to_be_sent = receiver_number or "", sms_content_to_be_sent or ""
        if sms_content_to_be_sent ~= "" and receiver_number ~= "" and #receiver_number >= 5 and #receiver_number <= 20 then
            sms.send(receiver_number, sms_content_to_be_sent)
            is_sms_ctrl = true
        end

        -- 将收到的短信内容加入推送队列
        util_notify.add(
            {
                sms_content,
                "",
                "发件号码: " .. sender_number,
                "发件时间: " .. time,
                "#SMS" .. (is_sms_ctrl and " #CTRL" or "")
            },
            nil,  -- channels, 使用 config 中的默认设置
            { sender = sender_number, time = time }  -- extra_data: 传递给后端服务器的元数据
        )
    end
)

-- [核心业务任务]
sys.taskInit(
    function()
        -- 核心逻辑等待联网后再执行
        sys.waitUntil("IP_READY")

        util_netled.init()  -- 初始化联网指示灯
        util_server.init()  -- 启动后端轮询任务（获取待发短信）

        -- 发送开机通知
        if config.BOOT_NOTIFY then
            util_notify.add("#BOOT")
        end

        -- 启动定时查询流量任务 (如已配置)
        if config.QUERY_TRAFFIC_INTERVAL and config.QUERY_TRAFFIC_INTERVAL >= 1000 * 60 then
            sys.timerLoopStart(util_mobile.queryTraffic, config.QUERY_TRAFFIC_INTERVAL)
        end

        -- 启动定时基站定位任务 (如已配置)
        if config.LOCATION_INTERVAL and config.LOCATION_INTERVAL >= 1000 * 30 then
            sys.timerLoopStart(util_location.refresh, config.LOCATION_INTERVAL, 30)
        end

        -- 订阅按键事件，绑定对应功能
        sys.subscribe(
            "POWERKEY_SHORT_PRESS",
            function()
                util_notify.add("#ALIVE") -- 短按发送“在线”心跳通知
            end
        )
        sys.subscribe("POWERKEY_LONG_PRESS", util_mobile.queryTraffic) -- 长按手动触发流量查询

        -- [省电策略]
        -- 如果开启了低功耗模式，经过一段缓冲期后关闭非必要外设并进入休眠
        if config.LOW_POWER_MODE then
            sys.wait(1000 * 15)
            log.warn("main", "即将进入低功耗模式，USB 串口将关闭")
            sys.wait(1000 * 5)
            gpio.setup(23, nil)
            gpio.close(33)
            pm.power(pm.USB, false)  -- 关闭 USB 总线，断开调试连接
            pm.power(pm.GPS, false)
            pm.power(pm.GPS_ANT, false)
            pm.power(pm.DAC_EN, false)
            pm.force(pm.LIGHT)      -- 进入轻度休眠，但保持网络连接
        end
    end
)

-- 启动 LuatOS 系统主循环
sys.run()
