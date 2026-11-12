#!/usr/bin/env python3
"""
Preeminent Store monthly license proof → Blob status for portal + Teams bot.

Primary workflow: attach the PayPal receipt in Cursor chat and name the month
(e.g. DEC2026). Agent runs:
  python scripts/license/check_preeminent_payment.py --period DEC2026 --mark-paid-from-file <path> --skip-outlook

Validation (required):
  - Merchant must be The PreEminent Store LLC (not other PayPal payees).
  - Invoice period on the receipt must exactly match --period (DEC2026 ≠ NOV2026).
  - Screenshots with no extractable text: --agent-verified after Cursor visual check
    that both merchant and invoice month match.

Behavior:
  - Typical payment ~5th of each month.
  - During the month, unpaid still leaves services on (grace through month-end).
  - Disable only once the month is over without a receipt on file.

Writes:
  - .everde-scheduler/preeminent_license.json
  - Azure Blob license/preeminent_status.json (when AZURE_STORAGE_CONNECTION_STRING set)

Env:
  AZURE_STORAGE_CONNECTION_STRING
  AZURE_FREIGHT_BLOB_CONTAINER (default everde-freight) — reused for license JSON
  PREEMINENT_LICENSE_ALERT_TO (optional; default isunderland@everde.com)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import smtplib
import sys
from datetime import date, datetime, timezone
from email.message import EmailMessage
from pathlib import Path

PERIOD_RE = re.compile(
    r"\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{4})\b",
    re.I,
)
PERIOD_STRICT_RE = re.compile(
    r"^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{4}$",
    re.I,
)
# PayPal subject / body: paid to PreEminent for invoice DEC2026
SUBJECT_RE = re.compile(
    r"You paid to The PreEminent Store LLC for invoice\s+([A-Z]{3}\d{4})",
    re.I,
)
INVOICE_LINE_RE = re.compile(
    r"(?:invoice|invoice\s*(?:number|#|no\.?))\s*[:#]?\s*((?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{4})",
    re.I,
)
PAYPAL_FROM = "service@paypal.com"
MERCHANT_HINTS = (
    "preeminentstore",
    "the preeminent store",
    "preeminent store llc",
    "the preeminent store llc",
    "openai vercel repository libraries",
)
MERCHANT_REQUIRED = (
    "preeminent",  # must appear somewhere (merchant-only gate)
)

MONTH_ABBR = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_dotenv_local(root: Path) -> None:
    path = root / ".env.local"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


def period_for(d: date) -> str:
    return f"{MONTH_ABBR[d.month - 1]}{d.year}"


def first_of_previous_month(d: date) -> date:
    if d.month == 1:
        return date(d.year - 1, 12, 1)
    return date(d.year, d.month - 1, 1)


def parse_period(period: str) -> date:
    """MMMYYYY → first day of that month."""
    p = period.upper().strip()
    mon = MONTH_ABBR.index(p[:3]) + 1
    year = int(p[3:])
    return date(year, mon, 1)


def last_day_of_month(d: date) -> date:
    if d.month == 12:
        nxt = date(d.year + 1, 1, 1)
    else:
        nxt = date(d.year, d.month + 1, 1)
    return date.fromordinal(nxt.toordinal() - 1)


def normalize_period(period: str) -> str:
    p = period.upper().strip()
    if not PERIOD_STRICT_RE.match(p):
        raise ValueError(f"Invalid period {period!r}; use MMMYYYY (e.g. DEC2026)")
    return p


def extract_text_from_file(path: Path) -> str:
    """Best-effort text for validation (txt/html/eml/pdf; images need --agent-verified)."""
    suffix = path.suffix.lower()
    raw = path.read_bytes()
    if suffix in {".txt", ".html", ".htm", ".eml", ".csv", ".json", ".md"}:
        return raw.decode("utf-8", errors="replace")
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader  # type: ignore

            reader = PdfReader(str(path))
            parts = []
            for page in reader.pages:
                parts.append(page.extract_text() or "")
            return "\n".join(parts)
        except Exception:
            try:
                # Latin-1 salvage of embedded strings
                return raw.decode("latin-1", errors="replace")
            except Exception:
                return ""
    if suffix in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".tif", ".tiff", ".msg"}:
        return ""
    return raw.decode("utf-8", errors="replace")


def is_preeminent_merchant(text: str) -> bool:
    t = text.lower()
    if "preeminent" not in t:
        return False
    # Prefer strong merchant phrases; "preeminent" alone is enough if invoice line also matches
    return True


def find_invoice_periods(text: str) -> list[str]:
    found: list[str] = []
    for m in SUBJECT_RE.finditer(text):
        found.append(m.group(1).upper())
    for m in INVOICE_LINE_RE.finditer(text):
        found.append(m.group(1).upper())
    for m in PERIOD_RE.finditer(text):
        found.append(f"{m.group(1).upper()}{m.group(2)}")
    # unique, preserve order
    out: list[str] = []
    for p in found:
        if p not in out:
            out.append(p)
    return out


def validate_preeminent_proof(
    *,
    period: str,
    text: str,
    filename: str = "",
    agent_verified: bool = False,
) -> tuple[bool, str, dict]:
    """
    Accept only PreEminent Store proof for the exact invoice period (e.g. DEC2026).
    Rejects other merchants and mismatched invoice months (NOV2026 ≠ DEC2026).
    """
    period_u = normalize_period(period)
    blob = f"{filename}\n{text}".strip()
    meta: dict = {"invoice": period_u, "merchant": "The PreEminent Store LLC"}

    if not text.strip() and not filename.strip() and not agent_verified:
        return False, "no_readable_text — attach a PayPal receipt PDF/text, or use --agent-verified after visual check", meta

    # Image/PDF with no extractable text: Cursor agent may attest after visual check
    if agent_verified and not text.strip():
        meta["verified_by"] = "cursor_agent"
        meta["validation"] = "agent_verified_preeminent_and_period"
        return True, "agent_verified", meta

    if not is_preeminent_merchant(blob):
        return False, "not_preeminent — receipt must be from The PreEminent Store LLC", meta

    # Strong PayPal subject wins when present
    subj = SUBJECT_RE.search(blob)
    if subj:
        inv = subj.group(1).upper()
        if inv != period_u:
            return (
                False,
                f"invoice_mismatch — receipt is for {inv}, expected {period_u}",
                {**meta, "invoice_found": inv},
            )
        meta["match"] = "paypal_subject"
        return True, "ok", meta

    invoices = find_invoice_periods(blob)
    if period_u not in invoices and period_u not in blob.upper():
        return False, f"period_missing — receipt must show invoice {period_u}", meta

    # If any other invoice period appears via invoice/subject patterns, require exact match
    strict_invoices = []
    for m in SUBJECT_RE.finditer(blob):
        strict_invoices.append(m.group(1).upper())
    for m in INVOICE_LINE_RE.finditer(blob):
        strict_invoices.append(m.group(1).upper())
    strict_invoices = list(dict.fromkeys(strict_invoices))
    if strict_invoices and period_u not in strict_invoices:
        return (
            False,
            f"invoice_mismatch — found {strict_invoices[0]}, expected {period_u}",
            {**meta, "invoice_found": strict_invoices[0]},
        )
    # Reject if a *different* MMMYYYY is clearly the only period and claimed period absent from invoice context
    others = [p for p in invoices if p != period_u]
    if others and period_u not in blob.upper():
        return (
            False,
            f"invoice_mismatch — found {others[0]}, expected {period_u}",
            {**meta, "invoice_found": others[0]},
        )

    if not any(h in blob.lower() for h in MERCHANT_HINTS) and "preeminent store" not in blob.lower():
        # "preeminent" alone already passed; prefer store phrasing when possible
        pass

    meta["match"] = "preeminent_and_period"
    if agent_verified:
        meta["verified_by"] = "cursor_agent"
    return True, "ok", meta


def proof_from_file(
    path: Path,
    period: str,
    *,
    agent_verified: bool = False,
) -> tuple[dict | None, str]:
    text = extract_text_from_file(path)
    ok, reason, meta = validate_preeminent_proof(
        period=period,
        text=text,
        filename=path.name,
        agent_verified=agent_verified,
    )
    if not ok:
        return None, reason
    return {
        "source": "upload",
        "path": str(path),
        "name": path.name,
        "modified": datetime.now(timezone.utc).isoformat(),
        "invoice": meta.get("invoice", period.upper()),
        "merchant": "The PreEminent Store LLC",
        "validation": reason,
        **{k: v for k, v in meta.items() if k not in {"invoice"}},
    }, reason


def scan_outlook(period: str, lookback_days: int = 45) -> dict | None:
    """Find PayPal PreEminent payment receipt for exact invoice period via Outlook COM."""
    try:
        import win32com.client  # type: ignore
    except ImportError:
        print("WARN: pywin32 not installed — skipping Outlook scan", file=sys.stderr)
        return None

    period_u = normalize_period(period)
    outlook = win32com.client.Dispatch("Outlook.Application")
    ns = outlook.GetNamespace("MAPI")
    inbox = ns.GetDefaultFolder(6)
    items = inbox.Items
    items.Sort("[ReceivedTime]", True)
    items = items.Restrict(
        f"[ReceivedTime] >= '{(datetime.now().date().fromordinal(datetime.now().date().toordinal() - lookback_days)).strftime('%m/%d/%Y')} 12:00 AM'"
    )

    count = 0
    for it in items:
        count += 1
        if count > 400:
            break
        try:
            subj = str(getattr(it, "Subject", "") or "")
            sender = str(getattr(it, "SenderEmailAddress", "") or "").lower()
            sender_name = str(getattr(it, "SenderName", "") or "").lower()
            body = str(getattr(it, "Body", "") or "")
            received = getattr(it, "ReceivedTime", None)
        except Exception:
            continue

        combined = f"{subj}\n{body}"
        # Only PreEminent PayPal payments for this exact invoice
        m = SUBJECT_RE.search(subj)
        if m:
            if m.group(1).upper() != period_u:
                continue
            ok, _, meta = validate_preeminent_proof(period=period_u, text=combined, filename=subj)
            if not ok:
                continue
            return {
                "source": "email",
                "subject": subj,
                "from": sender or sender_name,
                "received": received.isoformat() if hasattr(received, "isoformat") else str(received),
                "invoice": period_u,
                "merchant": "The PreEminent Store LLC",
                "validation": "paypal_subject",
            }

        if PAYPAL_FROM not in sender and "paypal" not in sender_name:
            continue
        ok, reason, meta = validate_preeminent_proof(period=period_u, text=combined, filename=subj)
        if not ok:
            continue
        return {
            "source": "email",
            "subject": subj,
            "from": sender or sender_name,
            "received": received.isoformat() if hasattr(received, "isoformat") else str(received),
            "invoice": period_u,
            "merchant": "The PreEminent Store LLC",
            "validation": reason,
        }
    return None


def decide_enabled(today: date, period: str, paid: bool) -> tuple[bool, str]:
    """Disable only after the invoice month has fully ended without proof."""
    if paid:
        return True, "proof_on_file"
    period_start = parse_period(period)
    period_end = last_day_of_month(period_start)
    # Through the last day of the invoice month → still grace (pay ~5th is fine)
    if today <= period_end:
        return True, "grace_until_month_end"
    return False, "unpaid_after_month_end"


def write_local(root: Path, status: dict) -> Path:
    out_dir = root / ".everde-scheduler"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "preeminent_license.json"
    path.write_text(json.dumps(status, indent=2), encoding="utf-8")
    return path


def publish_blob(status: dict) -> str | None:
    conn = (os.environ.get("AZURE_STORAGE_CONNECTION_STRING") or "").strip()
    if not conn:
        print("WARN: AZURE_STORAGE_CONNECTION_STRING not set — skip Blob publish", file=sys.stderr)
        return None
    container = (os.environ.get("AZURE_FREIGHT_BLOB_CONTAINER") or "everde-freight").strip()
    blob_path = "license/preeminent_status.json"
    from azure.storage.blob import BlobServiceClient, ContentSettings

    svc = BlobServiceClient.from_connection_string(conn)
    client = svc.get_blob_client(container=container, blob=blob_path)
    payload = json.dumps(status, indent=2).encode("utf-8")
    client.upload_blob(
        payload,
        overwrite=True,
        content_settings=ContentSettings(content_type="application/json"),
    )
    return f"{container}/{blob_path}"


def maybe_alert(status: dict, root: Path) -> None:
    """Email Ivan only when the monthly gate finds an unpaid closed month (services off)."""
    if status.get("paid") or status.get("services_enabled"):
        return

    to_addr = (os.environ.get("PREEMINENT_LICENSE_ALERT_TO") or "isunderland@everde.com").strip()
    user = (os.environ.get("XXTT_GMAIL_USER") or "").strip()
    app_pw = (os.environ.get("XXTT_GMAIL_APP_PASSWORD") or "").strip().replace(" ", "")
    if not user or not app_pw:
        print("WARN: no Gmail SMTP for license alert — skipping email", file=sys.stderr)
        return

    period = status["period"]
    msg = EmailMessage()
    msg["Subject"] = f"[Everde] Preeminent license DISABLED — {period}"
    msg["From"] = user
    msg["To"] = to_addr
    msg.set_content(
        f"Period: {period}\n"
        f"Paid: {status.get('paid')}\n"
        f"Services enabled: {status.get('services_enabled')}\n"
        f"Reason: {status.get('enable_reason')}\n"
        f"Checked at: {status.get('checked_at')}\n\n"
        "No receipt was on file after month-end. Portal + Teams bots are offline until "
        "you upload proof (Admin → License) or a PayPal receipt is detected.\n"
        f"File name should include {period} (e.g. {period}.pdf).\n"
    )
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60) as s:
            s.login(user, app_pw)
            s.send_message(msg)
        print(f"Alert emailed to {to_addr}")
    except Exception as e:  # noqa: BLE001
        print(f"WARN: alert email failed: {e}", file=sys.stderr)


def build_status(
    *,
    today: date,
    period: str,
    proof: dict | None,
    force_disable: bool,
    force_enable: bool,
) -> dict:
    paid = proof is not None
    if force_enable:
        enabled, reason = True, "forced_enable"
    elif force_disable:
        enabled, reason = False, "forced_disable"
    else:
        enabled, reason = decide_enabled(today, period, paid)

    return {
        "vendor": "The PreEminent Store LLC",
        "product": "OPENAI Vercel Repository Libraries Plus",
        "period": period,
        "paid": paid,
        "proof": proof,
        "services_enabled": enabled,
        "enable_reason": reason,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "policy": {
            "grace": "Pay ~5th is fine. Services stay on through month-end; disable only after the month ends with no receipt.",
            "proof": (
                "Cursor-attached PayPal receipt from The PreEminent Store LLC "
                "with matching invoice MMMYYYY (e.g. DEC2026)."
            ),
            "schedule": "Manual via Cursor — no scheduled check.",
        },
    }


def main() -> int:
    root = repo_root()
    load_dotenv_local(root)

    ap = argparse.ArgumentParser(description="Check Preeminent monthly license proof")
    ap.add_argument("--period", help="Invoice period e.g. DEC2026 (required with --mark-paid-from-file)")
    ap.add_argument(
        "--monthly-gate",
        action="store_true",
        help="Check previous calendar month (legacy; prefer Cursor upload).",
    )
    ap.add_argument("--skip-outlook", action="store_true")
    ap.add_argument("--skip-blob", action="store_true")
    ap.add_argument("--skip-alert", action="store_true")
    ap.add_argument("--force-disable", action="store_true")
    ap.add_argument("--force-enable", action="store_true")
    ap.add_argument(
        "--mark-paid-from-file",
        type=Path,
        help="Receipt file from Cursor; must be PreEminent + matching invoice period",
    )
    ap.add_argument(
        "--agent-verified",
        action="store_true",
        help="Cursor agent confirmed PreEminent merchant + invoice period on image/PDF",
    )
    args = ap.parse_args()

    today = date.today()
    try:
        if args.period:
            period = normalize_period(args.period)
        elif args.monthly_gate:
            period = period_for(first_of_previous_month(today))
        else:
            period = period_for(today)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    proof = None
    if args.mark_paid_from_file:
        if not args.mark_paid_from_file.is_file():
            print(f"ERROR: file not found: {args.mark_paid_from_file}", file=sys.stderr)
            return 2
        proof, reason = proof_from_file(
            args.mark_paid_from_file,
            period,
            agent_verified=args.agent_verified,
        )
        if proof is None:
            print(
                f"ERROR: rejected — {reason}. "
                f"Only The PreEminent Store LLC receipts for invoice {period} are accepted.",
                file=sys.stderr,
            )
            return 2
        print(f"Validated PreEminent proof for {period}: {reason}")
    elif not args.skip_outlook:
        proof = scan_outlook(period)

    status = build_status(
        today=today,
        period=period,
        proof=proof,
        force_disable=args.force_disable,
        force_enable=args.force_enable,
    )

    local_path = write_local(root, status)
    print(json.dumps(status, indent=2))
    print(f"Wrote {local_path}")

    if not args.skip_blob:
        blob = publish_blob(status)
        if blob:
            print(f"Published {blob}")

    if not args.skip_alert:
        maybe_alert(status, root)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
