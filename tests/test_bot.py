import importlib.util
import pathlib
import unittest


BOT_PATH = pathlib.Path(__file__).parents[1] / 'service' / 'bot' / 'bot.py'
SPEC = importlib.util.spec_from_file_location('serverstatus_bot', BOT_PATH)
bot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bot)


class BotDebounceTests(unittest.TestCase):
    def setUp(self):
        bot.offs.clear()
        bot.counterOff.clear()
        bot.counterOn.clear()
        bot.DEBOUNCE_POLLS = 3
        self.messages = []
        self.original_send = bot._send
        bot._send = self._send

    def tearDown(self):
        bot._send = self.original_send

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

    def test_failed_send_keeps_pending_transition(self):
        bot._send = lambda text: False
        for _ in range(3):
            bot.send2tg('node-a', 0)

        self.assertNotIn('node-a', bot.offs)
        self.assertEqual(3, bot.counterOff['node-a'])

        bot._send = self._send
        bot.send2tg('node-a', 0)
        self.assertIn('node-a', bot.offs)
        self.assertEqual(1, len(self.messages))


if __name__ == '__main__':
    unittest.main()
