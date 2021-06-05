import os

import pytest
from channels.routing import get_default_application
from channels.staticfiles import StaticFilesWrapper
from daphne.testing import DaphneProcess
from django.core.exceptions import ImproperlyConfigured
from pytest_django.lazy_django import skip_if_no_django


class LiveServer:
    """The liveserver fixture

    This is the object that the ``live_server`` fixture returns.
    The ``live_server`` fixture handles creation and stopping.
    """

    ProtocolServerProcess = DaphneProcess
    static_wrapper = StaticFilesWrapper

    def __init__(self, host='localhost'):
        from django.db import connections
        from django.test.utils import modify_settings

        for connection in connections.all():
            if self._is_in_memory_db(connection):
                raise ImproperlyConfigured(
                    "ChannelLiveServerTestCase can not be used with in memory databases"
                )

        self._live_server_modified_settings = modify_settings(
            ALLOWED_HOSTS={"append": host}
        )

        self._server_process = self.ProtocolServerProcess(host, self.get_application())
        self._server_process.start()
        self._server_process.ready.wait()
        self._host = host
        self._port = self._server_process.port.value

        if not self._server_process.errors.empty():
            raise self._server_process.errors.get()

    def get_application(self):
        from django.conf import settings

        application = get_default_application()

        if "django.contrib.staticfiles" in settings.INSTALLED_APPS:
            application = self.static_wrapper(application)

        return application

    def stop(self):
        """Stop the server"""
        self._server_process.terminate()
        self._server_process.join()

    @property
    def url(self):
        return f"http://{self._host}:{self._port}"

    @property
    def ws_url(self):
        return f"ws://{self._host}:{self._port}"

    def __str__(self):
        return self.url

    def __add__(self, other):
        return str(self) + other

    def __repr__(self):
        return f"<LiveServer listening at {self.url}>"

    def _is_in_memory_db(self, connection):
        """
        Check if DatabaseWrapper holds in memory database.
        """
        if connection.vendor == "sqlite":
            return connection.is_in_memory_db()


@pytest.fixture(scope="session")
def live_server(request, redis_server, django_db_setup, django_db_blocker):
    """Run a live Django Channels server in the background during tests

    The host the server is started from is taken from the
    --liveserver command line option or if this is not provided from
    the DJANGO_LIVE_TEST_SERVER_ADDRESS environment variable.  If
    neither is provided ``localhost`` is used.

    NOTE: If the live server needs database access to handle a request
          your test will have to request database access.  Furthermore
          when the tests want to see data added by the live-server (or
          the other way around) transactional database access will be
          needed as data inside a transaction is not shared between
          the live server and test code.

          Static assets will be automatically served when
          ``django.contrib.staticfiles`` is available in INSTALLED_APPS.
    """
    skip_if_no_django()

    addr = request.config.getvalue("liveserver") or os.getenv(
        "DJANGO_LIVE_TEST_SERVER_ADDRESS"
    )

    if addr and ":" in addr:
        raise ValueError('Cannot supply port with Django Channels live_server')

    if not addr:
        addr = "localhost"

    # NOTE: because our live Daphne server fork()'s from this process, we must
    #       ensure DB access is allowed before forking — otherwise every test
    #       will receive the dreaded "use the django_db mark, Luke" error
    django_db_blocker.unblock()
    server = LiveServer(addr)
    django_db_blocker.restore()

    request.addfinalizer(server.stop)
    return server
