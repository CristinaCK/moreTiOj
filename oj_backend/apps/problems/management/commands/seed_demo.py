"""
生成演示数据：一个管理员账号 + 一道带测试点的示例题（A+B Problem）。
用法：python manage.py seed_demo
"""
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from apps.problems.models import Problem, Tag, TestCase
from apps.accounts.models import User


class Command(BaseCommand):
    help = "创建演示用的管理员与示例题目"

    def handle(self, *args, **options):
        admin, created = User.objects.get_or_create(
            username="admin",
            defaults={"email": "admin@example.com", "real_name": "管理员", "role": User.Role.ADMIN,
                      "email_verified": True, "is_staff": True, "is_superuser": True},
        )
        if created:
            admin.set_password("admin12345")
            admin.save()
            self.stdout.write(self.style.SUCCESS("已创建管理员 admin / admin12345"))

        problem, p_created = Problem.objects.get_or_create(
            display_id="1",
            defaults={
                "title": "A + B Problem",
                "difficulty": Problem.Difficulty.ENTRY,
                "description": "输入两个整数 a 和 b，输出它们的和。",
                "input_description": "一行两个整数 a b。",
                "output_description": "一个整数，表示 a + b。",
                "samples": [{"input": "1 2", "output": "3", "note": "1 + 2 = 3"}],
                "time_limit": 1000,
                "memory_limit": 256,
                "visibility": Problem.Visibility.PUBLIC,
                "created_by": admin,
            },
        )
        if p_created:
            problem.tags.add(Tag.objects.get_or_create(name="数学")[0])
            cases = [("1 2\n", "3\n", True), ("100 200\n", "300\n", False),
                     ("-5 5\n", "0\n", False)]
            for i, (inp, out, is_sample) in enumerate(cases, start=1):
                tc = TestCase(problem=problem, index=i, score=10, is_sample=is_sample)
                tc.input_file.save(f"p1_{i}.in", ContentFile(inp.encode()), save=False)
                tc.output_file.save(f"p1_{i}.out", ContentFile(out.encode()), save=False)
                tc.save()
            self.stdout.write(self.style.SUCCESS("已创建示例题目 #1 A+B Problem（含 3 个测试点）"))
        self.stdout.write(self.style.SUCCESS("演示数据就绪。"))
