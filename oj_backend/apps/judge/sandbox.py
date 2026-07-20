"""
判题沙箱抽象层。

================================ 安全警告 ================================
本文件中的 LocalSandbox 仅用于本地开发与功能联调。
它只做基本资源限制（CPU 时间 / 地址空间 / 进程数 / 输出大小 / 墙钟超时），
**不提供文件系统、网络、系统调用层面的隔离**。

绝对不要在多用户 / 生产环境使用 LocalSandbox 运行不可信代码！
生产环境请实现 ProductionSandbox，把 run/compile 委托给真正的沙箱：
    - go-judge (criyle/go-judge)   —— 推荐，HTTP/gRPC 接口
    - QingdaoU/Judger              —— seccomp 沙箱
    - isolate                      —— Codeforces / ICPC 同款
只要这些适配器实现与 LocalSandbox 相同的接口，上层 runner 无需改动。
========================================================================
"""
import dataclasses
import math
import os
import signal
import subprocess
import threading
import time

from django.conf import settings


@dataclasses.dataclass
class RunResult:
    status: str          # ok / tle / mle / re / ole
    exit_code: int
    time_ms: int
    memory_kb: int
    stdout: str
    stderr: str


class BaseSandbox:
    def compile(self, workdir, compile_cmd, time_limit_sec=15):
        """返回 (ok: bool, error_message: str)。无需编译时返回 (True, "")。"""
        raise NotImplementedError

    def run(self, workdir, run_cmd, input_path, time_limit_ms, memory_mb,
            use_address_space_limit=True, output_limit_bytes=64 * 1024 * 1024):
        """运行一次，返回 RunResult。"""
        raise NotImplementedError

    def cleanup(self, workdir=None):
        """一次评测结束后的清理钩子（如删除远端缓存的编译产物）。默认无操作。"""


class LocalSandbox(BaseSandbox):
    """⚠️ 开发专用，无隔离。见文件顶部警告。"""

    def compile(self, workdir, compile_cmd, time_limit_sec=15):
        if not compile_cmd:
            return True, ""
        try:
            proc = subprocess.run(
                compile_cmd, cwd=workdir, capture_output=True,
                text=True, timeout=time_limit_sec,
            )
        except subprocess.TimeoutExpired:
            return False, "编译超时"
        if proc.returncode != 0:
            return False, (proc.stderr or proc.stdout or "编译失败")[:8000]
        return True, ""

    def run(self, workdir, run_cmd, input_path, time_limit_ms, memory_mb,
            use_address_space_limit=True, output_limit_bytes=64 * 1024 * 1024):
        import resource

        out_path = os.path.join(workdir, "__stdout")
        err_path = os.path.join(workdir, "__stderr")
        mem_bytes = memory_mb * 1024 * 1024
        cpu_seconds = math.ceil(time_limit_ms / 1000) + 1
        wall_limit = time_limit_ms / 1000.0 + 2.0  # 墙钟兜底

        pid = os.fork()
        if pid == 0:
            # ---------- 子进程 ----------
            try:
                os.setsid()
                fin = os.open(input_path, os.O_RDONLY)
                fout = os.open(out_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                ferr = os.open(err_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                os.dup2(fin, 0)
                os.dup2(fout, 1)
                os.dup2(ferr, 2)
                os.chdir(workdir)
                resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 1))
                resource.setrlimit(resource.RLIMIT_FSIZE, (output_limit_bytes, output_limit_bytes))
                if use_address_space_limit:
                    resource.setrlimit(resource.RLIMIT_AS, (mem_bytes, mem_bytes))
                try:
                    resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
                except (ValueError, OSError):
                    pass
                os.execvp(run_cmd[0], run_cmd)
            except Exception:
                os._exit(127)
            # ---------------------------

        # ---------- 父进程：墙钟看门狗 ----------
        timed_out = {"flag": False}

        def watchdog():
            time.sleep(wall_limit)
            try:
                os.killpg(pid, signal.SIGKILL)
                timed_out["flag"] = True
            except ProcessLookupError:
                pass

        wd = threading.Thread(target=watchdog, daemon=True)
        wd.start()
        start = time.monotonic()
        _, exit_status, rusage = os.wait4(pid, 0)
        wall_ms = int((time.monotonic() - start) * 1000)

        cpu_ms = int((rusage.ru_utime + rusage.ru_stime) * 1000)
        memory_kb = int(rusage.ru_maxrss)  # Linux 上单位为 KB
        time_ms = max(cpu_ms, 0)

        stdout = _read_capped(out_path, output_limit_bytes + 1024)
        stderr = _read_capped(err_path, 8192)
        produced = os.path.getsize(out_path) if os.path.exists(out_path) else 0

        # ---------- 判定状态 ----------
        status = "ok"
        exit_code = 0
        if timed_out["flag"] or cpu_ms > time_limit_ms:
            status = "tle"
        elif os.WIFSIGNALED(exit_status):
            sig = os.WTERMSIG(exit_status)
            if sig in (signal.SIGXCPU,):
                status = "tle"
            elif use_address_space_limit and memory_kb >= memory_mb * 1024 * 0.95:
                status = "mle"
            else:
                status = "re"
            exit_code = -sig
        elif os.WIFEXITED(exit_status):
            exit_code = os.WEXITSTATUS(exit_status)
            if exit_code != 0:
                status = "re"
        if produced > output_limit_bytes:
            status = "ole"
        if memory_kb > memory_mb * 1024 and status == "ok":
            status = "mle"

        return RunResult(
            status=status, exit_code=exit_code,
            time_ms=time_ms, memory_kb=memory_kb,
            stdout=stdout, stderr=stderr,
        )


def _read_capped(path, cap):
    try:
        with open(path, "rb") as f:
            data = f.read(cap)
        return data.decode("utf-8", "replace")
    except FileNotFoundError:
        return ""


def get_sandbox() -> BaseSandbox:
    backend = getattr(settings, "JUDGE_SANDBOX", "local")
    if backend == "local":
        return LocalSandbox()
    if backend == "go-judge":
        from .gojudge import GoJudgeSandbox
        return GoJudgeSandbox(base_url=getattr(settings, "GO_JUDGE_URL", "http://127.0.0.1:5050"))
    raise NotImplementedError(
        f"未实现的沙箱后端 '{backend}'。生产环境请实现 go-judge / Judger / isolate 适配器。"
    )
