"""
各语言的编译 / 运行配置。
{src} 源文件名，{exe} 可执行名，{mem} 内存限制(MB)。
"""

LANGUAGES = {
    "python3": {
        "source_name": "main.py",
        "compile_cmd": None,                       # 解释型，无需编译
        "run_cmd": ["python3", "main.py"],
        # Python/Java 的虚拟内存远大于实际，置 None 表示不用 RLIMIT_AS 卡内存
        "use_address_space_limit": False,
        "time_multiplier": 3.0,
    },
    "cpp": {
        "source_name": "main.cpp",
        "compile_cmd": ["g++", "-O2", "-std=c++17", "-w", "main.cpp", "-o", "main"],
        "run_cmd": ["./main"],
        "use_address_space_limit": True,
        "time_multiplier": 1.0,
    },
}


def get_language(name):
    if name not in LANGUAGES:
        raise ValueError(f"不支持的语言: {name}")
    return LANGUAGES[name]
