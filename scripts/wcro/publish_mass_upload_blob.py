"""
Build HD N.CA mass upload and publish to Azure Blob for the Teams bot fallback.

Requires AZURE_STORAGE_CONNECTION_STRING (teams-claude-bot/.env or repo .env.local).

Usage:
  python scripts/wcro/publish_mass_upload_blob.py --req-delivery-date 2026-09-30 --order-type "WIN NORTH CA"
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

# Allow importing sibling build_mass_upload
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_mass_upload import (  # noqa: E402
    DEFAULT_HD_TEMPLATE,
    DEFAULT_ORACLE_TEMPLATE,
    DEFAULT_STORE_DRIVEN,
    DEFAULT_SUCCESS_REFERENCE,
    build,
)


def load_dotenv_files() -> None:
    roots = [
        Path(__file__).resolve().parents[2] / "teams-claude-bot" / ".env",
        Path(__file__).resolve().parents[2] / ".env.local",
    ]
    for p in roots:
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="N.CA")
    ap.add_argument("--channel", default="HD", choices=["HD", "LOW"])
    ap.add_argument("--req-delivery-date", default="2026-09-30")
    ap.add_argument("--order-type", default="WIN NORTH CA")
    ap.add_argument("--ship-instr", default="")
    ap.add_argument(
        "--output",
        default=str(
            Path(__file__).resolve().parents[2]
            / "_incoming"
            / "WCRO_NCA_HD_MassUpload_Bot.xlsm"
        ),
    )
    args = ap.parse_args()

    load_dotenv_files()
    conn = os.environ.get("AZURE_STORAGE_CONNECTION_STRING", "").strip()
    if not conn:
        raise SystemExit("AZURE_STORAGE_CONNECTION_STRING not set")

    template = DEFAULT_ORACLE_TEMPLATE
    if not template.exists() and DEFAULT_SUCCESS_REFERENCE.exists():
        template = DEFAULT_SUCCESS_REFERENCE
    if not template.exists() and DEFAULT_HD_TEMPLATE.exists():
        template = DEFAULT_HD_TEMPLATE

    req_date = datetime.strptime(args.req_delivery_date, "%Y-%m-%d")
    out = Path(args.output)
    ship = args.ship_instr.strip() or f"{args.region.replace('.', '')} SPREAD (WCRO)"

    build(
        DEFAULT_STORE_DRIVEN,
        template,
        out,
        region=args.region,
        customer_name=(
            "HOME DEPOT CORP - VN"
            if args.channel == "HD"
            else "LOWE''S COMPANIES, INC. - VN"
        ),
        order_type=args.order_type,
        req_delivery_date=req_date,
        ship_instr=ship,
    )

    from azure.storage.blob import BlobServiceClient, ContentSettings

    container = os.environ.get("AZURE_FREIGHT_BLOB_CONTAINER", "everde-freight").strip()
    reg = args.region.upper().replace(".", "").replace(" ", "")
    safe = "SCA" if reg.startswith("S") else "NCA"
    blob_path = f"wcro/mass-upload/latest/{args.channel}_{safe}_MassUpload.xlsm"

    svc = BlobServiceClient.from_connection_string(conn)
    client = svc.get_container_client(container).get_blob_client(blob_path)
    data = out.read_bytes()
    client.upload_blob(
        data,
        overwrite=True,
        content_settings=ContentSettings(
            content_type="application/vnd.ms-excel.sheet.macroEnabled.12"
        ),
    )
    print(f"Published {len(data)} bytes → {container}/{blob_path}")
    print(f"Local copy: {out}")


if __name__ == "__main__":
    main()
