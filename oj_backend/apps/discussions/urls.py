from rest_framework.routers import DefaultRouter

from .views import DiscussionViewSet, ReplyViewSet

router = DefaultRouter()
router.register("discussions", DiscussionViewSet, basename="discussion")
router.register("discussion-replies", ReplyViewSet, basename="discussion-reply")

urlpatterns = router.urls
