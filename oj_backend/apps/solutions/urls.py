from rest_framework.routers import DefaultRouter

from .views import SolutionViewSet

router = DefaultRouter()
router.register("solutions", SolutionViewSet, basename="solution")

urlpatterns = router.urls
