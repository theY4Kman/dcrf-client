from channels.routing import ProtocolTypeRouter, URLRouter
from django.urls import path

from dcrf_client_test.multiplexing import DcrfClientTestDemultiplexer

application = ProtocolTypeRouter({
    'websocket': URLRouter([
        path('ws', DcrfClientTestDemultiplexer),
    ]),
})
