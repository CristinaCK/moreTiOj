from rest_framework.routers import DefaultRouter

from .views import ContestViewSet

router = DefaultRouter()
router.register("contests", ContestViewSet, basename="contest")

urlpatterns = router.urls
