from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="contest",
            name="hide_results_during_contest",
            field=models.BooleanField(default=False, verbose_name="赛中隐藏成绩与榜单"),
        ),
    ]
