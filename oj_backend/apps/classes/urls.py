from rest_framework.routers import DefaultRouter

from .views import ClassRoomViewSet

router = DefaultRouter()
router.register("classes", ClassRoomViewSet, basename="class")

urlpatterns = router.urls
