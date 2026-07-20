"""
go-judge（criyle/go-judge）HTTP 沙箱适配器 —— 生产环境推荐方案。

go-judge 提供 namespace/cgroup/seccomp 级别的真实隔离，本适配器把
BaseSandbox 的 compile/run 映射到它的 REST 接口（POST /run）。

⚠️ 重要：本适配器按 go-judge 公开文档的接口约定编写，但在本项目中
**尚未与真实 go-judge 服务联调验证**。启用前请：
  1. 部署 go-judge（官方提供 Docker 镜像，监听 5050 端口）；
  2. 对照其 README 核对请求/响应字段是否与当前版本一致；
  3. 跑通项目 README 的「快速自测」流程（A+B 三种语言）再投入使用。

配置（.env）：
  JUDGE_SANDBOX=go-judge
  GO_JUDGE_URL=http://127.0.0.1:5050

已知限制：SPJ 校验器目前仍由 runner 在本机 subprocess 中运行（见
runner._run_spj）。SPJ 由教师编写、风险较低，但若需彻底隔离，可仿照
本适配器把 SPJ 执行也迁移到 go-judge。
"""
import os

import requests

from .sandbox import BaseSandbox, RunResult

# go-judge 状态 → 本系统 RunResult.status
_STATUS_MAP = {
    "Accepted": "ok",
    "Time Limit Exceeded": "tle",
    "Memory Limit Exceeded": "mle",
    "Output Limit Exceeded": "ole",
    "Nonzero Exit Status": "re",
    "Signalled": "re",
    "Internal Error": "se",
    "File Error": "se",
}

# 解释型/运行所需的源文件白名单（编译产物走 fileId 缓存）
_SOURCE_FILES = {"main.py", "Main.java", "main.cpp"}

_ENV = ["PATH=/usr/local/bin:/usr/bin:/bin"]


class GoJudgeSandbox(BaseSandbox):
    def __init__(self, base_url, http_timeout=120):
        self.base_url = base_url.rstrip("/")
        self.http_timeout = http_timeout
        self._cached_files = {}  # 文件名 -> go-judge fileId（编译产物）

    # ------------------------------------------------------------------ #

    def _post_run(self, cmd):
        resp = requests.post(
            f"{self.base_url}/run", json={"cmd": [cmd]}, timeout=self.http_timeout
        )
        resp.raise_for_status()
        return resp.json()[0]

    @staticmethod
    def _read_text(path):
        with open(path, "rb") as f:
            return f.read().decode("utf-8", "replace")

    @staticmethod
    def _compile_output_name(compile_cmd):
        """从编译命令推断需要缓存的产物名。"""
        if "-o" in compile_cmd:
            return compile_cmd[compile_cmd.index("-o") + 1]
        if compile_cmd and compile_cmd[0] == "javac":
            return "Main.class"
        return None

    # ------------------------------------------------------------------ #

    def compile(self, workdir, compile_cmd, time_limit_sec=15):
        if not compile_cmd:
            return True, ""

        copy_in = {}
        for name in os.listdir(workdir):
            path = os.path.join(workdir, name)
            if os.path.isfile(path) and name in _SOURCE_FILES:
                copy_in[name] = {"content": self._read_text(path)}

        out_name = self._compile_output_name(compile_cmd)
        cmd = {
            "args": list(compile_cmd),
            "env": _ENV,
            "files": [
                {"content": ""},
                {"name": "stdout", "max": 65536},
                {"name": "stderr", "max": 65536},
            ],
            "cpuLimit": time_limit_sec * 1_000_000_000,          # ns
            "clockLimit": 2 * time_limit_sec * 1_000_000_000,    # ns（墙钟）
            "memoryLimit": 1024 * 1024 * 1024,                   # 编译给 1GB
            "procLimit": 64,
            "copyIn": copy_in,
            "copyOutCached": [out_name] if out_name else [],
        }
        try:
            result = self._post_run(cmd)
        except requests.RequestException as exc:
            return False, f"无法连接 go-judge：{exc}"

        if result.get("status") != "Accepted":
            files = result.get("files") or {}
            msg = files.get("stderr") or files.get("stdout") or result.get("status", "编译失败")
            return False, str(msg)[:8000]

        for name, file_id in (result.get("fileIds") or {}).items():
            self._cached_files[name] = file_id
        return True, ""

    def run(self, workdir, run_cmd, input_path, time_limit_ms, memory_mb,
            use_address_space_limit=True, output_limit_bytes=64 * 1024 * 1024):
        copy_in = {}
        for name, file_id in self._cached_files.items():
            copy_in[name] = {"fileId": file_id}
        for name in os.listdir(workdir):
            path = os.path.join(workdir, name)
            if os.path.isfile(path) and name in _SOURCE_FILES and name not in copy_in:
                copy_in[name] = {"content": self._read_text(path)}

        cmd = {
            "args": list(run_cmd),
            "env": _ENV,
            "files": [
                {"content": self._read_text(input_path)},
                {"name": "stdout", "max": output_limit_bytes},
                {"name": "stderr", "max": 8192},
            ],
            "cpuLimit": time_limit_ms * 1_000_000,                       # ns
            "clockLimit": time_limit_ms * 2 * 1_000_000 + 2_000_000_000, # 墙钟兜底
            "memoryLimit": memory_mb * 1024 * 1024,                      # bytes
            "procLimit": 64,
            "copyIn": copy_in,
        }
        try:
            result = self._post_run(cmd)
        except requests.RequestException:
            return RunResult(status="se", exit_code=-1, time_ms=0,
                             memory_kb=0, stdout="", stderr="go-judge 连接失败")

        files = result.get("files") or {}
        return RunResult(
            status=_STATUS_MAP.get(result.get("status"), "re"),
            exit_code=result.get("exitStatus", 0),
            time_ms=int(result.get("time", 0) / 1_000_000),
            memory_kb=int(result.get("memory", 0) / 1024),
            stdout=files.get("stdout", ""),
            stderr=files.get("stderr", ""),
        )

    def cleanup(self, workdir=None):
        """删除 go-judge 端缓存的编译产物，避免堆积。"""
        for file_id in self._cached_files.values():
            try:
                requests.delete(f"{self.base_url}/file/{file_id}", timeout=10)
            except requests.RequestException:
                pass
        self._cached_files.clear()
