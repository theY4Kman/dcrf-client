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


class ThingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Thing
        fields = [
            'pk',
            'name',
            'counter',
        ]


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
