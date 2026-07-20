from django.conf import settings
from django.db import models


def default_languages():
    return ["python3", "cpp"]


class Tag(models.Model):
    name = models.CharField("标签", max_length=64, unique=True)

    def __str__(self):
        return self.name


class Problem(models.Model):
    class Difficulty(models.TextChoices):
        # 参考洛谷难度分级（由低到高）
        UNRATED = "unrated", "暂无评定"
        ENTRY = "entry", "入门"
        POP_MINUS = "pop_minus", "普及−"
        POP = "pop", "普及/提高−"
        POP_PLUS = "pop_plus", "普及+/提高"
        IMP_PLUS = "imp_plus", "提高+/省选−"
        PROVINCIAL = "provincial", "省选/NOI−"
        NOI = "noi", "NOI/NOI+/CTSC"

    class Visibility(models.TextChoices):
        PUBLIC = "public", "公开"
        HIDDEN = "hidden", "隐藏（草稿）"
        CONTEST = "contest", "仅竞赛可见"
        CLASS = "class", "仅指定班级可见"

    class CompareMode(models.TextChoices):
        DEFAULT = "default", "默认（忽略行末空格）"
        STRICT = "strict", "严格逐字节"
        FLOAT = "float", "浮点误差"

    # 展示题号，与主键解耦，便于教师自定义
    display_id = models.CharField("题号", max_length=32, unique=True)
    title = models.CharField("标题", max_length=255)
    difficulty = models.CharField(max_length=16, choices=Difficulty.choices, default=Difficulty.ENTRY)

    description = models.TextField("题目描述（Markdown）", blank=True, default="")
    input_description = models.TextField("输入说明", blank=True, default="")
    output_description = models.TextField("输出说明", blank=True, default="")
    samples = models.JSONField("样例", default=list)  # [{"input": "...", "output": "...", "note": "..."}]
    hint = models.TextField("提示", blank=True, default="")
    source = models.CharField("来源", max_length=255, blank=True, default="")

    time_limit = models.PositiveIntegerField("时间限制(ms)", default=1000)
    memory_limit = models.PositiveIntegerField("内存限制(MB)", default=512)

    compare_mode = models.CharField(max_length=16, choices=CompareMode.choices, default=CompareMode.DEFAULT)
    float_precision = models.FloatField("浮点精度", default=1e-6)

    # Special Judge：由出题人编写
    spj_enabled = models.BooleanField("启用 SPJ", default=False)
    spj_language = models.CharField("SPJ 语言", max_length=16, blank=True, default="cpp")
    spj_code = models.TextField("SPJ 源代码", blank=True, default="")

    allowed_languages = models.JSONField("允许语言", default=default_languages)

    class ProblemType(models.TextChoices):
        STANDARD = "standard", "标准题"
        CLOZE = "cloze", "程序填空题"

    problem_type = models.CharField("题型", max_length=16, choices=ProblemType.choices,
                                    default=ProblemType.STANDARD)
    # 程序填空题：模板用 __1__ __2__ 形式挖空
    cloze_template = models.TextField("填空模板", blank=True, default="")
    cloze_language = models.CharField("填空语言", max_length=16, blank=True, default="")
    cloze_use_judge = models.BooleanField("填空-是否评测机判定", default=False)
    cloze_answers = models.JSONField("填空参考答案", default=dict, blank=True)
    visibility = models.CharField(max_length=16, choices=Visibility.choices, default=Visibility.HIDDEN)

    tags = models.ManyToManyField(Tag, blank=True, related_name="problems")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_problems"
    )

    total_submit = models.PositiveIntegerField(default=0)
    accepted_count = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]

    @property
    def accept_rate(self):
        return round(self.accepted_count / self.total_submit * 100, 1) if self.total_submit else 0.0

    def __str__(self):
        return f"{self.display_id}. {self.title}"


class TestCase(models.Model):
    """一个测试点：一对 .in / .out 文件。"""

    problem = models.ForeignKey(Problem, on_delete=models.CASCADE, related_name="test_cases")
    index = models.PositiveIntegerField("序号")
    input_file = models.FileField("输入(.in)", upload_to="testcases/")
    output_file = models.FileField("输出(.out)", upload_to="testcases/")
    score = models.PositiveIntegerField("分值", default=10)
    group = models.PositiveIntegerField("子任务组(0=独立计分；同组捆绑：全过才得分)", default=0)
    is_sample = models.BooleanField("是否样例/可见", default=False)

    class Meta:
        ordering = ["index"]
        unique_together = ("problem", "index")

    def __str__(self):
        return f"{self.problem.display_id} #{self.index}"
