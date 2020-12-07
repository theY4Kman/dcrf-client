import logging

from djangochannelsrestframework.generics import GenericAsyncAPIConsumer
from djangochannelsrestframework.mixins import (
    ListModelMixin,
    PatchModelMixin,
    UpdateModelMixin,
    CreateModelMixin,
    DeleteModelMixin,
)
from djangochannelsrestframework.observer.generics import ObserverModelInstanceMixin
from rest_framework import serializers

from dcrf_client_test.models import Thing

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


class ThingsWithIdConsumer(ThingConsumer):
    serializer_class = ThingsWithIdSerializer
