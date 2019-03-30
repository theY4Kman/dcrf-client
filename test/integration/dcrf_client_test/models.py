from django.db import models


class Thing(models.Model):
    name = models.CharField(max_length=64)
    counter = models.IntegerField(default=0)
