from django.db import migrations, models


def backfill_is_sample(apps, schema_editor):
    """已有记录：凡回显过数据（输入/期望/实际任一非空）的测试点即当时的样例点，
    标记 is_sample=True，避免更新后作者反而看不到自己旧提交的样例数据。"""
    STR = apps.get_model("submissions", "SubmissionTestResult")
    STR.objects.exclude(input_preview="").update(is_sample=True)
    STR.objects.exclude(expected_output="").update(is_sample=True)
    STR.objects.exclude(actual_output="").update(is_sample=True)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("submissions", "0003_submission_cloze_answers"),
    ]

    operations = [
        migrations.AddField(
            model_name="submissiontestresult",
            name="is_sample",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(backfill_is_sample, noop),
    ]
