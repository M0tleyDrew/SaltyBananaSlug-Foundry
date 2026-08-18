#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import quote
from zipfile import ZIP_DEFLATED, ZipFile

CATALOG_SCHEMA = 1
DEFAULT_BRANCH = "main"
CATALOG_BRANCH = "environment-catalog"


def q(value: str) -> str:
    return quote(str(value), safe="-._~")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def macro_record(path: Path, repo: str):
    try:
        raw_text = path.read_text(encoding="utf-8-sig")
        raw = json.loads(raw_text)
    except Exception:
        return None
    if not isinstance(raw, dict) or not str(raw.get("command", "")).strip():
        return None

    name = str(raw.get("name") or path.stem)
    macro_type = raw.get("type") if raw.get("type") in {"script", "chat"} else "script"
    scope = raw.get("scope") if raw.get("scope") in {"global", "actors", "token"} else "global"
    image = str(raw.get("img") or "icons/svg/dice-target.svg")
    encoded_name = q(path.name)
    return {
        "type": "macro",
        "id": path.name,
        "title": name,
        "fileName": path.name,
        "sourcePath": path.name,
        "fileUrl": f"https://github.com/{repo}/blob/{DEFAULT_BRANCH}/{encoded_name}",
        "rawUrl": f"https://raw.githubusercontent.com/{repo}/{DEFAULT_BRANCH}/{encoded_name}",
        "hash": hashlib.sha256(path.read_bytes()).hexdigest(),
        "macroData": {
            "name": name,
            "type": macro_type,
            "scope": scope,
            "command": str(raw.get("command") or ""),
            "img": image,
        },
    }


def package_module(folder: Path, manifest: dict, repo: str, out: Path):
    module_id = str(manifest.get("id") or folder.name)
    version = str(manifest.get("version") or "0.0.0")
    folder_url = f"https://github.com/{repo}/tree/{DEFAULT_BRANCH}/{q(folder.name)}"
    manifest_url = f"https://raw.githubusercontent.com/{repo}/{CATALOG_BRANCH}/manifests/{q(module_id)}.json"
    download_url = f"https://raw.githubusercontent.com/{repo}/{CATALOG_BRANCH}/packages/{q(module_id)}-v{q(version)}.zip"

    published_manifest = json.loads(json.dumps(manifest))
    published_manifest["url"] = folder_url
    published_manifest["manifest"] = manifest_url
    published_manifest["download"] = download_url
    write_json(out / "manifests" / f"{module_id}.json", published_manifest)

    package_path = out / "packages" / f"{module_id}-v{version}.zip"
    package_path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(package_path, "w", compression=ZIP_DEFLATED, compresslevel=9) as zf:
        for source in sorted(folder.rglob("*")):
            if not source.is_file():
                continue
            relative = source.relative_to(folder)
            arcname = (Path(folder.name) / relative).as_posix()
            if relative.as_posix() == "module.json":
                zf.writestr(arcname, json.dumps(published_manifest, indent=2, ensure_ascii=False) + "\n")
            else:
                zf.write(source, arcname)

    return {
        "type": "module",
        "id": module_id,
        "title": str(manifest.get("title") or module_id),
        "description": str(manifest.get("description") or ""),
        "version": version,
        "folderName": folder.name,
        "folderUrl": folder_url,
        "sourceManifestUrl": f"https://raw.githubusercontent.com/{repo}/{DEFAULT_BRANCH}/{q(folder.name)}/module.json",
        "manifestUrl": manifest_url,
        "downloadUrl": download_url,
        "compatibility": manifest.get("compatibility") or {},
        "relationships": manifest.get("relationships") or {},
        "distributionReady": True,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True, help="owner/name")
    parser.add_argument("--root", default=".")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    root = Path(args.root).resolve()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)

    modules = []
    for folder in sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith(".")):
        manifest_path = folder / "module.json"
        if not manifest_path.is_file():
            continue
        try:
            manifest = load_json(manifest_path)
        except Exception as exc:
            print(f"Skipping invalid {manifest_path}: {exc}")
            continue
        if not isinstance(manifest, dict) or not manifest.get("id"):
            print(f"Skipping {manifest_path}: no module id")
            continue
        modules.append(package_module(folder, manifest, args.repo, out))

    macros = []
    for path in sorted(root.glob("*.json")):
        if path.name == "catalog.json":
            continue
        record = macro_record(path, args.repo)
        if record:
            macros.append(record)

    modules.sort(key=lambda x: x["title"].lower())
    macros.sort(key=lambda x: x["title"].lower())

    catalog = {
        "ok": True,
        "provider": "github",
        "catalogSchema": CATALOG_SCHEMA,
        "catalogMode": "published",
        "generatedAt": os.environ.get("SBS_GENERATED_AT") or "generated-by-github-actions",
        "repositoryUrl": f"https://github.com/{args.repo}",
        "sourceBranch": DEFAULT_BRANCH,
        "catalogBranch": CATALOG_BRANCH,
        "modules": modules,
        "macros": macros,
    }
    write_json(out / "catalog.json", catalog)
    (out / ".nojekyll").write_text("", encoding="utf-8")
    print(f"Built {len(modules)} modules and {len(macros)} root macros into {out}")


if __name__ == "__main__":
    main()
