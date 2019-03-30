import pytest
from _pytest.monkeypatch import MonkeyPatch
from testing.redis import RedisServer

from django.conf import settings


@pytest.fixture(scope='session', autouse=True)
def redis_server():
    server = RedisServer()

    dsn = server.dsn()
    host = dsn['host']
    port = dsn['port']

    with MonkeyPatch().context() as patcher:
        patcher.setattr(settings, 'CHANNEL_LAYERS', {
            'default': {
                'BACKEND': 'channels_redis.core.RedisChannelLayer',
                'CONFIG': {
                    'hosts': [(host, port)],
                },
            },
        })

        yield server
