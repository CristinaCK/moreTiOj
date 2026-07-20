"""通知创建工具：供竞赛 / 班级 / 题解 / 讨论等模块调用。"""
from .models import Notification


def create_notification(recipient, ntype, title, content="", link=""):
    return Notification.objects.create(
        recipient=recipient, type=ntype, title=title, content=content, link=link
    )


def bulk_notify(recipients, ntype, title, content="", link=""):
    objs = [
        Notification(recipient=u, type=ntype, title=title, content=content, link=link)
        for u in recipients
    ]
    return Notification.objects.bulk_create(objs)
