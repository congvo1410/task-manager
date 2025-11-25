from django.urls import path, include

urlpatterns = [
    path('api/', include('tasks.urls')),
    path('api/auth/', include('tasks.auth_urls')),  # ✅ Thêm dòng này
]
