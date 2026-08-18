#!/bin/bash

set -u

#========================================================
#   System Required: CentOS 7+ / Debian 8+ / Ubuntu 16+ /
#     Arch 未测试
#   Description: Server Status 监控安装 + 节点管理脚本
#   Github: https://github.com/Lau0x/ServerStatus
#========================================================

GITHUB_RAW_URL="${SSS_RAW_BASE:-https://raw.githubusercontent.com/Lau0x/ServerStatus/master}"
CONFIG_FILE="config.json"
COMPOSE_CMD=()
FORCE_INSTALL=0

# ---- 颜色(真实 ESC 字符, printf/echo 通用) ----
red=$'\e[0;31m'
green=$'\e[0;32m'
yellow=$'\e[0;33m'
blue=$'\e[0;34m'
cyan=$'\e[0;36m'
bold=$'\e[1m'
dim=$'\e[2m'
plain=$'\e[0m'
export PATH="${PATH}:/usr/local/bin"

# ---- UI 助手 ----
banner() {
    printf '%s\n' "${cyan}${bold}"
    cat <<'EOF'
   ____                          ____  _        _
  / ___|  ___ _ ____   _____ _ _/ ___|| |_ __ _| |_ _   _ ___
  \___ \ / _ \ '__\ \ / / _ \ '__\___ \| __/ _` | __| | | / __|
   ___) |  __/ |   \ V /  __/ |   ___) | || (_| | |_| |_| \__ \
  |____/ \___|_|    \_/ \___|_|  |____/ \__\__,_|\__|\__,_|___/
EOF
    printf '%s\n' "${plain}${dim}  最简洁的探针 · ServerStatus 面板管理${plain}"
}
line() { printf '%s\n' "${dim}  ────────────────────────────────────────────${plain}"; }
info() { printf '%s\n' "${cyan}[*]${plain} $*"; }
ok()   { printf '%s\n' "${green}[✓]${plain} $*"; }
warn() { printf '%s\n' "${yellow}[!]${plain} $*"; }
err()  { printf '%s\n' "${red}[✗]${plain} $*"; }
step() { printf '\n%s\n' "${blue}${bold}»${plain} ${bold}$*${plain}"; }
ask()  { printf '%s' "${cyan}»${plain} $* "; }
pause(){ printf '\n%s' "${dim}按回车继续…${plain}"; read -r _; }
die()  { err "$*"; exit 1; }

download_file() {
    local url="$1" destination="$2"
    if ! curl --fail --show-error --silent --location \
        --retry 3 --connect-timeout 10 --output "$destination" "$url"; then
        die "文件下载失败：${url}"
    fi
    [ -s "$destination" ] || die "下载文件为空：${url}"
}

compose() {
    "${COMPOSE_CMD[@]}" "$@"
}

pre_check() {
    command -v systemctl >/dev/null 2>&1 || die "不支持此系统：未找到 systemctl 命令"
    [[ ${EUID} -eq 0 ]] || die "必须使用 root 用户运行此脚本"
}

install_soft() {
    if command -v dnf >/dev/null 2>&1; then
        dnf install -y "$@"
    elif command -v yum >/dev/null 2>&1; then
        yum install -y "$@"
    elif command -v apt-get >/dev/null 2>&1; then
        apt-get update && apt-get install -y "$@"
    elif command -v pacman >/dev/null 2>&1; then
        pacman -Syu --noconfirm "$@"
    else
        return 1
    fi
}

install_base() {
    local packages=()
    command -v curl >/dev/null 2>&1 || packages+=(curl)
    command -v jq >/dev/null 2>&1 || packages+=(jq)
    if [[ ${#packages[@]} -gt 0 ]]; then
        install_soft "${packages[@]}" || die "安装基础软件失败"
    fi
}

detect_compose() {
    if docker compose version >/dev/null 2>&1; then
        COMPOSE_CMD=(docker compose)
        return 0
    fi
    if command -v docker-compose >/dev/null 2>&1; then
        COMPOSE_CMD=(docker-compose)
        return 0
    fi
    return 1
}

install_docker() {
    install_base
    if ! command -v docker >/dev/null 2>&1; then
        local installer
        info "正在安装 Docker"
        installer=$(mktemp)
        download_file "https://get.docker.com" "$installer"
        sh "$installer" || { rm -f "$installer"; die "Docker 安装失败"; }
        rm -f "$installer"
        systemctl enable docker.service
        systemctl start docker.service
        ok "Docker 安装成功"
    fi

    if ! detect_compose; then
        info "正在安装 Docker Compose 插件"
        install_soft docker-compose-plugin || die "Docker Compose 安装失败，请先安装 docker compose 插件"
        detect_compose || die "未找到可用的 Docker Compose"
    fi
}

configure_bot() {
    local chat_id token stage
    if [[ $# -eq 0 ]]; then
        return 0
    elif [[ $# -eq 1 && "$1" == "--telegram" ]]; then
        read -r -p "Telegram Chat ID: " chat_id
        read -r -s -p "Telegram Bot Token: " token
        echo
    elif [[ $# -eq 2 ]]; then
        warn "命令行参数会进入 Shell 历史，后续建议使用 --telegram 交互配置"
        chat_id="$1"
        token="$2"
    else
        die "Telegram 配置参数无效"
    fi

    [[ "$chat_id" =~ ^-?[0-9]+$ || "$chat_id" =~ ^@[A-Za-z0-9_]+$ ]] || die "Telegram Chat ID 格式无效"
    [[ "$token" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]] || die "Telegram Bot Token 格式无效"

    stage=$(mktemp -d)
    if [ -f .env ]; then
        grep -vE '^(TG_CHAT_ID|TG_BOT_TOKEN|COMPOSE_PROFILES)=' .env > "${stage}/env" || true
    else
        : > "${stage}/env"
    fi
    printf 'TG_CHAT_ID=%s\nTG_BOT_TOKEN=%s\nCOMPOSE_PROFILES=telegram\n' "$chat_id" "$token" >> "${stage}/env"
    install -m 0600 "${stage}/env" .env
    rm -rf -- "$stage"
}

install_dashboard() {
    local stage
    install_docker
    configure_bot "$@"

    if [[ ${FORCE_INSTALL} -eq 0 ]] && compose ps --status running --services 2>/dev/null | grep -qx web; then
        if [[ $# -gt 0 ]]; then
            compose up -d --build || die "Telegram 服务更新失败"
        fi
        return 0
    fi

    step "安装面板"
    stage=$(mktemp -d)
    mkdir -p "${stage}/service/bot" "${stage}/service/web/css" "${stage}/service/web/js"
    download_file "${GITHUB_RAW_URL}/docker-compose.yml" "${stage}/docker-compose.yml"
    download_file "${GITHUB_RAW_URL}/service/bot/Dockerfile" "${stage}/service/bot/Dockerfile"
    download_file "${GITHUB_RAW_URL}/service/bot/bot.py" "${stage}/service/bot/bot.py"
    download_file "${GITHUB_RAW_URL}/service/web/Dockerfile" "${stage}/service/web/Dockerfile"
    download_file "${GITHUB_RAW_URL}/service/web/index.html" "${stage}/service/web/index.html"
    download_file "${GITHUB_RAW_URL}/service/web/favicon.svg" "${stage}/service/web/favicon.svg"
    download_file "${GITHUB_RAW_URL}/service/web/css/app.css" "${stage}/service/web/css/app.css"
    download_file "${GITHUB_RAW_URL}/service/web/js/app.js" "${stage}/service/web/js/app.js"

    install -d -m 0755 service/bot service/web/css service/web/js json
    install -m 0644 "${stage}/docker-compose.yml" docker-compose.yml
    install -m 0644 "${stage}/service/bot/Dockerfile" service/bot/Dockerfile
    install -m 0644 "${stage}/service/bot/bot.py" service/bot/bot.py
    install -m 0644 "${stage}/service/web/Dockerfile" service/web/Dockerfile
    install -m 0644 "${stage}/service/web/index.html" service/web/index.html
    install -m 0644 "${stage}/service/web/favicon.svg" service/web/favicon.svg
    install -m 0644 "${stage}/service/web/css/app.css" service/web/css/app.css
    install -m 0644 "${stage}/service/web/js/app.js" service/web/js/app.js
    rm -rf -- "$stage"

    if [ ! -f "$CONFIG_FILE" ]; then
        printf '%s\n' '{"servers":[]}' > "$CONFIG_FILE"
    fi
    chmod 0600 "$CONFIG_FILE"

    step "构建并启动面板"
    compose up -d --build || die "面板启动失败"
    ok "面板已启动，web 地址：http://<本机IP>:8081"
}

# ================= 节点管理(纯 shell + jq) =================

ensure_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        printf '%s\n' '{"servers":[]}' > "$CONFIG_FILE"
        chmod 0600 "$CONFIG_FILE"
    fi
    jq -e '.servers | type == "array"' "$CONFIG_FILE" >/dev/null 2>&1 || die "config.json 格式无效"
}

get_ip() {
    local ip
    ip=$(curl --fail --silent --max-time 10 https://api.ipify.org 2>/dev/null || true)
    if [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ || "$ip" =~ ^[0-9A-Fa-f:]+$ ]]; then
        printf '%s' "$ip"
    else
        printf '%s' "<本机IP>"
    fi
}

gen_user() {
    if [ -r /proc/sys/kernel/random/uuid ]; then
        tr -d '-' < /proc/sys/kernel/random/uuid
    elif command -v uuidgen >/dev/null 2>&1; then
        uuidgen | tr -d '-' | tr 'A-Z' 'a-z'
    else
        head -c16 /dev/urandom | od -An -tx1 | tr -d ' \n'
    fi
}

gen_pass() {
    od -An -N24 -tx1 /dev/urandom | tr -d ' \n'
}

restart_stack() {
    info "操作完成，等待服务重启…"
    compose restart || { err "服务重启失败"; return 1; }
    ok "完成"
}

print_agent_cmd() {
    local user="$1" pass="$2" ip
    ip=$(get_ip)
    echo
    line
    printf '%s\n' "${green}curl --fail --location ${GITHUB_RAW_URL}/agent/sss-agent.sh -o sss-agent.sh && chmod +x sss-agent.sh && sudo ./sss-agent.sh install ${ip} ${user}${plain}"
    printf '%s\n' "${yellow}节点密码（安装时粘贴）: ${pass}${plain}"
    line
}

list_nodes() {
    ensure_config
    local count
    count=$(jq '.servers | length' "$CONFIG_FILE")
    echo
    if [ "$count" -eq 0 ]; then
        warn "暂时没有任何节点，使用「添加节点」开始吧"
        return
    fi
    printf "  ${bold}%-5s %-18s %-10s %-8s${plain}\n" "ID" "NAME" "LOCATION" "TYPE"
    line
    jq -r '.servers | to_entries[] | "\(.key)|\(.value.name)|\(.value.location)|\(.value.type)"' "$CONFIG_FILE" |
    while IFS='|' read -r id name loc type; do
        printf "  %-5s %-18s %-10s %-8s\n" "$id" "$name" "$loc" "$type"
    done
}

add_node() {
    ensure_config
    local name loc type user pass tmp
    echo
    ask "请输入节点名字:"; read -r name
    [ -z "$name" ] && { err "名字不能为空"; return; }
    if jq -e --arg name "$name" '.servers | any(.name == $name)' "$CONFIG_FILE" >/dev/null; then
        err "节点名字已存在"
        return
    fi
    ask "请输入位置 [us]:"; read -r loc;  loc=${loc:-us}
    ask "请输入类型 [kvm]:"; read -r type; type=${type:-kvm}

    user=$(gen_user)
    pass=$(gen_pass)

    cp -p "$CONFIG_FILE" "${CONFIG_FILE}.bak" || { err "配置备份失败"; return; }
    tmp=$(mktemp)
    jq --arg name "$name" --arg loc "$loc" --arg type "$type" --arg user "$user" --arg pass "$pass" \
       '.servers += [{monthstart:"1",location:$loc,type:$type,name:$name,username:$user,host:$name,password:$pass}] | .servers |= sort_by(.name)' \
       "$CONFIG_FILE" > "$tmp" && mv "$tmp" "$CONFIG_FILE" || { err "写入 config.json 失败"; rm -f "$tmp"; return; }

    ok "添加成功: ${bold}${name}${plain}"
    restart_stack
    list_nodes
    echo
    info "请复制以下命令在机器 ${bold}${name}${plain} 安装 agent 服务:"
    print_agent_cmd "$user" "$pass"
}

remove_node() {
    ensure_config
    list_nodes
    local count idx name yn tmp
    count=$(jq '.servers | length' "$CONFIG_FILE")
    [ "$count" -eq 0 ] && return
    echo
    ask "请输入要删除的节点编号:"; read -r idx
    [[ "$idx" =~ ^[0-9]+$ ]] || { err "无效输入"; return; }
    [ "$idx" -ge "$count" ] && { err "编号超出范围"; return; }
    name=$(jq -r ".servers[$idx].name" "$CONFIG_FILE")
    ask "确认删除节点 ${bold}${name}${plain}? [y/N]"; read -r yn
    case "$yn" in
        y|Y) ;;
        *) info "已取消删除"; return ;;
    esac
    cp -p "$CONFIG_FILE" "${CONFIG_FILE}.bak" || { err "配置备份失败"; return; }
    tmp=$(mktemp)
    jq "del(.servers[$idx])" "$CONFIG_FILE" > "$tmp" && mv "$tmp" "$CONFIG_FILE" || { err "写入失败"; rm -f "$tmp"; return; }
    ok "删除成功: ${bold}${name}${plain}"
    restart_stack
    list_nodes
}

update_node() {
    ensure_config
    list_nodes
    local count idx oname oloc otype omonth name loc type month tmp
    count=$(jq '.servers | length' "$CONFIG_FILE")
    [ "$count" -eq 0 ] && return
    echo
    ask "请输入要更新的节点编号:"; read -r idx
    [[ "$idx" =~ ^[0-9]+$ ]] || { err "无效输入"; return; }
    [ "$idx" -ge "$count" ] && { err "编号超出范围"; return; }

    oname=$(jq -r ".servers[$idx].name" "$CONFIG_FILE")
    oloc=$(jq -r ".servers[$idx].location" "$CONFIG_FILE")
    otype=$(jq -r ".servers[$idx].type" "$CONFIG_FILE")
    omonth=$(jq -r ".servers[$idx].monthstart" "$CONFIG_FILE")

    printf '%s\n' "${dim}回车保留原值(中括号内为原值)${plain}"
    ask "新名字 [${oname}]:";        read -r name;  name=${name:-$oname}
    ask "新位置 [${oloc}]:";         read -r loc;   loc=${loc:-$oloc}
    ask "新类型 [${otype}]:";        read -r type;  type=${type:-$otype}
    ask "月流量起始日 [${omonth}]:"; read -r month; month=${month:-$omonth}
    [[ "$month" =~ ^([1-9]|[12][0-9]|3[01])$ ]] || { err "月流量起始日必须为 1-31"; return; }
    if [ "$name" != "$oname" ] && jq -e --arg name "$name" '.servers | any(.name == $name)' "$CONFIG_FILE" >/dev/null; then
        err "节点名字已存在"
        return
    fi

    if [ "$name" = "$oname" ] && [ "$loc" = "$oloc" ] && [ "$type" = "$otype" ] && [ "$month" = "$omonth" ]; then
        info "未做任何更新，直接返回"
        return
    fi

    cp -p "$CONFIG_FILE" "${CONFIG_FILE}.bak" || { err "配置备份失败"; return; }
    tmp=$(mktemp)
    jq --arg n "$name" --arg l "$loc" --arg t "$type" --arg m "$month" \
       ".servers[$idx].name=\$n | .servers[$idx].location=\$l | .servers[$idx].type=\$t | .servers[$idx].monthstart=\$m | .servers |= sort_by(.name)" \
       "$CONFIG_FILE" > "$tmp" && mv "$tmp" "$CONFIG_FILE" || { err "写入失败"; rm -f "$tmp"; return; }

    ok "更新成功"
    restart_stack
    list_nodes
}

menu_loop() {
    ensure_config
    while true; do
        clear 2>/dev/null
        banner
        printf '%s\n' "${dim}  详细教程: https://lidalao.com/archives/87${plain}"
        list_nodes
        echo
        printf '%s\n' "  ${bold}操作菜单${plain}"
        printf '%s\n' "    ${green}1${plain}. 查看节点      ${green}2${plain}. 添加节点"
        printf '%s\n' "    ${green}3${plain}. 删除节点      ${green}4${plain}. 更新节点"
        printf '%s\n' "    ${green}0${plain}. 退出"
        echo
        ask "请输入操作编号:"; read -r op
        case "$op" in
            1) list_nodes; pause ;;
            2) add_node;    pause ;;
            3) remove_node; pause ;;
            4) update_node; pause ;;
            0) echo; ok "再见 👋"; exit 0 ;;
            *) err "无效输入"; pause ;;
        esac
    done
}

# ================= 入口 =================
clear 2>/dev/null
banner
pre_check
if [[ "${1:-}" == "--upgrade" ]]; then
    FORCE_INSTALL=1
    shift
fi
install_dashboard "$@"
menu_loop
