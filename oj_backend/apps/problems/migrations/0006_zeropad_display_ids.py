from django.db import migrations


def zeropad(apps, schema_editor):
    """把已有的纯数字题号左补零到 5 位：'1' -> '00001'，'2' -> '00002' …
    与新建题目的自动题号规则保持一致（A+B 即 00001）。
    非数字题号保持不动；若补零后会与已有题号冲突，则跳过该条以确保安全。"""
    Problem = apps.get_model("problems", "Problem")
    existing = set(Problem.objects.values_list("display_id", flat=True))
    rows = list(Problem.objects.values_list("pk", "display_id"))
    # 按数值从小到大处理，避免中间态撞号
    rows.sort(key=lambda r: int(r[1]) if (r[1] or "").isdigit() else 10 ** 18)
    for pk, d in rows:
        d = (d or "").strip()
        if not d.isdigit():
            continue
        new = d.zfill(5)
        if new == d or new in existing:
            continue
        Problem.objects.filter(pk=pk).update(display_id=new)
        existing.discard(d)
        existing.add(new)


def noop_reverse(apps, schema_editor):
    # 回滚不做去零处理（无损保留）
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("problems", "0005_problem_cloze_answers_problem_cloze_language_and_more"),
    ]

    operations = [
        migrations.RunPython(zeropad, noop_reverse),
    ]
