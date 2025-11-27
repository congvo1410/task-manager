from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.db.models import Q 
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from rest_framework import viewsets, permissions, generics, status
from rest_framework.response import Response
from rest_framework.serializers import ModelSerializer
from rest_framework.decorators import action
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from .models import Workspace, Board, List, Card, WorkspaceMember
from .serializers import WorkspaceSerializer, BoardSerializer, ListSerializer, CardSerializer, WorkspaceMemberSerializer

# ===================== USER AUTH ===================== #
class RegisterSerializer(ModelSerializer):
    class Meta:
        model = User
        fields = ['username', 'password', 'email']
        extra_kwargs = {'password': {'write_only': True}}
    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password']
        )
        return user

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

class LoginView(generics.GenericAPIView):
    permission_classes = [permissions.AllowAny]
    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        user = authenticate(username=username, password=password)
        if user:
            return Response({"message": "Đăng nhập thành công!", "username": user.username})
        return Response({"error": "Sai tên đăng nhập hoặc mật khẩu!"}, status=status.HTTP_400_BAD_REQUEST)

# ===================== WORKSPACE ===================== #
class WorkspaceViewSet(viewsets.ModelViewSet):
    serializer_class = WorkspaceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Workspace.objects.filter(is_deleted=False)

    def perform_create(self, serializer):
        user = self.request.user
        workspace = serializer.save(owner=user)
        WorkspaceMember.objects.create(workspace=workspace, user=user, role='admin')

    def destroy(self, request, *args, **kwargs):
        workspace = self.get_object()
        user = request.user
        if user.is_superuser or workspace.owner == user:
            workspace.is_deleted = True
            workspace.deleted_at = timezone.now()
            workspace.save()
            return Response({"message": "Đã chuyển vào thùng rác"}, status=204)
        else:
            return Response({"error": "Chỉ người tạo mới được xóa Workspace này!"}, status=403)

    @action(detail=True, methods=['get'])
    def members(self, request, pk=None):
        workspace = self.get_object()
        members = WorkspaceMember.objects.filter(workspace=workspace)
        serializer = WorkspaceMemberSerializer(members, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def add_member(self, request, pk=None):
        workspace = self.get_object()
        user = request.user
        is_authorized = False
        if user.is_superuser or workspace.owner == user:
            is_authorized = True
        elif WorkspaceMember.objects.filter(workspace=workspace, user=user, role='admin').exists():
            is_authorized = True

        if not is_authorized:
            return Response({"error": "Bạn không có quyền thêm thành viên"}, status=403)

        email = request.data.get('email')
        try:
            user_to_add = User.objects.get(email=email)
            if WorkspaceMember.objects.filter(workspace=workspace, user=user_to_add).exists():
                return Response({"error": "Người này đã là thành viên!"}, status=400)
            WorkspaceMember.objects.create(workspace=workspace, user=user_to_add, role='member')
            return Response({"message": "Đã thêm thành viên!"})
        except User.DoesNotExist:
            return Response({"error": "Email không tồn tại!"}, status=404)

    @action(detail=True, methods=['post'])
    def remove_member(self, request, pk=None):
        workspace = self.get_object()
        user = request.user
        is_authorized = False
        if user.is_superuser or workspace.owner == user:
            is_authorized = True
        elif WorkspaceMember.objects.filter(workspace=workspace, user=user, role='admin').exists():
            is_authorized = True

        if not is_authorized:
            return Response({"error": "Bạn không có quyền xóa thành viên"}, status=403)

        target_user_id = request.data.get('user_id')
        if workspace.owner and target_user_id == workspace.owner.id:
             return Response({"error": "Không thể xóa chủ sở hữu!"}, status=400)

        WorkspaceMember.objects.filter(workspace=workspace, user_id=target_user_id).delete()
        return Response({"message": "Đã xóa thành viên!"})

    @action(detail=True, methods=['post'])
    def update_member_role(self, request, pk=None):
        workspace = self.get_object()
        user = request.user
        if not (user.is_superuser or workspace.owner == user):
            return Response({"error": "Chỉ chủ sở hữu mới được phân quyền!"}, status=403)

        target_user_id = request.data.get('user_id')
        new_role = request.data.get('role')
        if target_user_id == user.id:
             return Response({"error": "Không thể tự đổi quyền của chính mình!"}, status=400)

        try:
            member = WorkspaceMember.objects.get(workspace=workspace, user_id=target_user_id)
            member.role = new_role
            member.save()
            return Response({"message": f"Đã cập nhật quyền thành {new_role}!"})
        except WorkspaceMember.DoesNotExist:
            return Response({"error": "Thành viên không tồn tại"}, status=404)

    @action(detail=False, methods=['get'])
    def trash(self, request):
        user = request.user
        deleted = Workspace.objects.filter(
            Q(owner=user) | Q(memberships__user=user, memberships__role='admin'),
            is_deleted=True
        ).distinct()
        serializer = self.get_serializer(deleted, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        try:
            ws = Workspace.objects.get(pk=pk, is_deleted=True)
            if ws.owner != request.user and not request.user.is_superuser:
                 return Response({"error": "Không có quyền"}, status=403)
            ws.is_deleted = False
            ws.deleted_at = None
            ws.save()
            return Response({"message": "Đã khôi phục"})
        except Workspace.DoesNotExist: return Response({"error": "Không tìm thấy"}, status=404)


# ===================== BOARD & LIST ===================== #
class BoardViewSet(viewsets.ModelViewSet):
    queryset = Board.objects.all()
    serializer_class = BoardSerializer
    permission_classes = [permissions.IsAuthenticated]
    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

class ListViewSet(viewsets.ModelViewSet):
    queryset = List.objects.all()
    serializer_class = ListSerializer
    permission_classes = [permissions.IsAuthenticated]

# ===================== CARD (LOGIC CHUẨN) ===================== #
class CardViewSet(viewsets.ModelViewSet):
    serializer_class = CardSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Lấy thẻ đang hoạt động (Chưa xóa và Chưa cất kho)
        queryset = Card.objects.filter(is_deleted=False, is_archived=False)
        date_str = self.request.query_params.get('date')
        if date_str: queryset = queryset.filter(due_date=date_str)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    # 1. XÓA MỀM -> VÀO THÙNG RÁC (Lưu vĩnh viễn)
    @action(detail=True, methods=['post'])
    def soft_delete(self, request, pk=None):
        card = self.get_object()
        card.is_deleted = True # Đánh dấu là Đã xóa
        card.is_archived = False # Đảm bảo không nằm trong kho
        card.deleted_at = timezone.now()
        card.save()
        return Response({"message": "Đã vào thùng rác (Lưu vĩnh viễn)"})

    # 2. XEM THÙNG RÁC (Chỉ hiện thẻ đã xóa)
    @action(detail=False, methods=['get'])
    def trash(self, request):
        # Không có logic xóa tự động ở đây
        trash_cards = Card.objects.filter(is_deleted=True)
        serializer = self.get_serializer(trash_cards, many=True)
        return Response(serializer.data)

    # 3. KHÔI PHỤC (Dùng chung cho cả Thùng rác và Kho)
    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        try:
            c = Card.objects.get(pk=pk)
            c.is_deleted = False
            c.deleted_at = None
            c.is_archived = False
            c.archived_at = None
            c.save()
            return Response({"message": "Khôi phục thành công"})
        except Card.DoesNotExist: return Response({"error": "Không tìm thấy"}, status=404)

    # 4. LƯU TRỮ -> VÀO KHO (Cho thẻ đã xong)
    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        c = self.get_object()
        c.is_archived = True
        c.is_deleted = False # Đảm bảo không nằm trong thùng rác
        c.archived_at = timezone.now()
        c.status = 'DONE'
        c.save()
        return Response({"message": "Đã lưu trữ (Tự xóa sau 7 ngày)"})

    # 5. XEM KHO LƯU TRỮ (Tự xóa sau 7 ngày)
    @action(detail=False, methods=['get'])
    def archived(self, request):
        # Logic xóa tự động cho Kho lưu trữ
        deadline = timezone.now() - timedelta(days=7)
        Card.objects.filter(is_archived=True, archived_at__lt=deadline).delete()

        archived_cards = Card.objects.filter(is_archived=True)
        serializer = self.get_serializer(archived_cards, many=True)
        return Response(serializer.data)

class UserViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [IsAdminUser]