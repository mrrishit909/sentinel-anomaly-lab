"""Download CATS v2 files from Zenodo, verify md5 against the Zenodo record, write a sha256 manifest."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import urllib.parse

import requests

from pipelines.common import MANIFESTS, RAW, ZENODO_DOI, ZENODO_FILES, ZENODO_RECORD, sha256, write_json


def md5(path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        while b := f.read(1 << 24):
            h.update(b)
    return h.hexdigest()


def fetch(name: str) -> None:
    key, want = ZENODO_FILES[name]
    dest = RAW / name
    if dest.exists() and md5(dest) == want:
        return
    url = f"https://zenodo.org/api/records/{ZENODO_RECORD}/files/{urllib.parse.quote(key)}/content"
    tmp = dest.with_suffix(dest.suffix + ".part")
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    if md5(tmp) != want:
        tmp.unlink()
        raise RuntimeError(f"md5 mismatch for {name}")
    tmp.replace(dest)


def main() -> dict:
    RAW.mkdir(parents=True, exist_ok=True)
    files = []
    for name, (key, want) in ZENODO_FILES.items():
        fetch(name)
        p = RAW / name
        files.append({"name": name, "zenodo_key": key, "bytes": p.stat().st_size, "md5": want, "sha256": sha256(p)})
    man = {"record": ZENODO_RECORD, "doi": ZENODO_DOI, "licence": "CC-BY-4.0", "verified_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "files": files}
    write_json(MANIFESTS / "raw_manifest.json", man, compact=False)
    return man


if __name__ == "__main__":
    print(json.dumps(main(), indent=1))
