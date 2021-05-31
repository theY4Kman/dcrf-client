import logging
from functools import partial
from typing import Iterable, Union

from djangochannelsrestframework.decorators import action
from djangochannelsrestframework.generics import GenericAsyncAPIConsumer
from djangochannelsrestframework.mixins import (
    CreateModelMixin,
    DeleteModelMixin,
    ListModelMixin,
    PatchModelMixin,
    UpdateModelMixin,
)
from djangochannelsrestframework.observer.generics import ObserverModelInstanceMixin
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound

from dcrf_client_test.models import Thing
from dcrf_client_test.observers import model_observer

logger = logging.getLogger(__name__)


class ThingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Thing
        fields = [
            'pk',
            'name',
            'counter',
        ]


class ThingsWithIdSerializer(serializers.ModelSerializer):
    class Meta:
        model = Thing
        fields = '__all__'


class ThingConsumer(
    ListModelMixin,
    CreateModelMixin,
    UpdateModelMixin,
    PatchModelMixin,
    DeleteModelMixin,
    ObserverModelInstanceMixin,
    GenericAsyncAPIConsumer,
):
    queryset = Thing.objects.all()
    serializer_class = ThingSerializer

    def _unsubscribe(self, request_id: str):
        request_id_found = False
        to_remove = []
        for group, request_ids in self.subscribed_requests.items():
            if request_id in request_ids:
                request_id_found = True
                request_ids.remove(request_id)
            if not request_ids:
                to_remove.append(group)

        if not request_id_found:
            raise KeyError(request_id)

        for group in to_remove:
            del self.subscribed_requests[group]

    @action()
    async def unsubscribe_instance(self, request_id=None, **kwargs):
        try:
            return await super().unsubscribe_instance(request_id=request_id, **kwargs)
        except KeyError:
            raise NotFound(detail='Subscription not found')

    @model_observer(Thing)
    async def on_thing_activity(
        self, message, observer=None, action: str = None, request_id: str = None, **kwargs
    ):
        try:
            reply = partial(self.reply, action=action, request_id=request_id)

            if action == 'delete':
                await reply(data=message, status=204)
                # send the delete
                return

            # the @action decorator will wrap non-async action into async ones.
            response = await self.retrieve(
                request_id=request_id, action=action, **message
            )

            if isinstance(response, tuple):
                data, status = response
            else:
                data, status = response, 200
            await reply(data=data, status=status)
        except Exception as exc:
            await self.handle_exception(exc, action=action, request_id=request_id)

    @on_thing_activity.groups_for_signal
    def on_thing_activity(self, instance: Thing, **kwargs):
        yield f'-pk__{instance.pk}'
        yield f'-all'

    @on_thing_activity.groups_for_consumer
    def on_thing_activity(self, things: Iterable[Union[Thing, int]] = None, **kwargs):
        if things is None:
            yield f'-all'
        else:
            for thing in things:
                thing_id = thing.pk if isinstance(thing, Thing) else thing
                yield f'-pk__{thing_id}'

    @on_thing_activity.serializer
    def on_thing_activity(self, instance: Thing, action: str, **kwargs):
        return ThingSerializer(instance).data

    @action()
    async def subscribe_many(self, request_id: str = None, things: Iterable[int] = None, **kwargs):
        await self.on_thing_activity.subscribe(request_id=request_id, things=things)
        return None, status.HTTP_201_CREATED

    @action()
    async def unsubscribe_many(self, request_id: str = None, things: Iterable[int] = None, **kwargs):
        await self.on_thing_activity.unsubscribe(request_id=request_id, things=things)
        return None, status.HTTP_204_NO_CONTENT


class ThingsWithIdConsumer(ThingConsumer):
    serializer_class = ThingsWithIdSerializer
