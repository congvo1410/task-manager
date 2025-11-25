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

    # --- SỬA: CHO PHÉP HIỆN TẤT CẢ WORKSPACE (CHƯA XÓA) ---
    # Để Member có thể thấy được Workspace cũ của Admin
    def get_queryset(self):
        return Workspace.objects.filter(is_deleted=False)

    def perform_create(self, serializer):
        user = self.request.user
        workspace = serializer.save(owner=user)
        # Người tạo auto là Admin
        WorkspaceMember.objects.create(workspace=workspace, user=user, role='admin')

    # XÓA MỀM (Soft Delete) - Chỉ Admin workspace mới được xóa
    def destroy(self, request, *args, **kwargs):
        workspace = self.get_object()
        
        # Logic kiểm tra quyền: Owner hoặc Admin Workspace
        is_authorized = False
        if workspace.owner == request.user:
            is_authorized = True
        else:
            try:
                member = WorkspaceMember.objects.get(workspace=workspace, user=request.user)
                if member.role == 'admin':
                    is_authorized = True
            except WorkspaceMember.DoesNotExist:
                pass
        
        if not is_authorized:
            return Response({"error": "Bạn không có quyền xóa Workspace này!"}, status=403)

        workspace.is_deleted = True
        workspace.deleted_at = timezone.now()
        workspace.save()
        return Response({"message": "Đã chuyển vào thùng rác"}, status=204)

    # API Xem thùng rác Workspace
    @action(detail=False, methods=['get'])
    def trash(self, request):
        user = request.user
        # Lấy các workspace đã xóa mà user là owner HOẶC là admin
        deleted_workspaces = Workspace.objects.filter(
            Q(owner=user) | Q(memberships__user=user, memberships__role='admin'),
            is_deleted=True
        ).distinct()
        
        serializer = self.get_serializer(deleted_workspaces, many=True)
        return Response(serializer.data)

    # API Khôi phục Workspace
    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        try:
            workspace = Workspace.objects.get(pk=pk, is_deleted=True)
            # Kiểm tra quyền
            is_authorized = False
            if workspace.owner == request.user:
                is_authorized = True
            else:
                try:
                    member = WorkspaceMember.objects.get(workspace=workspace, user=request.user)
                    if member.role == 'admin':
                        is_authorized = True
                except WorkspaceMember.DoesNotExist:
                    pass
            
            if not is_authorized:
                return Response({"error": "Không có quyền khôi phục"}, status=403)
            
            workspace.is_deleted = False
            workspace.deleted_at = None
            workspace.save()
            return Response({"message": "Đã khôi phục workspace"})
        except Workspace.DoesNotExist:
            return Response({"error": "Không tìm thấy workspace"}, status=404)

    @action(detail=True, methods=['get'])
    def members(self, request, pk=None):
        workspace = self.get_object()
        members = WorkspaceMember.objects.filter(workspace=workspace)
        serializer = WorkspaceMemberSerializer(members, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def add_member(self, request, pk=None):
        workspace = self.get_object()
        # Check quyền
        is_admin = False
        if workspace.owner == request.user:
            is_admin = True
        elif WorkspaceMember.objects.filter(workspace=workspace, user=request.user, role='admin').exists():
            is_admin = True
            
        if not is_admin:
            return Response({"error": "Chỉ Admin mới được thêm thành viên"}, status=403)

        email = request.data.get('email')
        try:
            user_to_add = User.objects.get(email=email)
            if WorkspaceMember.objects.filter(workspace=workspace, user=user_to_add).exists():
                return Response({"error": "Đã là thành viên!"}, status=400)
            
            WorkspaceMember.objects.create(workspace=workspace, user=user_to_add, role='member')
            return Response({"message": "Đã thêm thành viên!"})
        except User.DoesNotExist:
            return Response({"error": "Email không tồn tại!"}, status=404)

    @action(detail=True, methods=['post'])
    def remove_member(self, request, pk=None):
        workspace = self.get_object()
        # Check quyền
        is_admin = False
        if workspace.owner == request.user:
            is_admin = True
        elif WorkspaceMember.objects.filter(workspace=workspace, user=request.user, role='admin').exists():
            is_admin = True

        if not is_admin:
            return Response({"error": "Chỉ Admin mới được xóa thành viên"}, status=403)

        user_id = request.data.get('user_id')
        WorkspaceMember.objects.filter(workspace=workspace, user_id=user_id).delete()
        return Response({"message": "Đã xóa thành viên!"})


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

# ===================== CARD (QUAN TRỌNG) ===================== #
class CardViewSet(viewsets.ModelViewSet):
    serializer_class = CardSerializer
    permission_classes = [permissions.IsAuthenticated]

    # --- SỬA LẠI: LỌC CARD CHỨ KHÔNG PHẢI WORKSPACE ---
    def get_queryset(self):
        # Lấy các thẻ chưa xóa và chưa lưu trữ
        queryset = Card.objects.filter(is_deleted=False, is_archived=False)
        
        # Hỗ trợ lọc theo ngày
        date_str = self.request.query_params.get('date')
        if date_str:
            queryset = queryset.filter(due_date=date_str)
            
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def soft_delete(self, request, pk=None):
        card = self.get_object()
        card.is_deleted = True
        card.deleted_at = timezone.now()
        card.save()
        return Response({"message": "Đã vào thùng rác"})

    @action(detail=False, methods=['get'])
    def trash(self, request):
        deadline = timezone.now() - timedelta(days=5)
        Card.objects.filter(is_deleted=True, deleted_at__lt=deadline).delete()
        trash_cards = Card.objects.filter(is_deleted=True)
        serializer = self.get_serializer(trash_cards, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        try:
            card = Card.objects.get(pk=pk)
            card.is_deleted = False
            card.deleted_at = None
            card.save()
            return Response({"message": "Khôi phục thành công"})
        except Card.DoesNotExist: return Response({"error": "Không tìm thấy"}, status=404)

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        card = self.get_object()
        card.is_archived = True
        card.save()
        return Response({"message": "Đã lưu trữ"})

    @action(detail=False, methods=['get'])
    def archived(self, request):
        archived_cards = Card.objects.filter(is_archived=True, is_deleted=False)
        serializer = self.get_serializer(archived_cards, many=True)
        return Response(serializer.data)

# ===================== USER VIEWSET ===================== #
class UserViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [IsAdminUser]