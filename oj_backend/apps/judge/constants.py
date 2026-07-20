from django.db import models


class Verdict(models.TextChoices):
    PENDING = "pending", "等待中"
    JUDGING = "judging", "判题中"
    AC = "accepted", "通过"
    WA = "wa", "答案错误"
    TLE = "tle", "超时"
    MLE = "mle", "内存超限"
    RE = "re", "运行时错误"
    CE = "ce", "编译错误"
    PE = "pe", "格式错误"
    OLE = "ole", "输出超限"
    SE = "se", "系统错误"
