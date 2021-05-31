from channelsmultiplexer import (
    AsyncJsonWebsocketDemultiplexer as BaseAsyncJsonWebsocketDemultiplexer,
)


class AsyncJsonWebsocketDemultiplexer(BaseAsyncJsonWebsocketDemultiplexer):
    async def websocket_accept(self, message, stream_name):
        is_last = self.applications_accepting_frames == set(self.applications) - {stream_name}
        self.applications_accepting_frames.add(stream_name)

        ###
        # accept the connection after the *last* upstream application accepts.
        #
        # channelsmultiplexer's implementation of websocket_accept will accept
        # the websocket connection when the _first_ upstream application accepts.
        # This can get hairy during tests, as the client can only judge a websocket's
        # readiness by whether the connection has been accepted — if the test is
        # making requests against the second stream, but only the first stream
        # is "accepting frames", there *will* be "Invalid multiplexed frame received
        # (stream not mapped)" errors.
        #
        # To combat this, we only accept the websocket connection when *all* the
        # streams' applications are ready. The default behaviour may be a bug.
        #
        if is_last:
            await self.accept()
