from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta

class Workspace(models.Model):
    name = models.CharField(max_length=255)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    # Mối quan hệ Members
    members = models.ManyToManyField(User, through='WorkspaceMember', related_name='workspaces')
    
    # === THÊM TRƯỜNG CHO THÙNG RÁC ===
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.name

class WorkspaceMember(models.Model):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('member', 'Member'),
    ]
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='member')
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('workspace', 'user')

    def __str__(self):
        return f"{self.user.username} ({self.role})"

# === Các Model dưới giữ nguyên ===
class Board(models.Model):
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='boards', null=True, blank=True
    )
    name = models.CharField(max_length=255)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    # Board cũng nên có is_deleted nếu muốn xóa mềm board, nhưng tạm thời workspace quan trọng hơn
    def __str__(self): return self.name

class List(models.Model):
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name='lists')
    title = models.CharField(max_length=255)
    order = models.PositiveIntegerField(default=0)
    def __str__(self): return self.title

class Card(models.Model):
    STATUS_CHOICES = [('TODO', 'Đang làm'), ('DONE', 'Đã xong'), ('CANCELLED', 'Đã hủy')]
    list = models.ForeignKey(List, on_delete=models.CASCADE, related_name='cards')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    due_date = models.DateField(blank=True, null=True)
    labels = models.CharField(max_length=255, blank=True, null=True)
    order = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='cards', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='TODO')
    is_archived = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    @property
    def is_overdue(self):
        if self.due_date and self.status != 'DONE' and not self.is_deleted and not self.is_archived:
            return timezone.now().date() > self.due_date
        return False
    def __str__(self): return self.title