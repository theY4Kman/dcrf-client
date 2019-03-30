from channelsmultiplexer import AsyncJsonWebsocketDemultiplexer

from dcrf_client_test.consumers import ThingConsumer


class DcrfClientTestDemultiplexer(AsyncJsonWebsocketDemultiplexer):
    applications = {
        'things': ThingConsumer,
    }
