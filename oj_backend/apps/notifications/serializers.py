from rest_framework import serializers

from .models import Announcement, Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ("id", "type", "title", "content", "link", "is_read", "created_at")
        read_only_fields = fields


class AnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = ("id", "title", "content", "created_at")
        read_only_fields = fields
