from django.db import migrations


# 旧三档 -> 洛谷新等级 的映射
OLD_TO_NEW = {
    "easy": "pop_minus",     # 简单   -> 普及−
    "medium": "pop_plus",    # 中等   -> 普及+/提高
    "hard": "imp_plus",      # 困难   -> 提高+/省选−
}
NEW_TO_OLD = {v: k for k, v in OLD_TO_NEW.items()}


def forwards(apps, schema_editor):
    Problem = apps.get_model("problems", "Problem")
    for old, new in OLD_TO_NEW.items():
        Problem.objects.filter(difficulty=old).update(difficulty=new)


def backwards(apps, schema_editor):
    Problem = apps.get_model("problems", "Problem")
    for new, old in NEW_TO_OLD.items():
        Problem.objects.filter(difficulty=new).update(difficulty=old)


class Migration(migrations.Migration):

    dependencies = [
        ("problems", "0002_alter_problem_difficulty"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
