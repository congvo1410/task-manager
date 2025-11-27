from rest_framework import serializers
from .models import Workspace, Board, List, Card, WorkspaceMember

class WorkspaceSerializer(serializers.ModelSerializer):
    user_role = serializers.SerializerMethodField() # Trả về vai trò của user hiện tại

    class Meta:
        model = Workspace
        fields = '__all__'

    def get_user_role(self, obj):
        user = self.context['request'].user
        
        # 1. Nếu chưa đăng nhập -> Không có quyền gì hết
        if user.is_anonymous:
            return None 

        # 2. Nếu là Superuser (Admin hệ thống) -> Trả về 'system_admin' (Quyền to nhất)
        if user.is_superuser:
            return 'system_admin'

        # 3. QUAN TRỌNG: Nếu là Người tạo ra Workspace này -> Trả về 'owner'
        # (Dòng này giúp Member thấy nút Xóa ở Workspace do chính mình tạo)
        if obj.owner == user:
            return 'owner'

        # 4. Kiểm tra trong bảng thành viên bình thường (cho các vai trò được mời)
        try:
            member = WorkspaceMember.objects.get(workspace=obj, user=user)
            return member.role
        except WorkspaceMember.DoesNotExist:
            return None

class WorkspaceMemberSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    class Meta:
        model = WorkspaceMember
        fields = ['id', 'workspace', 'user', 'username', 'email', 'role', 'joined_at']

class BoardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Board
        fields = ['id', 'name', 'owner', 'workspace', 'created_at']
        extra_kwargs = {'owner': {'required': False}, 'workspace': {'required': False}}

class ListSerializer(serializers.ModelSerializer):
    cards = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    class Meta:
        model = List
        fields = '__all__'

class CardSerializer(serializers.ModelSerializer):
    is_overdue = serializers.BooleanField(read_only=True)
    class Meta:
        model = Card
        fields = '__all__'