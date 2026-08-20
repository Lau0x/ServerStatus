#!/usr/bin/env python3
# coding: utf-8

import html
import json
import math
import os
import time
import traceback
from urllib.parse import urlencode
from urllib.request import Request, urlopen

NODE_STATUS_URL = os.getenv('NODE_STATUS_URL', 'http://srv/json/stats.json')
POLL_INTERVAL = float(os.getenv('POLL_INTERVAL', '3'))
DEBOUNCE_POLLS = int(os.getenv('DEBOUNCE_POLLS', '10'))
REQUEST_TIMEOUT = float(os.getenv('REQUEST_TIMEOUT', '10'))
FEED_FAILURE_THRESHOLD = max(1, int(os.getenv('FEED_FAILURE_THRESHOLD', '3')))
FEED_LOG_INTERVAL = float(os.getenv('FEED_LOG_INTERVAL', '60'))
FEED_MAX_BACKOFF = float(os.getenv('FEED_MAX_BACKOFF', '30'))
HEARTBEAT_FILE = os.getenv('HEARTBEAT_FILE', '/tmp/serverstatus-bot-heartbeat')
NOTIFY_RETRY_BASE = float(os.getenv('NOTIFY_RETRY_BASE', '30'))
NOTIFY_RETRY_MAX = float(os.getenv('NOTIFY_RETRY_MAX', '300'))


def _validate_settings():
    for name, value in (
        ('POLL_INTERVAL', POLL_INTERVAL),
        ('REQUEST_TIMEOUT', REQUEST_TIMEOUT),
        ('FEED_LOG_INTERVAL', FEED_LOG_INTERVAL),
        ('FEED_MAX_BACKOFF', FEED_MAX_BACKOFF),
        ('NOTIFY_RETRY_BASE', NOTIFY_RETRY_BASE),
        ('NOTIFY_RETRY_MAX', NOTIFY_RETRY_MAX),
    ):
        if not math.isfinite(value) or value <= 0:
            raise SystemExit('{} must be a finite number greater than 0'.format(name))
    if DEBOUNCE_POLLS < 1:
        raise SystemExit('DEBOUNCE_POLLS must be at least 1')
    if FEED_MAX_BACKOFF < POLL_INTERVAL:
        raise SystemExit('FEED_MAX_BACKOFF must be greater than or equal to POLL_INTERVAL')
    if NOTIFY_RETRY_MAX < NOTIFY_RETRY_BASE:
        raise SystemExit('NOTIFY_RETRY_MAX must be greater than or equal to NOTIFY_RETRY_BASE')


_validate_settings()

offs = set()
counterOff = {}
counterOn = {}
retryOff = {}
retryOn = {}


def _retry_ready(retries, key, now):
    retry = retries.get(key)
    return retry is None or now >= retry[1]


def _retry_failed(retries, key, now):
    attempts = retries.get(key, (0, 0))[0] + 1
    delay = min(NOTIFY_RETRY_MAX, NOTIFY_RETRY_BASE * (2 ** min(attempts - 1, 10)))
    retries[key] = (attempts, now + delay)


def _try_notification(text, retries, key, now):
    if not _retry_ready(retries, key, now):
        return None
    if _send(text):
        retries.pop(key, None)
        return True
    _retry_failed(retries, key, now)
    return False


class FeedMonitor:
    def __init__(self):
        self.consecutive_failures = 0
        self.outage_announced = False
        self.last_error_log = None
        self.outage_retry = {}
        self.recovery_retry = {}

    def succeeded(self, now=None):
        now = time.time() if now is None else now
        self.consecutive_failures = 0
        self.last_error_log = None
        if self.outage_announced:
            sent = _try_notification(
                '<b>Server Status</b>\n监控数据源已恢复',
                self.recovery_retry,
                'recovery',
                now,
            )
            if sent:
                self.outage_announced = False
        else:
            self.outage_retry.clear()
            self.recovery_retry.clear()
        return POLL_INTERVAL

    def failed(self, exc, now=None):
        now = time.time() if now is None else now
        self.consecutive_failures += 1
        if self.last_error_log is None or now - self.last_error_log >= FEED_LOG_INTERVAL:
            print('读取节点状态失败:', type(exc).__name__, str(exc))
            self.last_error_log = now

        if self.consecutive_failures >= FEED_FAILURE_THRESHOLD and not self.outage_announced:
            sent = _try_notification(
                '<b>Server Status</b>\n监控数据源不可用',
                self.outage_retry,
                'outage',
                now,
            )
            if sent:
                self.outage_announced = True

        exponent = min(self.consecutive_failures - 1, 10)
        return min(FEED_MAX_BACKOFF, POLL_INTERVAL * (2 ** exponent))


def _read_bot_token():
    token_file = os.getenv('TG_BOT_TOKEN_FILE')
    if token_file:
        with open(token_file, 'r', encoding='utf-8') as f:
            return f.read().strip()
    return os.getenv('TG_BOT_TOKEN', '').strip()


def _send(text):
    chat_id = os.getenv('TG_CHAT_ID', '').strip()
    try:
        bot_token = _read_bot_token()
    except Exception as exc:
        print('Telegram token 读取失败:', type(exc).__name__)
        return False
    if not chat_id or not bot_token:
        print('Telegram 配置缺失，未发送通知')
        return False

    try:
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
        with urlopen(request, timeout=REQUEST_TIMEOUT) as response:
            if response.status >= 400:
                raise RuntimeError('Telegram HTTP {}'.format(response.status))
        return True
    except Exception as exc:
        print('Telegram 通知发送失败:', type(exc).__name__)
        return False


def send2tg(srv, flag, now=None):
    now = time.time() if now is None else now
    counterOff.setdefault(srv, 0)
    counterOn.setdefault(srv, 0)

    if flag == 1:
        counterOff[srv] = 0
        retryOff.pop(srv, None)
        if srv not in offs:
            counterOn[srv] = 0
            retryOn.pop(srv, None)
            return

        counterOn[srv] = min(DEBOUNCE_POLLS, counterOn[srv] + 1)
        if counterOn[srv] < DEBOUNCE_POLLS:
            return

        text = '<b>Server Status</b>\n主机上线: ' + html.escape(str(srv))
        if _try_notification(text, retryOn, srv, now):
            offs.remove(srv)
            counterOn[srv] = 0
        return

    counterOn[srv] = 0
    retryOn.pop(srv, None)
    if srv in offs:
        counterOff[srv] = 0
        retryOff.pop(srv, None)
        return

    counterOff[srv] = min(DEBOUNCE_POLLS, counterOff[srv] + 1)
    if counterOff[srv] < DEBOUNCE_POLLS:
        return

    text = '<b>Server Status</b>\n主机下线: ' + html.escape(str(srv))
    if _try_notification(text, retryOff, srv, now):
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


def _write_heartbeat(now=None):
    now = time.time() if now is None else now
    with open(HEARTBEAT_FILE, 'w', encoding='utf-8') as heartbeat:
        heartbeat.write(str(now))


def _process_servers(servers):
    for server in servers:
        if not isinstance(server, dict) or not server.get('name'):
            continue
        online = bool(server.get('online4') or server.get('online6'))
        send2tg(server['name'], 1 if online else 0)


def poll_status(address, monitor):
    try:
        servers = _fetch_status(address)
    except Exception as exc:
        return monitor.failed(exc)

    delay = monitor.succeeded()
    try:
        _process_servers(servers)
    except Exception:
        print('处理节点状态失败:', traceback.format_exc())
        return delay
    try:
        _write_heartbeat()
    except Exception:
        print('写入 heartbeat 失败:', traceback.format_exc())
    return delay


def sscmd(address):
    monitor = FeedMonitor()
    while True:
        time.sleep(poll_status(address, monitor))


if __name__ == '__main__':
    sscmd(NODE_STATUS_URL)
