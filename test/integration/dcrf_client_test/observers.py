from collections import defaultdict
from functools import partial
from typing import Dict, Iterable, Set, Type

from django.db.models import Model
from djangochannelsrestframework.consumers import AsyncAPIConsumer
from djangochannelsrestframework.observer import ModelObserver


class RequestIdModelObserver(ModelObserver):
    """ModelObserver which keeps track of each subscription's request_id"""

    def __init__(self, func, model_cls: Type[Model], partition: str = "*", **kwargs):
        self.group_request_ids: Dict[str, Set[str]] = defaultdict(set)
        self.request_id_groups: Dict[str, Set[str]] = defaultdict(set)
        super().__init__(func, model_cls, partition, **kwargs)

    async def __call__(self, message, consumer=None, **kwargs):
        group = message.pop('group')

        for request_id in self.group_request_ids[group]:
            return await super().__call__(message, consumer, request_id=request_id)

    async def subscribe(
        self, consumer: AsyncAPIConsumer, *args, request_id: str = None, **kwargs
    ) -> Iterable[str]:
        if request_id is None:
            raise ValueError("request_id must have a value set")

        groups = await super().subscribe(consumer, *args, **kwargs)

        for group in groups:
            self.group_request_ids[group].add(request_id)

        self.request_id_groups[request_id].update(groups)

        return groups

    async def unsubscribe(
        self, consumer: AsyncAPIConsumer, *args, request_id: str = None, **kwargs
    ) -> Iterable[str]:
        if request_id is None:
            raise ValueError("request_id must have a value set")

        groups = await super().unsubscribe(consumer, *args, **kwargs)

        for group in self.request_id_groups[request_id]:
            group_request_ids = self.group_request_ids[group]
            group_request_ids.discard(request_id)

            if not group_request_ids:
                del self.group_request_ids[group]

        del self.request_id_groups[request_id]

        return groups


def model_observer(model, **kwargs):
    return partial(RequestIdModelObserver, model_cls=model, kwargs=kwargs)
