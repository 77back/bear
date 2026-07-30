"""管线公共工具（构建框架 §8）：配置加载、去重指纹、seen 管理、正文清洗。"""
from __future__ import annotations

import hashlib
import os
import re
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

import yaml

# 【已弃用 2026-07】RSSHub 公共实例（rsshub.app 及公共镜像）整体失效，
# sources.yaml 已改为央媒站直链（type: list 两级抓取）。
# rsshub_base / DEFAULT_RSSHUB_BASE 仅为兼容保留，勿在新源中使用。
DEFAULT_RSSHUB_BASE = "https://rsshub.app"
ROOT = Path(__file__).resolve().parent


# ---------- 路径 ----------
def pipeline_root() -> Path:
    return ROOT


def repo_root() -> Path:
    return ROOT.parent


def today_str() -> str:
    return date.today().isoformat()


def month_str() -> str:
    return date.today().strftime("%Y-%m")


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


# ---------- 配置 ----------
_ENV_RE = re.compile(r"\$\{([A-Z0-9_]+)\}")


def _substitute_env(value: str) -> str:
    return _ENV_RE.sub(lambda m: os.environ.get(m.group(1), ""), value)


def load_sources(path: Path | None = None) -> list[dict]:
    """读 sources.yaml，展开 ${ENV}（如历史遗留的 RSSHUB_BASE，已弃用）。"""
    path = path or (ROOT / "sources.yaml")
    raw = path.read_text(encoding="utf-8")
    data = yaml.safe_load(raw) or []
    for src in data:
        src["url"] = _substitute_env(str(src.get("url", ""))).strip()
    return data


def rsshub_base() -> str:
    return os.environ.get("RSSHUB_BASE", DEFAULT_RSSHUB_BASE).rstrip("/")


# ---------- 去重指纹 ----------
def fingerprint(title: str, link: str) -> str:
    """§8.2：指纹 = sha1(标题+链接)。"""
    norm = (title or "").strip() + "|" + (link or "").strip()
    return hashlib.sha1(norm.encode("utf-8")).hexdigest()


def load_seen(path: Path | None = None) -> set[str]:
    path = path or (ROOT / "seen.json")
    if not path.exists():
        return set()
    import json

    data = json.loads(path.read_text(encoding="utf-8"))
    return set(data.get("seen", []))


def save_seen(seen: set[str], path: Path | None = None) -> None:
    path = path or (ROOT / "seen.json")
    import json

    path.write_text(
        json.dumps({"seen": sorted(seen)}, ensure_ascii=False, indent=0),
        encoding="utf-8",
    )


# ---------- 正文清洗 ----------
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def strip_html(html: str) -> str:
    """粗剥离 HTML 标签与多余空白。"""
    if not html:
        return ""
    # 用 CDATA-safe 方式去标签
    text = _TAG_RE.sub(" ", html)
    # 解析常见实体
    text = (text.replace("&nbsp;", " ").replace("&amp;", "&")
             .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"'))
    return _WS_RE.sub(" ", text).strip()


def extract_text(payload: str) -> str:
    """从 RSS entry 的 content/summary（可能含 HTML）提取纯文本。"""
    return strip_html(payload)


def first_chars(text: str, n: int = 200) -> str:
    text = (text or "").strip()
    return text if len(text) <= n else text[:n].rstrip() + "…"
