# ServerStatus

基于 [cppla/ServerStatus](https://github.com/cppla/ServerStatus) 的轻量级多服务器监控面板，增加节点管理、现代 Web 前端、systemd Agent 和 Telegram 上下线通知。

## 功能

- CPU、内存、磁盘、网络、流量与延迟监控
- 交互式节点增删改查
- Agent 以 systemd 服务运行并自动重连
- Telegram 上下线通知，连续状态防抖
- 明暗主题和移动端响应式面板

## 服务端安装

需要一台使用 systemd 的 Linux 服务器和 root 权限。脚本会检查 Docker、Docker Compose、curl 和 jq。

```bash
mkdir -p serverstatus && cd serverstatus
curl --fail --location https://raw.githubusercontent.com/Lau0x/ServerStatus/master/sss.sh -o sss.sh
chmod +x sss.sh
sudo ./sss.sh
```

安装完成后访问 `http://服务器IP:8081`。Agent 默认通过 TCP `35601` 上报数据。

启用 Telegram 通知时使用交互输入，Bot Token 不会出现在 Shell 历史中：

```bash
sudo ./sss.sh --telegram
```

Telegram 配置保存在权限为 `0600` 的 `.env` 中，不会写入 `docker-compose.yml`。

## 添加节点

运行 `sudo ./sss.sh`，在菜单中选择“添加节点”。脚本会输出 Agent 安装命令，并单独显示一次节点密码。到被监控服务器执行命令，在隐藏输入提示中粘贴密码即可。

Agent 凭据保存在被监控服务器的 `/etc/sss-agent.env`，权限为 `0600`，不会出现在 systemd `ExecStart` 或进程参数中。

## 更新

服务端更新会保留 `config.json`、`.env` 和历史监控数据：

```bash
curl --fail --location https://raw.githubusercontent.com/Lau0x/ServerStatus/master/sss.sh -o sss.sh
chmod +x sss.sh
sudo ./sss.sh --upgrade
```

每次增删改节点前都会生成一个 `config.json.bak` 备份。

## 安全建议

- 公网部署时使用 HTTPS 反向代理，并为面板增加访问控制。
- 如果只通过本机反向代理访问面板，在 `.env` 中设置 `SSS_WEB_BIND=127.0.0.1`。
- TCP `35601` 当前沿用上游明文协议，建议通过 WireGuard、Tailscale 或受控防火墙连接 Agent。
- 不要提交 `.env`、`config.json` 或 `json/` 目录；这些路径已加入 `.gitignore`。

## 本地检查

```bash
bash -n sss.sh agent/sss-agent.sh
python3 -m unittest discover -s tests -v
node --check service/web/js/app.js
docker compose config --quiet
```

项目使用 MIT License。
