from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application
from django.urls import path

from dcrf_client_test.consumers import ThingConsumer, ThingsWithIdConsumer
from dcrf_client_test.demultiplexer import AsyncJsonWebsocketDemultiplexer

application = ProtocolTypeRouter({
    'websocket': URLRouter([
        path('ws', AsyncJsonWebsocketDemultiplexer(
            things=ThingConsumer(),
            things_with_id=ThingsWithIdConsumer(),
        )),
    ]),
    'http': get_asgi_application(),
})
