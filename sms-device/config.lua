-- ==========================================
--          SMS-Forwarder 配置文件
-- ==========================================
return {
    -- 【通知渠道配置】
    -- 可以配置多个渠道，例如 {"telegram", "server"}
    -- 支持的渠道: telegram, pushdeer, bark, dingtalk, feishu, wecom, pushover, inotify, next-smtp-proxy, smtp, gotify, server
    NOTIFY_TYPE = {"server"},

    -- 【自定义后端服务器 (sms-server) 配置】
    SERVER_API = "https://sms.zhizinan.top",      -- 配合项目中的 sms-server 地址
    DEVICE_ID = "air780e_01",                       -- 设备 ID，用于在后端区分多台设备
    SERVER_POLL_INTERVAL = 1000 * 10,               -- 轮询待发短信的间隔 (毫秒)，设置为 0 关闭

    -- 【Telegram 通知】
    TELEGRAM_PROXY_API = "",
    TELEGRAM_TOKEN = "",
    TELEGRAM_CHAT_ID = "",

    -- 【PushDeer 通知】
    PUSHDEER_API = "https://api2.pushdeer.com/message/push",
    PUSHDEER_KEY = "",

    -- 【Bark (iOS) 通知】
    BARK_API = "https://api.day.app",
    BARK_KEY = "",

    -- 【钉钉机器人】
    DINGTALK_WEBHOOK = "https://oapi.dingtalk.com/robot/send?access_token=dcc0ba8cf6a29c71e87ca6388a8b7e8c908abc3777847a3ded8a784fe8835887",

    -- 【飞书机器人】
    FEISHU_WEBHOOK = "https://open.feishu.cn/open-apis/bot/v2/hook/1579fb7d-1c02-4b70-b439-1f7a9a6635d2",

    -- 【企业微信机器人】
    WECOM_WEBHOOK = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=60a7b65d-e414-4163-bf43-c613457b2364",

    -- 【Pushover 通知】
    PUSHOVER_API_TOKEN = "",
    PUSHOVER_USER_KEY = "",

    -- 【Inotify/合宙推送】
    INOTIFY_API = "https://push.luatos.org/XXXXXX.send",

    -- 【Next-SMTP-Proxy】
    NEXT_SMTP_PROXY_API = "",
    NEXT_SMTP_PROXY_USER = "",
    NEXT_SMTP_PROXY_PASSWORD = "",
    NEXT_SMTP_PROXY_HOST = "smtp-mail.outlook.com",
    NEXT_SMTP_PROXY_PORT = 587,
    NEXT_SMTP_PROXY_FORM_NAME = "Air780E",
    NEXT_SMTP_PROXY_TO_EMAIL = "",
    NEXT_SMTP_PROXY_SUBJECT = "来自 Air780E 的通知",

    -- 【基础 SMTP 邮件】
    SMTP_HOST = "smtp.163.com",
    SMTP_PORT = 25,
    SMTP_USERNAME = "",
    SMTP_PASSWORD = "",
    SMTP_MAIL_FROM = "",
    SMTP_MAIL_TO = "",
    SMTP_MAIL_SUBJECT = "来自 Air780E 的通知",

    -- 【Gotify 通知】
    GOTIFY_API = "",
    GOTIFY_TITLE = "Air780E",
    GOTIFY_PRIORITY = 8,
    GOTIFY_TOKEN = "",

    -- 【功能控制】
    -- 定时查询流量间隔 (毫秒)
    QUERY_TRAFFIC_INTERVAL = 0,
    -- 定时基站定位间隔 (毫秒)
    LOCATION_INTERVAL = 0,
    -- 是否发送开机通知
    BOOT_NOTIFY = true,
    -- 通知内容是否追加系统状态 (流量、信号、位置等)
    NOTIFY_APPEND_MORE_INFO = true,
    -- 最大重试次数
    NOTIFY_RETRY_MAX = 3,
    -- 是否开启低功耗休眠模式 (开启后 USB 串口不可用)
    LOW_POWER_MODE = false,
}
