"""
判题编排：编译 → 逐测试点运行 → 比对（或 SPJ）→ 汇总。
满足需求：记录「第一个未通过的测试点」；样例测试点回显输入/输出，隐藏测试点不回显。
"""
import os
import subprocess
import tempfile

from .comparator import compare
from .constants import Verdict
from .languages import get_language
from .sandbox import get_sandbox

# verdict 优先级：用于在“全部跑完”时决定整体状态（取第一个非 AC）
_OK = "ok"


def run_judge(submission):
    from apps.submissions.models import SubmissionTestResult

    problem = submission.problem
    lang = get_language(submission.language)
    sandbox = get_sandbox()

    submission.status = Verdict.JUDGING
    submission.save(update_fields=["status"])

    test_cases = list(problem.test_cases.all())
    if not test_cases:
        submission.status = Verdict.SE
        submission.compile_error = "该题尚未配置测试数据"
        submission.save(update_fields=["status", "compile_error"])
        return

    with tempfile.TemporaryDirectory(prefix="judge_") as workdir:
        # 1) 写入源代码
        src_path = os.path.join(workdir, lang["source_name"])
        with open(src_path, "w", encoding="utf-8") as f:
            f.write(submission.code)

        # 2) 编译
        ok, err = sandbox.compile(workdir, lang["compile_cmd"])
        if not ok:
            submission.status = Verdict.CE
            submission.compile_error = err
            submission.save(update_fields=["status", "compile_error"])
            _bump_problem_stats(problem, accepted=False)
            _bump_user_stats(submission, accepted=False)
            return

        # 3) 准备 SPJ（如启用）
        spj_exe = None
        if problem.spj_enabled:
            spj_exe = _prepare_spj(workdir, problem)

        # 4) 逐测试点
        from collections import OrderedDict

        groups = OrderedDict()
        for tc in test_cases:
            groups.setdefault(tc.group, []).append(tc)
        has_bundle = any(g != 0 for g in groups)
        # 完整评测：捆绑题、OI 竞赛、以及练习(无竞赛)都要跑完所有测试点，
        # 才能得到正确的“部分分”（通过的点得分、不通过的不得分）。
        # 仅 ACM 竞赛可“首错即停”优化（排名只看是否通过，不计部分分）。
        is_acm = bool(submission.contest_id) and submission.contest.rule_type == "acm"
        full_judge = has_bundle or not is_acm

        entries = []          # [(tc, result, passed)]
        first_failed = None
        max_time = max_mem = 0
        time_limit = int(problem.time_limit * lang.get("time_multiplier", 1.0))
        mem_limit = problem.memory_limit

        run_cmd = [a.format(mem=mem_limit, exe="main", src=lang["source_name"]) for a in lang["run_cmd"]]

        for tc in test_cases:
            rr = sandbox.run(
                workdir, run_cmd, tc.input_file.path,
                time_limit_ms=time_limit, memory_mb=mem_limit,
                use_address_space_limit=lang.get("use_address_space_limit", True),
            )
            max_time = max(max_time, rr.time_ms)
            max_mem = max(max_mem, rr.memory_kb)

            if rr.status != _OK:
                verdict = rr.status  # tle / mle / re / ole
            else:
                expected = _read_text(tc.output_file.path)
                if spj_exe is not None:
                    verdict = _run_spj(workdir, spj_exe, tc.input_file.path, rr.stdout, expected)
                else:
                    verdict = compare(rr.stdout, expected, problem.compare_mode, problem.float_precision)

            passed = verdict == "ac"

            result = SubmissionTestResult(
                submission=submission, index=tc.index, status=verdict,
                time_used=rr.time_ms, memory_used=rr.memory_kb,
                score=0, group=tc.group, is_sample=tc.is_sample,
            )
            # 每个测试点都保存“选手输出”：供管理员审阅隐藏点的实际输出。
            # 普通用户仅能看到样例点，隐藏点的输出在序列化器里对非管理员抹除。
            # 输入/期望输出仍不逐份入库，查看详情时按需从题目测试文件读取，控制体积。
            result.actual_output = rr.stdout[:4000]
            entries.append((tc, result, passed))

            if not passed and first_failed is None:
                first_failed = tc.index
                if not full_judge:
                    break  # 非捆绑：首错即停

        # 5) 评分（捆绑：整组全过才得该组分；非捆绑：逐点计分）
        passed_by_index = {tc.index: p for (tc, _r, p) in entries}
        bundle_pass = {
            gid: all(passed_by_index.get(tc.index) for tc in tcs)
            for gid, tcs in groups.items() if gid != 0
        }
        total_score = 0
        for (tc, result, passed) in entries:
            if tc.group == 0:
                gained = tc.score if passed else 0
            else:
                gained = tc.score if bundle_pass.get(tc.group) else 0
            result.score = gained
            total_score += gained

        results = [r for (_t, r, _p) in entries]
        SubmissionTestResult.objects.bulk_create(results)

        all_passed = first_failed is None and len(entries) == len(test_cases)
        if all_passed:
            submission.status = Verdict.AC
        else:
            # 整体状态 = 第一个非 AC 测试点的状态
            submission.status = next((r.status for r in results if r.status != "ac"), Verdict.WA)

        submission.first_failed_index = first_failed
        submission.time_used = max_time
        submission.memory_used = max_mem
        submission.score = total_score
        submission.save(update_fields=[
            "status", "first_failed_index", "time_used", "memory_used", "score",
        ])
        _bump_problem_stats(problem, accepted=all_passed)
        _bump_user_stats(submission, accepted=all_passed)
        sandbox.cleanup(workdir)


# --------------------------- SPJ ---------------------------

def _prepare_spj(workdir, problem):
    """编译/准备出题人提供的 SPJ，返回可执行/可调用命令列表。"""
    if problem.spj_language == "python3":
        spj_path = os.path.join(workdir, "spj.py")
        with open(spj_path, "w", encoding="utf-8") as f:
            f.write(problem.spj_code)
        return ["python3", spj_path]
    # 默认 C++（兼容 testlib.h 风格 checker）
    spj_src = os.path.join(workdir, "spj.cpp")
    spj_bin = os.path.join(workdir, "spj")
    with open(spj_src, "w", encoding="utf-8") as f:
        f.write(problem.spj_code)
    # testlib.h 需放在编译可见路径；这里假设其位于 workdir 或系统 include
    subprocess.run(["g++", "-O2", "-std=c++17", "-w", spj_src, "-o", spj_bin],
                   cwd=workdir, capture_output=True, timeout=30)
    return [spj_bin]


def _run_spj(workdir, spj_cmd, input_path, user_output, answer):
    """
    调用 SPJ：argv = <input> <user_output_file> <answer_file>（testlib 约定）。
    退出码 0 => AC，否则 => WA。
    """
    user_out_path = os.path.join(workdir, "__user_out")
    ans_path = os.path.join(workdir, "__answer")
    with open(user_out_path, "w", encoding="utf-8") as f:
        f.write(user_output)
    with open(ans_path, "w", encoding="utf-8") as f:
        f.write(answer)
    try:
        proc = subprocess.run(
            spj_cmd + [input_path, user_out_path, ans_path],
            cwd=workdir, capture_output=True, text=True, timeout=15,
        )
        return "ac" if proc.returncode == 0 else "wa"
    except subprocess.TimeoutExpired:
        return "se"


# --------------------------- 辅助 ---------------------------

def _read_text(path):
    try:
        with open(path, "rb") as f:
            return f.read().decode("utf-8", "replace")
    except FileNotFoundError:
        return ""


def _bump_problem_stats(problem, accepted):
    from django.db.models import F
    from apps.problems.models import Problem

    updates = {"total_submit": F("total_submit") + 1}
    if accepted:
        updates["accepted_count"] = F("accepted_count") + 1
    Problem.objects.filter(id=problem.id).update(**updates)


def _bump_user_stats(submission, accepted):
    """提交数 +1；若为该用户对此题的首次 AC，则 AC 题数 +1（按题去重）。"""
    from django.db.models import F
    from apps.accounts.models import User
    from apps.submissions.models import Submission

    updates = {"submission_count": F("submission_count") + 1}
    if accepted:
        previously_solved = Submission.objects.filter(
            user_id=submission.user_id,
            problem_id=submission.problem_id,
            status="accepted",
        ).exclude(id=submission.id).exists()
        if not previously_solved:
            updates["accepted_count"] = F("accepted_count") + 1
    User.objects.filter(id=submission.user_id).update(**updates)


def run_custom(code, language, stdin_text, time_limit_ms=5000, memory_mb=256):
    """在线运行：编译并对自定义输入运行一次。不评测、不入库。

    返回 dict：
      {status: ok|ce|tle|mle|re|ole|error, compile_error, stdout, stderr, time_ms, memory_kb, exit_code}
    """
    try:
        lang = get_language(language)
    except ValueError as e:
        return {"status": "error", "compile_error": str(e), "stdout": "", "stderr": "",
                "time_ms": 0, "memory_kb": 0, "exit_code": 0}

    sandbox = get_sandbox()
    with tempfile.TemporaryDirectory(prefix="ojrun_") as workdir:
        # 源代码
        with open(os.path.join(workdir, lang["source_name"]), "w", encoding="utf-8") as f:
            f.write(code or "")
        # 编译（解释型语言 compile_cmd 为 None）
        if lang["compile_cmd"]:
            ok, err = sandbox.compile(workdir, lang["compile_cmd"])
            if not ok:
                return {"status": "ce", "compile_error": err, "stdout": "", "stderr": "",
                        "time_ms": 0, "memory_kb": 0, "exit_code": 0}
        # 自定义输入
        in_path = os.path.join(workdir, "__stdin")
        with open(in_path, "w", encoding="utf-8") as f:
            f.write(stdin_text or "")

        tl = int(time_limit_ms * lang.get("time_multiplier", 1.0))
        run_cmd = [a.format(mem=memory_mb, exe="main", src=lang["source_name"]) for a in lang["run_cmd"]]
        rr = sandbox.run(
            workdir, run_cmd, in_path,
            time_limit_ms=tl, memory_mb=memory_mb,
            use_address_space_limit=lang.get("use_address_space_limit", True),
            output_limit_bytes=256 * 1024,
        )
        sandbox.cleanup(workdir)
        return {
            "status": rr.status, "compile_error": "",
            "stdout": rr.stdout, "stderr": rr.stderr,
            "time_ms": rr.time_ms, "memory_kb": rr.memory_kb, "exit_code": rr.exit_code,
        }


# --------------------------- 程序填空题 ---------------------------

import re as _re


def _assemble_cloze(template, answers):
    """把模板里的 __1__ __2__ 替换为学生填写的内容。"""
    answers = answers or {}

    def repl(m):
        n = m.group(1)
        return str(answers.get(n, answers.get(int(n), "")) or "")

    return _re.sub(r"__(\d+)__", repl, template or "")


def _norm_blank(s):
    """去除全部空白，容忍 a + b / a+b 之类写法差异。"""
    return "".join(str(s or "").split())


def judge_cloze(submission):
    """程序填空题评测。
    - 评测机模式（cloze_use_judge=True）：组装完整代码后复用标准评测流程（需配测试点）。
    - 文本比对模式：逐空与参考答案比对（忽略空白），按答对比例给分。
    """
    from apps.submissions.models import SubmissionTestResult

    problem = submission.problem
    answers = submission.cloze_answers or {}

    submission.status = Verdict.JUDGING
    submission.save(update_fields=["status"])

    if problem.cloze_use_judge:
        code = _assemble_cloze(problem.cloze_template, answers)
        submission.code = code
        submission.language = problem.cloze_language or submission.language or "python3"
        submission.save(update_fields=["code", "language"])
        run_judge(submission)
        return

    refs = problem.cloze_answers or {}
    blank_ids = sorted(int(k) for k in refs.keys()) if refs else []
    if not blank_ids:
        submission.status = Verdict.SE
        submission.compile_error = "该填空题尚未配置参考答案"
        submission.save(update_fields=["status", "compile_error"])
        return

    n = len(blank_ids)
    per = 100 // n
    results = []
    correct = 0
    first_failed = None
    for i, bid in enumerate(blank_ids):
        accepted = refs.get(str(bid), refs.get(bid, []))
        if isinstance(accepted, str):
            accepted = [accepted]
        stu = answers.get(str(bid), answers.get(bid, ""))
        ok = _norm_blank(stu) in {_norm_blank(a) for a in accepted}
        score = ((per + (100 - per * n)) if i == n - 1 else per) if ok else 0
        if ok:
            correct += 1
        elif first_failed is None:
            first_failed = bid
        results.append(SubmissionTestResult(
            submission=submission, index=bid,
            status=Verdict.AC if ok else Verdict.WA,
            time_used=0, memory_used=0, score=score, group=0, is_sample=True,
        ))
    SubmissionTestResult.objects.bulk_create(results)

    all_ok = correct == n
    submission.status = Verdict.AC if all_ok else Verdict.WA
    submission.first_failed_index = first_failed
    submission.time_used = 0
    submission.memory_used = 0
    submission.score = sum(r.score for r in results)
    submission.save(update_fields=[
        "status", "first_failed_index", "time_used", "memory_used", "score",
    ])
    _bump_problem_stats(problem, accepted=all_ok)
    _bump_user_stats(submission, accepted=all_ok)
