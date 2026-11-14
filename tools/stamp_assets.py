"""Stamp every CSS/JS reference with a build id so browsers never mix old and new files.

Run over a copy of frontend/ at deploy time: HTML links and ES module import
specifiers both get ?v=<build id>, so one push swaps the whole set at once.
"""
import pathlib
import re
import sys

HTML_REF = re.compile(r'(?P<attr>href|src)="(?P<path>(?:css|js)/[^"?]+\.(?:css|js))"')
JS_IMPORT = re.compile(r'(?P<head>(?:from|import\()\s*")(?P<path>\.{1,2}/[^"?]+\.js)"')


def stamp(root: pathlib.Path, build: str) -> int:
    changed = 0
    for path in sorted(root.rglob("*")):
        if path.suffix not in (".html", ".js") or not path.is_file():
            continue
        text = original = path.read_text(encoding="utf-8")
        if path.suffix == ".html":
            text = HTML_REF.sub(lambda m: f'{m["attr"]}="{m["path"]}?v={build}"', text)
        else:
            text = JS_IMPORT.sub(lambda m: f'{m["head"]}{m["path"]}?v={build}"', text)
        if text != original:
            path.write_text(text, encoding="utf-8")
            changed += 1
    return changed


if __name__ == "__main__":
    folder, build_id = sys.argv[1], sys.argv[2][:12]
    print(f"stamped {stamp(pathlib.Path(folder), build_id)} files with v={build_id}")
