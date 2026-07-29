"""把 content/ 同步到 app/public/content/，供 vite dev 与 build 同源托管（构建框架 §四）。"""
from __future__ import annotations

import shutil
from pathlib import Path

from common import repo_root


def main() -> None:
    src = repo_root() / "content"
    dst = repo_root() / "app" / "public" / "content"
    if dst.exists():
        shutil.rmtree(dst)
    if src.exists():
        shutil.copytree(src, dst)
        print(f"[sync] {src} → {dst}")
    else:
        print("[sync] content/ 不存在，跳过")


if __name__ == "__main__":
    main()
