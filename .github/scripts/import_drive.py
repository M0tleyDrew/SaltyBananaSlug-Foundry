#!/usr/bin/env python3
import json
import pathlib
import subprocess
import sys

DRIVE_URL = "https://drive.google.com/drive/folders/1ThTcLalqTZpf7m1-bO3ZMJTj0iua6keR"
ROOT = pathlib.Path("/tmp/sbs-drive")
JSON_PATH = pathlib.Path("/tmp/sbs-files.json")
FAILED_PATH = pathlib.Path("/tmp/sbs-failed.tsv")

ROOT.mkdir(parents=True, exist_ok=True)

print("Listing complete Google Drive tree...", flush=True)
listing = subprocess.run(
    ["gdown", "--folder", DRIVE_URL, "--json"],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
)
if listing.returncode != 0:
    print(listing.stdout)
    print(listing.stderr, file=sys.stderr)
    raise SystemExit(listing.returncode)

JSON_PATH.write_text(listing.stdout, encoding="utf-8")
items = json.loads(listing.stdout)
failures = []

print(f"Listed {len(items)} Drive files.", flush=True)
for index, item in enumerate(items, start=1):
    rel = pathlib.PurePosixPath(item["path"])
    dest = ROOT.joinpath(*rel.parts)
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"[{index}/{len(items)}] {rel}", flush=True)
    proc = subprocess.run(
        ["gdown", item["url"], "--output", str(dest)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if proc.returncode != 0:
        print(f"  SKIPPED: {rel}", flush=True)
        failures.append((str(rel), item["url"], proc.stdout.strip()))

with FAILED_PATH.open("w", encoding="utf-8") as fh:
    for path, url, output in failures:
        clean = output.replace("\t", " ").replace("\r", " ").replace("\n", " | ")
        fh.write(f"{path}\t{url}\t{clean}\n")

print(f"Individual download pass complete. Failed files: {len(failures)}", flush=True)
