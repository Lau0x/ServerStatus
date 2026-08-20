import importlib.util
import os
import pathlib
import subprocess
import sys
import unittest


AGENT_PATH = pathlib.Path(__file__).parents[1] / 'agent' / 'client-linux.py'
SPEC = importlib.util.spec_from_file_location('serverstatus_agent', AGENT_PATH)
agent = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(agent)


class AgentNetworkStatusTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.original_get_network = agent.get_network
        agent.get_network = self._get_network

    def tearDown(self):
        agent.get_network = self.original_get_network

    def _get_network(self, ip_version):
        self.calls.append(ip_version)
        return True

    def _run_polls(self, interval, count):
        timer = 0
        update_polls = []
        for poll in range(count):
            data = {}
            timer = agent.update_network_status(data, 6, timer, interval)
            if 'online6' in data:
                update_polls.append(poll)
        return update_polls

    def test_default_interval_checks_every_ten_seconds(self):
        self.assertEqual([0, 10, 20], self._run_polls(interval=1, count=21))
        self.assertEqual([6, 6, 6], self.calls)

    def test_non_divisible_interval_checks_on_first_poll_after_ten_seconds(self):
        self.assertEqual([0, 4, 8], self._run_polls(interval=3, count=9))
        self.assertEqual([6, 6, 6], self.calls)

    def test_ten_second_interval_checks_each_poll(self):
        self.assertEqual([0, 1, 2], self._run_polls(interval=10, count=3))
        self.assertEqual([6, 6, 6], self.calls)


class AgentIntervalValidationTests(unittest.TestCase):
    def _run_agent(self, env_interval, argument=None):
        env = os.environ.copy()
        env['SSS_INTERVAL'] = str(env_interval)
        command = [sys.executable, str(AGENT_PATH)]
        if argument is not None:
            command.append('INTERVAL=' + str(argument))
        return subprocess.run(command, env=env, capture_output=True, text=True,
                              timeout=5, check=False)

    def test_zero_interval_is_rejected_before_startup(self):
        result = self._run_agent(0)

        self.assertEqual(2, result.returncode)
        self.assertEqual("SSS_INTERVAL must be greater than 0\n", result.stderr)
        self.assertNotIn("Connecting...", result.stdout)

    def test_negative_interval_argument_is_rejected_before_startup(self):
        result = self._run_agent(1, argument=-1)

        self.assertEqual(2, result.returncode)
        self.assertEqual("SSS_INTERVAL must be greater than 0\n", result.stderr)
        self.assertNotIn("Connecting...", result.stdout)


if __name__ == '__main__':
    unittest.main()
