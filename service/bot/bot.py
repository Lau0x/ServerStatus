#!/usr/bin/env python3
# coding: utf-8

import html
import json
import os
import time
import traceback
from urllib.parse import urlencode
from urllib.request import Request, urlopen

NODE_STATUS_URL = os.getenv('NODE_STATUS_URL', 'http://srv/json/stats.json')
POLL_INTERVAL = float(os.getenv('POLL_INTERVAL', '3'))
DEBOUNCE_POLLS = int(os.getenv('DEBOUNCE_POLLS', '10'))
REQUEST_TIMEOUT = float(os.getenv('REQUEST_TIMEOUT', '10'))

offs = set()
counterOff = {}
counterOn = {}


def _read_bot_token():
    token_file = os.getenv('TG_BOT_TOKEN_FILE')
    if token_file:
        with open(token_file, 'r', encoding='utf-8') as f:
            return f.read().strip()
    return os.getenv('TG_BOT_TOKEN', '').strip()


def _send(text):
    chat_id = os.getenv('TG_CHAT_ID', '').strip()
    bot_token = _read_bot_token()
    if not chat_id or not bot_token:
        print('Telegram 配置缺失，未发送通知')
        return False

    payload = urlencode({
        'parse_mode': 'HTML',
        'disable_web_page_preview': 'true',
        'chat_id': chat_id,
        'text': text,
    }).encode('utf-8')
    request = Request(
        'https://api.telegram.org/bot{}/sendMessage'.format(bot_token),
        data=payload,
        method='POST',
    )
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT) as response:
            if response.status >= 400:
                raise RuntimeError('Telegram HTTP {}'.format(response.status))
        return True
    except Exception as exc:
        print('Telegram 通知发送失败:', type(exc).__name__)
        return False


def send2tg(srv, flag):
    counterOff.setdefault(srv, 0)
    counterOn.setdefault(srv, 0)

    if flag == 1:
        counterOff[srv] = 0
        if srv not in offs:
            counterOn[srv] = 0
            return

        counterOn[srv] += 1
        if counterOn[srv] < DEBOUNCE_POLLS:
            return

        text = '<b>Server Status</b>\n主机上线: ' + html.escape(str(srv))
        if _send(text):
            offs.remove(srv)
            counterOn[srv] = 0
        return

    counterOn[srv] = 0
    if srv in offs:
        counterOff[srv] = 0
        return

    counterOff[srv] += 1
    if counterOff[srv] < DEBOUNCE_POLLS:
        return

    text = '<b>Server Status</b>\n主机下线: ' + html.escape(str(srv))
    if _send(text):
        offs.add(srv)
        counterOff[srv] = 0


def _fetch_status(address):
    request = Request(address, headers={'User-Agent': 'ServerStatus/20211116'})
    with urlopen(request, timeout=REQUEST_TIMEOUT) as response:
        if response.status >= 400:
            raise RuntimeError('ServerStatus HTTP {}'.format(response.status))
        data = json.load(response)
    servers = data.get('servers') if isinstance(data, dict) else None
    if not isinstance(servers, list):
        raise ValueError('stats.json 缺少 servers 数组')
    return servers


def sscmd(address):
    while True:
        try:
            for server in _fetch_status(address):
                if not isinstance(server, dict) or not server.get('name'):
                    continue
                online = bool(server.get('online4') or server.get('online6'))
                send2tg(server['name'], 1 if online else 0)
        except Exception:
            print('读取节点状态失败:', traceback.format_exc())
        time.sleep(POLL_INTERVAL)


if __name__ == '__main__':
    sscmd(NODE_STATUS_URL)
