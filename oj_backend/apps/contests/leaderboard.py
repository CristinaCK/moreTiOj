"""
竞赛排行榜计算（内存聚合，适用于 ≤150 人规模）。
- ACM：按通过题数降序、罚时升序；罚时 = AC 相对分钟数 + AC 前错误次数 × 单次罚时。
- OI：按各题最高分之和降序、用时之和升序。
- 封榜（freeze）：若设置 freeze_minutes>0，比赛进入最后 N 分钟后，
  对普通观众榜单只统计封榜前的提交，封榜后的提交只展示为 frozen_attempts（尝试数）；
  比赛结束即自动解榜；创建者/管理员可传 full=True 查看实时全榜。
"""
from collections import defaultdict
from datetime import timedelta

from django.utils import timezone

# 计入罚时/错误的状态（CE、SE、判题中等不计）
_WRONG = {"wa", "tle", "mle", "re", "pe", "ole"}


def compute_leaderboard(contest, full=False):
    from apps.submissions.models import Submission

    cps = list(contest.contest_problems.select_related("problem").all())
    label_by_pid = {cp.problem_id: cp.label for cp in cps}
    labels = [cp.label for cp in cps]
    label_display = {cp.label: cp.problem.display_id for cp in cps}

    # 封榜判断
    frozen = False
    cutoff = None
    if not full and contest.freeze_minutes:
        freeze_start = contest.end_time - timedelta(minutes=contest.freeze_minutes)
        if contest.is_running and timezone.now() >= freeze_start:
            frozen = True
            cutoff = freeze_start

    subs = (
        Submission.objects.filter(
            contest=contest,
            created_at__gte=contest.start_time,
            created_at__lte=contest.end_time,
        )
        .select_related("user")
        .order_by("created_at")
    )

    users = {}
    stats = defaultdict(dict)              # user_id -> pid -> info
    frozen_attempts = defaultdict(int)     # (user_id, pid) -> 封榜后提交数
    # 已报名但未提交的选手也纳入榜单
    for p in contest.participants.select_related("user"):
        users[p.user_id] = p.user
        stats.setdefault(p.user_id, {})

    def info_for(uid, pid):
        return stats[uid].setdefault(
            pid, {"solved": False, "ac_minutes": 0, "wrong": 0, "best_score": 0, "best_time": 0}
        )

    is_acm = contest.rule_type == "acm"
    for s in subs:
        users[s.user_id] = s.user
        if frozen and s.created_at >= cutoff:
            frozen_attempts[(s.user_id, s.problem_id)] += 1
            continue
        info = info_for(s.user_id, s.problem_id)
        if is_acm:
            if info["solved"]:
                continue
            if s.status == "accepted":
                info["solved"] = True
                info["ac_minutes"] = int((s.created_at - contest.start_time).total_seconds() // 60)
            elif s.status in _WRONG:
                info["wrong"] += 1
        else:  # OI：取最高分
            if s.score > info["best_score"]:
                info["best_score"] = s.score
                info["best_time"] = s.time_used

    rows = []
    for uid, probs in stats.items():
        problem_cells = {}
        if is_acm:
            solved = penalty = 0
            for pid, label in label_by_pid.items():
                pinfo = probs.get(pid)
                cell = {"solved": False, "wrong": 0}
                if pinfo and pinfo["solved"]:
                    solved += 1
                    penalty += pinfo["ac_minutes"] + pinfo["wrong"] * contest.penalty_minutes
                    cell = {"solved": True, "wrong": pinfo["wrong"],
                            "ac_minutes": pinfo["ac_minutes"]}
                elif pinfo:
                    cell = {"solved": False, "wrong": pinfo["wrong"]}
                if frozen:
                    cell["frozen_attempts"] = frozen_attempts.get((uid, pid), 0)
                problem_cells[label] = cell
            u = users[uid]
            rows.append({"user": u.username, "name": u.display_name, "solved": solved,
                         "penalty": penalty, "problems": problem_cells})
        else:
            total = total_time = 0
            for pid, label in label_by_pid.items():
                pinfo = probs.get(pid)
                score = pinfo["best_score"] if pinfo else 0
                total += score
                total_time += pinfo["best_time"] if pinfo else 0
                cell = {"score": score}
                if frozen:
                    cell["frozen_attempts"] = frozen_attempts.get((uid, pid), 0)
                problem_cells[label] = cell
            u = users[uid]
            rows.append({"user": u.username, "name": u.display_name, "score": total,
                         "time": total_time, "problems": problem_cells})

    if is_acm:
        rows.sort(key=lambda r: (-r["solved"], r["penalty"]))
    else:
        rows.sort(key=lambda r: (-r["score"], r["time"]))
    for i, row in enumerate(rows, start=1):
        row["rank"] = i

    return {"rule_type": contest.rule_type, "labels": labels,
            "problem_ids": label_display,
            "frozen": frozen, "rows": rows}
