from django.contrib import admin
from django.urls import include, path

from apps.accounts.views import RankingView

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/ranking/", RankingView.as_view(), name="ranking"),
    path("api/", include("apps.problems.urls")),
    path("api/", include("apps.submissions.urls")),
    path("api/", include("apps.contests.urls")),
    path("api/", include("apps.classes.urls")),
    path("api/", include("apps.discussions.urls")),
    path("api/", include("apps.solutions.urls")),
    path("api/", include("apps.notifications.urls")),
]
