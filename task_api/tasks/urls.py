from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from .views import (
    WorkspaceViewSet, 
    BoardViewSet, 
    ListViewSet, 
    CardViewSet, 
    UserViewSet, 
    RegisterView, 
    LoginView
)

router = DefaultRouter()
# Đăng ký các router với basename để tránh lỗi AssertionError
router.register(r'workspaces', WorkspaceViewSet, basename='workspace')
router.register(r'boards', BoardViewSet)
router.register(r'lists', ListViewSet)
router.register(r'cards', CardViewSet, basename='card')
router.register(r'users', UserViewSet)

urlpatterns = [
    # --- QUAN TRỌNG: ĐÂY LÀ PHẦN BỊ THIẾU GÂY LỖI 404 ---
    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    # ----------------------------------------------------

    path('register/', RegisterView.as_view(), name='register'),
    # path('login/', LoginView.as_view(), name='login'), # Bạn có thể dùng cái này hoặc token/ ở trên
    
    path('', include(router.urls)),
]