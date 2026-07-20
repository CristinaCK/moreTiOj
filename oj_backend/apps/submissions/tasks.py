import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task
def judge_submission(submission_id: int):
    """
    评测一次提交：交给 judge.runner 编译 + 逐测试点运行 + 比对，
    回写 Submission 状态、各测试点结果、第一个未通过的测试点。
    """
    from apps.judge.runner import run_judge
    from .models import Submission

    submission = Submission.objects.select_related("problem").filter(id=submission_id).first()
    if not submission:
        logger.warning("submission %s not found", submission_id)
        return
    try:
        if submission.problem.problem_type == "cloze":
            from apps.judge.runner import judge_cloze
            judge_cloze(submission)
        else:
            run_judge(submission)
    except Exception:  # 兜底，避免 worker 因单次异常崩溃
        logger.exception("judge failed for submission %s", submission_id)
        submission.status = "se"
        submission.save(update_fields=["status"])
