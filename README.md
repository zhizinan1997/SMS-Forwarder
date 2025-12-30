# 📱 SMS-Forwarder | DT718H 短信转发助手

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Supported-blue.svg)](https://www.docker.com/)
[![Web UI](https://img.shields.io/badge/UI-iOS--Style-FF3B30.svg)]()

> 基于 DT718H 4G 模组的高性能短信转发系统，支持多渠道通知推送和 iOS 体验的 Web 管理界面。

## 📁 项目结构

```
├── sms-device/         # 设备端 Lua 脚本 (刷入 DT718H)
├── sms-server/         # Web 服务器 (部署到云服务器)
├── soc/                # LuatOS 固件
├── tools/              # 刷机工具 (Luatools)
├── FILE_NOTES.md       # 项目代码审查与各文件详细备注
└── README.md           # 本文档
```

---

## 🚀 快速开始

### 第一步：部署 Web 服务器

#### 方式一：使用 GitHub Container Registry (推荐)

```bash
# 拉取最新镜像 (支持 amd64/arm64)
docker pull ghcr.io/zhizinan1997/sms-server:latest

# 启动容器
docker run -d \
  --name sms-server \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e TZ=Asia/Shanghai \
  --restart unless-stopped \
  ghcr.io/zhizinan1997/sms-server:latest
```

> 💡 镜像支持 `linux/amd64` 和 `linux/arm64` 架构，可在 x86 服务器或树莓派等 ARM 设备上运行。

#### 方式二：本地构建镜像

```bash
cd sms-server

# 使用 docker-compose 构建并启动
docker-compose up -d --build
```

#### 方式三：导入预构建镜像包

```bash
cd sms-server
docker load -i sms-server.tar
docker run -d \
  --name sms-server \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e TZ=Asia/Shanghai \
  --restart unless-stopped \
  sms-server-sms-server:latest
```

4. 访问 `http://你的服务器IP:3000`，默认密码：`admin`

### 第二步：刷入设备脚本

1. 安装刷机工具：运行 `tools/Luatools_v3.exe`

2. 连接 Air780E 设备到电脑 USB

3. 在 Luatools 中：
   - 选择 "项目管理" → "创建项目"
   - 选择底层固件：`soc/LuatOS-SoC_DT718H.soc`
   - 添加脚本：`sms-device/` 目录下所有 `.lua` 文件
   - 点击 "下载" 刷入设备

4. 修改配置后重新刷入生效

---

## ⚙️ 设备配置说明

编辑 `sms-device/config.lua`：

### 通知渠道配置

```lua
-- 支持同时配置多个渠道
NOTIFY_TYPE = {"dingtalk", "server"},
```

可选渠道：`telegram`, `pushdeer`, `bark`, `dingtalk`, `feishu`, `wecom`, `pushover`, `inotify`, `smtp`, `gotify`, `server`

### Web 服务器推送配置

```lua
SERVER_API = "http://你的服务器IP:3000",  -- 服务器地址
DEVICE_ID = "dt718h_01",                  -- 设备标识ID
SERVER_POLL_INTERVAL = 1000 * 10,          -- 轮询间隔(毫秒), 0=关闭
```

### 钉钉机器人配置

```lua
DINGTALK_WEBHOOK = "https://oapi.dingtalk.com/robot/send?access_token=xxx",
```

### 飞书机器人配置

```lua
FEISHU_WEBHOOK = "https://open.feishu.cn/open-apis/bot/v2/hook/xxx",
```

### 企业微信机器人配置

```lua
WECOM_WEBHOOK = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx",
```

### Bark 推送配置 (iOS)

```lua
BARK_API = "https://api.day.app",
BARK_KEY = "你的key",
```

### SMTP 邮件配置

```lua
SMTP_HOST = "smtp.163.com",
SMTP_PORT = 25,
SMTP_USERNAME = "your@163.com",
SMTP_PASSWORD = "授权码",
SMTP_MAIL_FROM = "your@163.com",
SMTP_MAIL_TO = "receive@example.com",
SMTP_MAIL_SUBJECT = "来自 DT718H 的通知",
```

### 其他设置

```lua
BOOT_NOTIFY = true,              -- 开机发送通知
NOTIFY_APPEND_MORE_INFO = true,  -- 追加设备信息(IMEI、信号等)
NOTIFY_RETRY_MAX = 3,            -- 通知失败重试次数
LOCATION_INTERVAL = 0,           -- 基站定位间隔(毫秒), 0=关闭
LOW_POWER_MODE = false,          -- 低功耗模式
```

---

## 🖥️ Web 管理界面

### 功能特性

- 📱 iOS 风格 UI，支持深色/浅色模式
- 🔄 WebSocket 实时更新
- 💬 查看短信会话列表
- 📤 发送短信（自动标准化手机号格式）
- 🔒 密码登录保护
- 📱 PWA 支持，可添加到手机桌面

### Docker 常用命令

```bash
# 查看容器日志
docker logs -f sms-server

# 停止容器
docker stop sms-server

# 启动容器
docker start sms-server

# 重启容器
docker restart sms-server

# 删除容器
docker rm -f sms-server
```

### API 接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/login` | 登录 | 否 |
| POST | `/api/auth/change-password` | 修改密码 | 是 |
| GET | `/api/sms/conversations` | 获取会话列表 | 是 |
| GET | `/api/sms/messages/:phone` | 获取对话消息 | 是 |
| POST | `/api/sms/send` | 发送短信请求 | 是 |
| GET | `/api/sms/outbox` | 获取发件箱 | 是 |
| POST | `/api/sms/receive` | 设备推送短信 | 否 |
| GET | `/api/sms/pending` | 设备获取待发任务 | 否 |
| POST | `/api/sms/sent` | 设备回报发送结果 | 否 |

---

## 📂 文件说明

### sms-device/

| 文件 | 说明 |
|------|------|
| `main.lua` | 主入口，初始化和短信接收处理 |
| `config.lua` | 配置文件 |
| `util_notify.lua` | 多渠道通知推送模块 |
| `util_server.lua` | 服务器通信模块 (推送短信、轮询待发) |
| `lib_smtp.lua` | SMTP 邮件发送库 |
| `util_location.lua` | 基站定位模块 |
| `util_mobile.lua` | 手机号/IMEI/运营商信息 |
| `util_netled.lua` | 网络状态 LED 指示 |
| `util_http.lua` | HTTP 请求工具 |

### sms-server/

| 文件 | 说明 |
|------|------|
| `server.js` | Express REST API + WebSocket 服务 |
| `database.js` | SQLite 数据库操作 |
| `public/index.html` | 前端页面 |
| `public/style.css` | iOS 风格样式表 |
| `public/app.js` | 前端交互逻辑 |
| `public/manifest.json` | PWA 配置 |
| `public/logo.png` | 应用图标 |

---

## 🔄 工作流程

```
┌─────────────┐     短信推送      ┌─────────────┐     网页查看
│  Air780E    │ ───────────────► │  Web 服务器  │ ◄───────────── 用户
│  设备端     │                   │  (Docker)   │
│             │ ◄─────────────── │             │ ───────────── 用户
└─────────────┘    轮询待发任务    └─────────────┘    发送短信请求
       │                                │
       │          发送短信              │
       └────────────────────────────────┘
```

1. **收短信**: 设备收到短信 → 推送到服务器 → WebSocket 实时通知网页
2. **发短信**: 用户在网页提交 → 服务器标准化号码并存入队列 → 设备轮询获取 → 设备发送 → 回报结果

---


## ⚠️ 注意事项

1. **流量消耗**: 每条通知会消耗移动网络流量，建议使用物联网卡
2. **安全性**: 生产环境请修改默认密码，建议配置 HTTPS
3. **防火墙**: 确保服务器 3000 端口对外开放
4. **时区**: Docker 容器已配置为 `Asia/Shanghai` 时区
5. **手机号格式**: 系统自动将各种格式转换为 `+86XXXXXXXXXXX` 标准格式

---


## 文件目录结构及说明

### 1. 硬件端 (sms-device)
基于 LuatOS 开发，负责短信接收、网络连接和多种渠道的通知。

- **[main.lua](file:///c:/Users/Administrator/Downloads/SMS-Forwarder/sms-device/main.lua)**: 项目入口文件。负责系统初始化、硬件控制（看门狗、按键）、短信回调注册以及启动各个功能任务。
- **[config.lua](file:///c:/Users/Administrator/Downloads/SMS-Forwarder/sms-device/config.lua)**: 全局配置文件。包含了通知渠道设置、API 地址、SMTP 配置、定位间隔等参数。
- **[util_notify.lua](file:///c:/Users/Administrator/Downloads/SMS-Forwarder/sms-device/util_notify.lua)**: 核心通知模块。支持 Telegram, SMTP, Bark, Gotify, DingTalk 等多种推送方式，并实现了失败重试的消息队列。
- **[util_server.lua](file:///c:/Users/Administrator/Downloads/SMS-Forwarder/sms-device/util_server.lua)**: 与后端服务器通信的模块。负责从服务器获取待发送短信（Outbox）并上报发送结果。
- **[util_mobile.lua](file:///c:/Users/Administrator/Downloads/SMS-Forwarder/sms-device/util_mobile.lua)**: 移动网络工具类。用于获取运营商信息、信号强度、流量统计等。
- **[util_location.lua](file:///c:/Users/Administrator/Downloads/SMS-Forwarder/sms-device/util_location.lua)**: 地理位置模块。通过基站信息进行定位，并返回地图链接。
- **[util_netled.lua](file:///c:/Users/Administrator/Downloads/SMS-Forwarder/sms-device/util_netled.lua)**: 网络指示灯控制。通过闪烁频率反馈网络状态（未联网、已联网）。
- **[util_http.lua](file:///c:/Users/Administrator/Downloads/SMS-Forwarder/sms-device/util_http.lua)**: HTTP 请求封装库。提供基础的 GET/POST 操作。
- **[lib_smtp.lua](file:///c:/Users/Administrator/Downloads/SMS-Forwarder/sms-device/lib_smtp.lua)**: SMTP 协议实现。用于通过邮件服务器发送短信内容。

### 2. 服务器端 (sms-server)
基于 Node.js Express 框架，提供短信存储、网页查看和转发任务管理。

- **[server.js](file:///c:/Users/Administrator/Downloads/SMS-Forwarder/sms-server/server.js)**: 后端主进程。处理 RESTful API（登录、短信接收、会话列表、发送请求）和 WebSocket 实时推送。
- **[database.js](file:///c:/Users/Administrator/Downloads/SMS-Forwarder/sms-server/database.js)**: 数据库操作层。使用 SQLite 存储短信内容、设置及待发送队列。
- **public/**: 前端静态资源目录。包含网页界面逻辑（通常是 HTML/JS/CSS）。
- **[Dockerfile](file:///c:/Users/Administrator/Downloads/SMS-Forwarder/sms-server/Dockerfile)**: Docker 镜像配置文件，方便一键部署。
- **[docker-compose.yml](file:///c:/Users/Administrator/Downloads/SMS-Forwarder/sms-server/docker-compose.yml)**: Docker 编排配置，定义服务容器及其数据卷挂载。

---

## 代码审查建议

1. **安全性**:
   - `server.js` 中使用了简单的静态密码，建议在生产环境增加密码哈希存储。
   - `config.lua` 中包含敏感信息（Token, 密码），应提醒用户保护此文件或使用环境变量（在服务器端）。

2. **健壮性**:
   - `util_notify.lua` 已经实现了重试机制，非常优秀。但在极端弱网环境下，可以考虑持久化存储待发消息。
   - `database.js` 应该在启动时检查并创建 `data` 目录（已实现）。

3. **可维护性**:
   - 目前注释较为详尽，但在某些复杂的逻辑块（如 `lib_smtp.lua`）可以增加更详细的协议解释。
   - 建议增加日志分级管理，避免生产环境输出过多调试信息。

## � 致谢

本项目基于以下项目二次开发：

- [【解决方案】合宙air780e硬件实现短信转发 最终版本](https://www.yuque.com/pengzhiqiang999/xiaokenai/bhzrqf68i9i07qac) - 感谢 @pengzhiqiang999 提供的原始方案

---

## �📄 许可证

MIT License
