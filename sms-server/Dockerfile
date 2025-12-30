FROM node:18-alpine

WORKDIR /app

# 安装 SQLite 编译依赖
RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm install --production

COPY . .

# 创建数据目录
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
