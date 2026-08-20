import importlib.util
import io
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout


BOT_PATH = pathlib.Path(__file__).parents[1] / 'service' / 'bot' / 'bot.py'
SPEC = importlib.util.spec_from_file_location('serverstatus_bot', BOT_PATH)
bot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bot)


class BotDebounceTests(unittest.TestCase):
    def setUp(self):
        bot.offs.clear()
        bot.counterOff.clear()
        bot.counterOn.clear()
        bot.retryOff.clear()
        bot.retryOn.clear()
        self.original_debounce = bot.DEBOUNCE_POLLS
        bot.DEBOUNCE_POLLS = 3
        self.original_retry_base = bot.NOTIFY_RETRY_BASE
        self.original_retry_max = bot.NOTIFY_RETRY_MAX
        bot.NOTIFY_RETRY_BASE = 10
        bot.NOTIFY_RETRY_MAX = 40
        self.messages = []
        self.original_send = bot._send
        bot._send = self._send

    def tearDown(self):
        bot._send = self.original_send
        bot.DEBOUNCE_POLLS = self.original_debounce
        bot.NOTIFY_RETRY_BASE = self.original_retry_base
        bot.NOTIFY_RETRY_MAX = self.original_retry_max

    def _send(self, text):
        self.messages.append(text)
        return True

    def test_offline_requires_consecutive_polls(self):
        bot.send2tg('node-a', 0)
        bot.send2tg('node-a', 0)
        bot.send2tg('node-a', 1)
        bot.send2tg('node-a', 0)
        bot.send2tg('node-a', 0)

        self.assertEqual([], self.messages)

        bot.send2tg('node-a', 0)
        self.assertEqual(1, len(self.messages))

    def test_online_requires_consecutive_polls(self):
        for _ in range(3):
            bot.send2tg('node-a', 0)
        self.messages.clear()

        bot.send2tg('node-a', 1)
        bot.send2tg('node-a', 0)
        bot.send2tg('node-a', 1)
        bot.send2tg('node-a', 1)
        self.assertEqual([], self.messages)

        bot.send2tg('node-a', 1)
        self.assertEqual(1, len(self.messages))

    def test_server_name_is_html_escaped(self):
        for _ in range(3):
            bot.send2tg('<node&one>', 0)

        self.assertIn('&lt;node&amp;one&gt;', self.messages[0])

    def test_failed_send_keeps_pending_transition_and_retries_with_backoff(self):
        attempts = []
        bot._send = lambda text: attempts.append(text) or False
        for _ in range(3):
            bot.send2tg('node-a', 0, now=0)

        self.assertNotIn('node-a', bot.offs)
        self.assertEqual(3, bot.counterOff['node-a'])
        self.assertEqual(1, len(attempts))

        bot.send2tg('node-a', 0, now=9)
        self.assertEqual(1, len(attempts))

        bot._send = self._send
        bot.send2tg('node-a', 0, now=10)
        self.assertIn('node-a', bot.offs)
        self.assertEqual(1, len(self.messages))


class FeedMonitorTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original = {
            'FEED_FAILURE_THRESHOLD': bot.FEED_FAILURE_THRESHOLD,
            'FEED_LOG_INTERVAL': bot.FEED_LOG_INTERVAL,
            'FEED_MAX_BACKOFF': bot.FEED_MAX_BACKOFF,
            'HEARTBEAT_FILE': bot.HEARTBEAT_FILE,
            'POLL_INTERVAL': bot.POLL_INTERVAL,
            'NOTIFY_RETRY_BASE': bot.NOTIFY_RETRY_BASE,
            'NOTIFY_RETRY_MAX': bot.NOTIFY_RETRY_MAX,
            '_send': bot._send,
            '_fetch_status': bot._fetch_status,
            '_write_heartbeat': bot._write_heartbeat,
            '_process_servers': bot._process_servers,
        }
        bot.FEED_FAILURE_THRESHOLD = 3
        bot.FEED_LOG_INTERVAL = 60
        bot.FEED_MAX_BACKOFF = 8
        bot.POLL_INTERVAL = 1
        bot.NOTIFY_RETRY_BASE = 10
        bot.NOTIFY_RETRY_MAX = 40
        bot.HEARTBEAT_FILE = os.path.join(self.temp_dir.name, 'heartbeat')
        self.messages = []
        bot._send = lambda text: self.messages.append(text) or True

    def tearDown(self):
        for name, value in self.original.items():
            setattr(bot, name, value)
        self.temp_dir.cleanup()

    def test_feed_outage_and_recovery_are_each_announced_once(self):
        monitor = bot.FeedMonitor()

        with redirect_stdout(io.StringIO()):
            delays = [monitor.failed(RuntimeError('down'), now=n) for n in (0, 1, 2, 3)]
        self.assertEqual([1, 2, 4, 8], delays)
        self.assertEqual(1, len(self.messages))
        self.assertIn('不可用', self.messages[0])

        monitor.succeeded(now=4)
        monitor.succeeded(now=5)
        self.assertEqual(2, len(self.messages))
        self.assertIn('已恢复', self.messages[1])

    def test_failed_outage_send_retries_with_backoff_until_success(self):
        outcomes = iter([False, False, True])
        attempts = []
        bot._send = lambda text: attempts.append(text) or next(outcomes)
        monitor = bot.FeedMonitor()

        with redirect_stdout(io.StringIO()):
            for now in (0, 1, 2, 3, 11, 12, 31, 32):
                monitor.failed(RuntimeError('down'), now=now)

        self.assertEqual(3, len(attempts))
        self.assertTrue(monitor.outage_announced)

    def test_never_announced_outage_has_no_recovery_message(self):
        attempts = []
        bot._send = lambda text: attempts.append(text) or False
        monitor = bot.FeedMonitor()

        with redirect_stdout(io.StringIO()):
            for now in (0, 1, 2):
                monitor.failed(RuntimeError('down'), now=now)
        monitor.succeeded(now=3)

        self.assertEqual(1, len(attempts))
        self.assertIn('不可用', attempts[0])
        self.assertFalse(monitor.outage_announced)

    def test_failed_recovery_send_is_rate_limited_until_success(self):
        outcomes = iter([True, False, True])
        attempts = []
        bot._send = lambda text: attempts.append(text) or next(outcomes)
        monitor = bot.FeedMonitor()

        with redirect_stdout(io.StringIO()):
            for now in (0, 1, 2):
                monitor.failed(RuntimeError('down'), now=now)
        monitor.succeeded(now=3)
        monitor.succeeded(now=9)
        self.assertTrue(monitor.outage_announced)
        self.assertEqual(2, len(attempts))

        monitor.succeeded(now=13)
        self.assertFalse(monitor.outage_announced)
        self.assertEqual(3, len(attempts))
        self.assertIn('已恢复', attempts[-1])

    def test_feed_flap_does_not_reset_failed_recovery_backoff(self):
        outcomes = iter([True, False, True])
        attempts = []
        bot._send = lambda text: attempts.append(text) or next(outcomes)
        monitor = bot.FeedMonitor()

        with redirect_stdout(io.StringIO()):
            for now in (0, 1, 2):
                monitor.failed(RuntimeError('down'), now=now)
            monitor.succeeded(now=3)
            monitor.failed(RuntimeError('flap'), now=4)
            monitor.succeeded(now=9)

        self.assertTrue(monitor.outage_announced)
        self.assertEqual(2, len(attempts))

        monitor.succeeded(now=13)
        self.assertFalse(monitor.outage_announced)
        self.assertEqual(3, len(attempts))

    def test_failure_logging_is_rate_limited(self):
        monitor = bot.FeedMonitor()
        output = io.StringIO()
        with redirect_stdout(output):
            monitor.failed(RuntimeError('first'), now=0)
            monitor.failed(RuntimeError('hidden'), now=1)
            monitor.failed(RuntimeError('later'), now=60)

        self.assertEqual(2, output.getvalue().count('读取节点状态失败'))

    def test_successful_parsed_feed_updates_heartbeat_without_telegram(self):
        bot._fetch_status = lambda address: []
        bot._send = self.original['_send']
        monitor = bot.FeedMonitor()

        delay = bot.poll_status('http://srv/json/stats.json', monitor)

        self.assertEqual(1, delay)
        self.assertTrue(os.path.isfile(bot.HEARTBEAT_FILE))
        with open(bot.HEARTBEAT_FILE, 'r', encoding='utf-8') as heartbeat:
            self.assertGreater(float(heartbeat.read()), 0)

    def test_local_heartbeat_failure_does_not_report_feed_outage(self):
        bot._fetch_status = lambda address: []
        bot._write_heartbeat = lambda: (_ for _ in ()).throw(OSError('read only'))
        processed = []
        bot._process_servers = lambda servers: processed.append(servers)
        monitor = bot.FeedMonitor()
        monitor.consecutive_failures = 2

        output = io.StringIO()
        with redirect_stdout(output):
            delay = bot.poll_status('http://srv/json/stats.json', monitor)

        self.assertEqual(1, delay)
        self.assertEqual(0, monitor.consecutive_failures)
        self.assertEqual([], self.messages)
        self.assertEqual([[]], processed)
        self.assertIn('写入 heartbeat 失败', output.getvalue())

    def test_local_processing_failure_does_not_report_feed_outage(self):
        bot._fetch_status = lambda address: []
        bot._process_servers = lambda servers: (_ for _ in ()).throw(RuntimeError('bad state'))
        monitor = bot.FeedMonitor()
        monitor.consecutive_failures = 2

        output = io.StringIO()
        with redirect_stdout(output):
            delay = bot.poll_status('http://srv/json/stats.json', monitor)

        self.assertEqual(1, delay)
        self.assertEqual(0, monitor.consecutive_failures)
        self.assertEqual([], self.messages)
        self.assertFalse(os.path.exists(bot.HEARTBEAT_FILE))
        self.assertIn('处理节点状态失败', output.getvalue())


class BotConfigurationTests(unittest.TestCase):
    def test_invalid_runtime_settings_fail_before_polling(self):
        cases = (
            ({'POLL_INTERVAL': '0'}, 'POLL_INTERVAL must be a finite number greater than 0'),
            ({'POLL_INTERVAL': 'Infinity'}, 'POLL_INTERVAL must be a finite number greater than 0'),
            ({'REQUEST_TIMEOUT': 'NaN'}, 'REQUEST_TIMEOUT must be a finite number greater than 0'),
            ({'DEBOUNCE_POLLS': '0'}, 'DEBOUNCE_POLLS must be at least 1'),
            ({'FEED_LOG_INTERVAL': 'Infinity'}, 'FEED_LOG_INTERVAL must be a finite number greater than 0'),
            ({'FEED_MAX_BACKOFF': '0'}, 'FEED_MAX_BACKOFF must be a finite number greater than 0'),
            ({'FEED_MAX_BACKOFF': '2'}, 'FEED_MAX_BACKOFF must be greater than or equal to POLL_INTERVAL'),
            ({'NOTIFY_RETRY_BASE': 'NaN'}, 'NOTIFY_RETRY_BASE must be a finite number greater than 0'),
            ({'NOTIFY_RETRY_MAX': '10'}, 'NOTIFY_RETRY_MAX must be greater than or equal to NOTIFY_RETRY_BASE'),
        )
        for settings, message in cases:
            with self.subTest(settings=settings):
                env = os.environ.copy()
                env.update(settings)
                result = subprocess.run(
                    [sys.executable, str(BOT_PATH)],
                    env=env,
                    capture_output=True,
                    text=True,
                    timeout=5,
                    check=False,
                )
                self.assertNotEqual(0, result.returncode)
                self.assertIn(message, result.stderr + result.stdout)


if __name__ == '__main__':
    unittest.main()
