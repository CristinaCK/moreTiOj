from django.db.models import Q
from rest_framework import filters, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from apps.notifications.models import Notification
from apps.notifications.services import create_notification
from apps.permissions import IsAdmin

from .models import AuditStatus, Discussion, DiscussionReply
from .serializers import (
    DiscussionCreateSerializer,
    DiscussionDetailSerializer,
    DiscussionListSerializer,
    ReplyCreateSerializer,
    ReplySerializer,
)


class DiscussionViewSet(viewsets.ModelViewSet):
    """讨论：默认先发后审（直接可见）；管理员可处置；支持楼层回复。"""

    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter]
    search_fields = ["title"]

    def get_queryset(self):
        user = self.request.user
        qs = Discussion.objects.select_related("author", "problem")
        if user.is_authenticated and user.is_admin:
            visible = qs
            st = self.request.query_params.get("status")
            if st:
                visible = visible.filter(audit_status=st)
        elif user.is_authenticated:
            visible = qs.filter(Q(audit_status=AuditStatus.PUBLISHED) | Q(author=user))
        else:
            visible = qs.filter(audit_status=AuditStatus.PUBLISHED)

        problem = self.request.query_params.get("problem")
        if problem:
            visible = visible.filter(problem__display_id=problem)
        category = self.request.query_params.get("category")
        if category:
            visible = visible.filter(category=category)
        return visible

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return DiscussionCreateSerializer
        if self.action == "retrieve":
            return DiscussionDetailSerializer
        return DiscussionListSerializer

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def update(self, request, *args, **kwargs):
        discussion = self.get_object()
        if discussion.author_id != request.user.id and not request.user.is_admin:
            return Response({"detail": "仅作者可修改"}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def perform_destroy(self, instance):
        user = self.request.user
        if instance.author_id != user.id and not user.is_admin:
            raise PermissionDenied("仅作者或管理员可删除")
        instance.delete()

    @action(detail=True, methods=["post"], permission_classes=[IsAdmin])
    def moderate(self, request, pk=None):
        """管理员处置：{"status": "published" | "rejected" | "pending"}"""
        st = request.data.get("status")
        if st not in (AuditStatus.PUBLISHED, AuditStatus.REJECTED, AuditStatus.PENDING):
            return Response({"detail": "status 取值无效"}, status=status.HTTP_400_BAD_REQUEST)
        discussion = self.get_object()
        discussion.audit_status = st
        discussion.save(update_fields=["audit_status"])
        if st == AuditStatus.REJECTED:
            create_notification(
                discussion.author, Notification.Type.AUDIT,
                title=f"讨论被下架：{discussion.title}",
            )
        return Response({"detail": "已处理"})

    @action(detail=True, methods=["get", "post"])
    def replies(self, request, pk=None):
        discussion = self.get_object()

        if request.method == "GET":
            qs = discussion.replies.select_related("author").order_by("created_at")
            page = self.paginate_queryset(qs)
            if page is not None:
                return self.get_paginated_response(ReplySerializer(page, many=True).data)
            return Response(ReplySerializer(qs, many=True).data)

        # POST 回复
        if discussion.audit_status != AuditStatus.PUBLISHED:
            return Response({"detail": "该讨论不可回复"}, status=status.HTTP_400_BAD_REQUEST)
        serializer = ReplyCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        parent = None
        parent_id = serializer.validated_data.get("parent")
        if parent_id:
            parent = DiscussionReply.objects.filter(id=parent_id, discussion=discussion).first()
            if parent is None:
                return Response({"detail": "父回复不存在或不属于该讨论"},
                                status=status.HTTP_400_BAD_REQUEST)

        reply = DiscussionReply.objects.create(
            discussion=discussion, author=request.user,
            parent=parent, content=serializer.validated_data["content"],
        )
        # 维护回复数（同时刷新 updated_at 作为最后活跃时间）
        discussion.reply_count = discussion.replies.count()
        discussion.save(update_fields=["reply_count", "updated_at"])

        # 回复提醒：通知主题作者与父回复作者（去重、不通知自己）
        notified = set()
        link = f"/discussions/{discussion.id}"
        if discussion.author_id != request.user.id:
            create_notification(
                discussion.author, Notification.Type.REPLY,
                title=f"你的讨论「{discussion.title}」有新回复", link=link,
            )
            notified.add(discussion.author_id)
        if parent and parent.author_id != request.user.id and parent.author_id not in notified:
            create_notification(
                parent.author, Notification.Type.REPLY,
                title=f"你在「{discussion.title}」中的回复有了新回应", link=link,
            )
        return Response(ReplySerializer(reply).data, status=status.HTTP_201_CREATED)


class ReplyViewSet(mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """删除单条回复（作者或管理员）；子回复随级联删除。"""

    queryset = DiscussionReply.objects.all()
    permission_classes = [IsAuthenticatedOrReadOnly]

    def perform_destroy(self, instance):
        user = self.request.user
        if instance.author_id != user.id and not user.is_admin:
            raise PermissionDenied("仅作者或管理员可删除")
        discussion = instance.discussion
        instance.delete()
        discussion.reply_count = discussion.replies.count()
        discussion.save(update_fields=["reply_count", "updated_at"])
