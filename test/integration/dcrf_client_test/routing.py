from channels.routing import ProtocolTypeRouter, URLRouter
from channelsmultiplexer import AsyncJsonWebsocketDemultiplexer
from django.core.asgi import get_asgi_application
from django.urls import path

from dcrf_client_test.consumers import ThingConsumer, ThingsWithIdConsumer

application = ProtocolTypeRouter({
    'websocket': URLRouter([
        path('ws', AsyncJsonWebsocketDemultiplexer(
            things=ThingConsumer(),
            things_with_id=ThingsWithIdConsumer(),
        )),
    ]),
    'http': get_asgi_application(),
})
