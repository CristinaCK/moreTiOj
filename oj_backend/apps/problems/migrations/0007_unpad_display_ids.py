from django.db import migrations


def unpad(apps, schema_editor):
    """去掉已有题号的前导零：'00001' -> '1'，'00010' -> '10' …
    题号改为从 1 开始、无前导零显示。非数字题号保持不动；若去零后与已有题号冲突则跳过。"""
    Problem = apps.get_model("problems", "Problem")
    existing = set(Problem.objects.values_list("display_id", flat=True))
    rows = list(Problem.objects.values_list("pk", "display_id"))
    # 按数值从小到大处理，避免中间态撞号
    rows.sort(key=lambda r: int(r[1]) if (r[1] or "").isdigit() else 10 ** 18)
    for pk, d in rows:
        d = (d or "").strip()
        if not d.isdigit():
            continue
        new = str(int(d))
        if new == d or new in existing:
            continue
        Problem.objects.filter(pk=pk).update(display_id=new)
        existing.discard(d)
        existing.add(new)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("problems", "0006_zeropad_display_ids"),
    ]

    operations = [
        migrations.RunPython(unpad, noop),
        migrations.AlterModelOptions(
            name="problem",
            options={"ordering": ["id"]},
        ),
    ]
