"""输出比对：返回 'ac' / 'wa' / 'pe'。"""


def _normalize(text: str):
    # 去掉每行行末空白，并去掉结尾多余空行
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").split("\n")]
    while lines and lines[-1] == "":
        lines.pop()
    return lines


def compare(actual: str, expected: str, mode: str = "default", float_precision: float = 1e-6) -> str:
    if mode == "strict":
        return "ac" if actual == expected else "wa"

    if mode == "float":
        a_tokens = actual.split()
        e_tokens = expected.split()
        if len(a_tokens) != len(e_tokens):
            return "wa"
        for at, et in zip(a_tokens, e_tokens):
            try:
                if abs(float(at) - float(et)) > float_precision:
                    return "wa"
            except ValueError:
                if at != et:
                    return "wa"
        return "ac"

    # default：规范化后逐行比对
    a_norm = _normalize(actual)
    e_norm = _normalize(expected)
    if a_norm == e_norm:
        return "ac"
    # 若仅空白差异（token 序列相同），判 PE
    if actual.split() == expected.split():
        return "pe"
    return "wa"
