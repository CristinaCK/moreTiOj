export const LANGUAGES = [
  { value: 'python3', label: 'Python 3', monaco: 'python' },
  { value: 'cpp', label: 'C++', monaco: 'cpp' },
]

export const monacoLangOf = (value) =>
  (LANGUAGES.find((l) => l.value === value) || {}).monaco || 'plaintext'

export const TEMPLATES = {
  python3: `import sys

def main():
    data = sys.stdin.read().split()
    # 在此编写你的代码

if __name__ == "__main__":
    main()
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // 在此编写你的代码
    return 0;
}
`,
}
