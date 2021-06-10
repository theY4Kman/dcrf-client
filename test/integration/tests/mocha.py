import json
import linecache
import logging
import re
import subprocess
import sys
import types
from itertools import groupby
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest
from _pytest.fixtures import FuncFixtureInfo
from py._path.local import LocalPath

from tests.live_server import LiveServer

logger = logging.getLogger(__name__)


SCRIPT_PATH = Path(__file__)
SCRIPT_DIR = SCRIPT_PATH.parent
MOCHA_RUNNER_PATH = SCRIPT_DIR / 'runner.ts'


class MochaCoordinator:
    def __init__(self, debug: bool = False, debug_port: int = 9229, debug_suspend: bool = False):
        self.debug = debug
        self.debug_port = debug_port
        self.debug_suspend = debug_suspend

        self._did_start = False
        self.proc = None
        self._init_proc()

        self.tests = None
        self._read_tests()

    def _init_proc(self):
        args = []

        if self.debug:
            flag = 'inspect-brk' if self.debug_suspend else 'inspect'
            args += [
                'node',
                f'--{flag}={self.debug_port}',
                '-r', 'ts-node/register',
            ]
        else:
            args.append('ts-node')

        args.append(MOCHA_RUNNER_PATH)

        self.proc = subprocess.Popen(
            args=args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=sys.stderr,
        )

    @property
    def did_start(self):
        return self._did_start

    def start(self):
        """Begin execution of the test suite"""
        self._write()
        self._did_start = True
        logger.debug('Test suite started')

    def _read_tests(self) -> List[Dict[str, Any]]:
        if self.tests is None:
            event = self.expect('collect')
            self.tests = event['tests']
        return self.tests

    def write(self, type, **info):
        event = {
            'type': type,
            **info,
        }
        line = json.dumps(event)
        self._write(line)
        logger.debug(f'Wrote event to Mocha: {event}')

    def _write(self, s: str = None):
        if s is not None:
            self.proc.stdin.write(s.encode('utf-8'))

        self.proc.stdin.write(b'\n')
        self.proc.stdin.flush()

    def read(self) -> Dict[str, Any]:
        line = self.proc.stdout.readline()
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            logger.exception(f'Error parsing JSON from Mocha: {line}')
            raise
        logger.debug(f'Read event from Mocha: {event}')
        return event

    def expect(self, *types: str) -> Dict[str, Any]:
        logger.debug(f'Expecting event from Mocha of type(s): {",".join(types)}')

        event = self.read()
        if event['type'] not in types:
            str_types = ', '.join(types)
            raise ValueError(f'Expected one of {str_types}, but found: {event["type"]}')
        return event


coordinator: Optional[MochaCoordinator] = None


def pytest_addoption(parser):
    group = parser.getgroup('mocha')
    group.addoption(
        '--mocha-debug',
        action='store_true',
        dest='mocha_debug',
        default=False,
    )
    group.addoption(
        '--mocha-debug-port',
        type=int,
        dest='mocha_debug_port',
        default=9229,
    )
    group.addoption(
        '--mocha-debug-suspend',
        action='store_true',
        dest='mocha_debug_suspend',
        default=False,
    )


def pytest_cmdline_main(config):
    global coordinator
    coordinator = MochaCoordinator(
        debug=config.option.mocha_debug,
        debug_port=config.option.mocha_debug_port,
        debug_suspend=config.option.mocha_debug_suspend,
    )


class MochaTest(pytest.Function):
    def __init__(self, *args, **kwargs):
        self._obj = self._testmethod

        super().__init__(*args, **kwargs)

    def _testmethod(self, live_server: LiveServer, **kwargs):
        coordinator.expect('test')

        coordinator.write('server info', url=live_server.url, ws_url=live_server.ws_url)

        event = coordinator.expect('pass', 'fail')

        # Wait for all mocha after/afterEach hooks to complete
        coordinator.expect('test end')

        if event['state'] == 'failed':
            message = event['err']
            stack = event['stack']

            match = re.search(
                r'at (?P<context>\S+) \((?P<file>.+):(?P<lineno>\d+):(?P<col>\d+)\)$',
                stack,
                re.MULTILINE,
            )
            if not match:
                raise RuntimeError(message)

            #
            # Juicy JS stack trace found! We can trick Python into printing the
            # relevant JS source, by creating a fake Python module with a raise
            # statement at the same line number, and filling Python's cache of
            # file sources (AKA linecache) with the actual JS code.
            #
            ###

            file = match.group('file')
            lineno = int(match.group('lineno'))

            ##
            # Fill line cache with the actual JS source
            #
            with open(file) as fp:
                source = fp.read()
                def getsource():
                    return source
                linecache.cache[file] = (getsource,)

            ###
            # Create a fake module, raising an exception from the same
            # line number as the error raised in the JS file.
            #
            mod = types.ModuleType(file)
            exc_msg = f'{message}\n\n{stack}'
            fake_source = '\n' * (lineno - 1) + f'raise RuntimeError({exc_msg!r})'
            co = compile(fake_source, file, 'exec', dont_inherit=True)
            exec(co, mod.__dict__)


class MochaFile(pytest.File):
    obj = None


def pytest_collection(session: pytest.Session):
    session.items = []

    for filename, tests in groupby(coordinator.tests, key=lambda test: test['file']):
        file = MochaFile.from_parent(session, fspath=LocalPath(filename))

        for info in tests:
            requested_fixtures = ['live_server', '_live_server_helper']
            test = MochaTest.from_parent(
                file,
                name='::'.join(info['parents']),
                fixtureinfo=FuncFixtureInfo(
                    argnames=tuple(requested_fixtures),
                    initialnames=tuple(requested_fixtures),
                    names_closure=requested_fixtures,
                    name2fixturedefs={},
                ),
                keywords={
                    'django_db': pytest.mark.django_db(transaction=True),
                }
            )

            session.items.append(test)

    ###
    # NOTE: if this counter remains 0 at end of session, an exit code of 5 will be returned.
    #       This value is normally set by Session.perform_collect(), but we are bypassing that
    #       implementation.
    #
    session.testscollected = len(session.items)

    return session.items


def pytest_runtestloop(session):
    coordinator.start()
