"""
Fetch Oracle XXTT Sales Inventory Availability .xls from Gmail and drop into
DataDrops\\Sales Inventory Availability for the nursery supply agent.

Expected mail (daily ~3 AM):
  Subject contains: PRODCDB : Sales Inventory
  Attachment:       XXTT_INV_QA_LANDSCAPE_INV_PL_*.xls

Credentials in repo .env.local (never commit):
  XXTT_GMAIL_USER=ivaneverde@gmail.com
  XXTT_GMAIL_APP_PASSWORD=<Google App Password — 16 chars, spaces ok>

Optional:
  XXTT_GMAIL_SUBJECT_CONTAINS=PRODCDB : Sales Inventory
  XXTT_GMAIL_ATTACHMENT_PREFIX=XXTT_INV_QA_LANDSCAPE_INV_PL_
  XXTT_GMAIL_LOOKBACK_DAYS=5
  XXTT_GMAIL_MARK_SEEN=1
  XXTT_FORWARD_TO=jsaperstein@everde.com   # forward each NEW XXTT .xls (SMTP via same Gmail)
  XXTT_FORWARD_CC=                         # optional; e.g. isunderland@everde.com
  XXTT_FORWARD_ENABLE=1                    # set 0 to disable forwarding
  PORTAL_DATA_ROOT=\\\\192.168.190.10\\Claude Sandbox\\DataDrops

Usage:
  python scripts/nursery/fetch_xxtt_from_gmail.py
  python scripts/nursery/fetch_xxtt_from_gmail.py --dry-run
"""
from __future__ import annotations

import argparse
import email
import imaplib
import os
import re
import smtplib
import sys
from datetime import datetime, timedelta, timezone
from email.header import decode_header
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

DEFAULT_DATA_ROOT = r"\\192.168.190.10\Claude Sandbox\DataDrops"
DEFAULT_SUBJECT = "PRODCDB : Sales Inventory"
DEFAULT_PREFIX = "XXTT_INV_QA_LANDSCAPE_INV_PL_"
IMAP_HOST = "imap.gmail.com"
IMAP_PORT = 993


def load_dotenv_local(repo_root: Path) -> None:
    env_path = repo_root / ".env.local"
    if not env_path.is_file():
        return
    for raw in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def decode_mime_name(value: str | None) -> str:
    if not value:
        return ""
    parts: list[str] = []
    for chunk, charset in decode_header(value):
        if isinstance(chunk, bytes):
            parts.append(chunk.decode(charset or "utf-8", errors="replace"))
        else:
            parts.append(chunk)
    return "".join(parts)


def safe_filename(name: str) -> str:
    name = Path(name).name
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name)
    return name.strip() or "attachment.xls"


def attachment_matches(filename: str, prefix: str) -> bool:
    upper = filename.upper()
    return upper.startswith(prefix.upper()) and upper.endswith(".XLS")


def extract_xls_attachments(msg: email.message.Message, prefix: str) -> list[tuple[str, bytes]]:
    found: list[tuple[str, bytes]] = []
    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue
        disposition = str(part.get("Content-Disposition") or "")
        filename = decode_mime_name(part.get_filename())
        if not filename and "attachment" not in disposition.lower():
            continue
        filename = safe_filename(filename)
        if not attachment_matches(filename, prefix):
            continue
        payload = part.get_payload(decode=True)
        if not payload:
            continue
        found.append((filename, payload))
    return found


def imap_date_since(days: int) -> str:
    # IMAP SEARCH SINCE uses English month abbreviations, e.g. 06-Sep-2026
    dt = datetime.now(timezone.utc) - timedelta(days=max(0, days))
    return dt.strftime("%d-%b-%Y")


def forward_xls(
    *,
    user: str,
    password: str,
    to_addrs: list[str],
    cc_addrs: list[str],
    subject: str,
    attachment_path: Path,
    dry_run: bool,
) -> None:
    """Email a copy of the XXTT .xls via Gmail SMTP (same mailbox used for IMAP fetch)."""
    recipients = [a for a in (to_addrs + cc_addrs) if a]
    if not recipients:
        return
    if dry_run:
        print(f"  dry-run would forward {attachment_path.name} → To={to_addrs} Cc={cc_addrs}")
        return

    msg = MIMEMultipart()
    msg["From"] = user
    msg["To"] = ", ".join(to_addrs)
    if cc_addrs:
        msg["Cc"] = ", ".join(cc_addrs)
    msg["Subject"] = subject if subject.lower().startswith("fw:") else f"FW: {subject}"
    msg.attach(
        MIMEText(
            "Forwarded copy of today's Oracle Sales Inventory Availability (XXTT) file "
            f"for your records.\n\nAttachment: {attachment_path.name}\n",
            "plain",
            "utf-8",
        )
    )
    with attachment_path.open("rb") as fh:
        part = MIMEApplication(fh.read(), Name=attachment_path.name)
    part["Content-Disposition"] = f'attachment; filename="{attachment_path.name}"'
    msg.attach(part)

    with smtplib.SMTP("smtp.gmail.com", 587, timeout=60) as smtp:
        smtp.starttls()
        smtp.login(user, password)
        smtp.sendmail(user, recipients, msg.as_string())
    print(f"  forwarded to {', '.join(recipients)}: {attachment_path.name}")


def _split_addrs(raw: str) -> list[str]:
    return [p.strip() for p in re.split(r"[;,]", raw or "") if p.strip()]


def fetch_and_drop(
    *,
    user: str,
    password: str,
    dest_dir: Path,
    subject_contains: str,
    attachment_prefix: str,
    lookback_days: int,
    mark_seen: bool,
    dry_run: bool,
    forward_to: list[str],
    forward_cc: list[str],
) -> list[Path]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    saved: list[Path] = []
    newly_written: list[tuple[Path, str]] = []  # (path, original mail subject)
    since = imap_date_since(lookback_days)

    print(f"Connecting to {IMAP_HOST} as {user} …")
    with imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT) as imap:
        imap.login(user, password)
        imap.select("INBOX")
        # Broad SINCE filter, then subject/attachment checks in Python
        status, data = imap.search(None, f'(SINCE "{since}")')
        if status != "OK":
            raise RuntimeError(f"IMAP SEARCH failed: {status}")
        ids = data[0].split() if data and data[0] else []
        print(f"IMAP messages since {since}: {len(ids)}")

        # Newest first
        for msg_id in reversed(ids):
            status, fetched = imap.fetch(msg_id, "(RFC822)")
            if status != "OK" or not fetched or not fetched[0]:
                continue
            raw = fetched[0][1]
            if not isinstance(raw, (bytes, bytearray)):
                continue
            msg = email.message_from_bytes(raw)
            subject = decode_mime_name(msg.get("Subject"))
            if subject_contains.lower() not in subject.lower():
                continue

            attachments = extract_xls_attachments(msg, attachment_prefix)
            if not attachments:
                continue

            print(f"Match: {subject!r} -> {len(attachments)} XXTT attachment(s)")
            for filename, payload in attachments:
                target = dest_dir / filename
                if target.is_file() and target.stat().st_size == len(payload):
                    print(f"  already present: {filename} ({len(payload)} bytes)")
                    saved.append(target)
                    continue
                if dry_run:
                    print(f"  dry-run would write: {target} ({len(payload)} bytes)")
                    saved.append(target)
                    newly_written.append((target, subject))
                    continue
                target.write_bytes(payload)
                print(f"  saved: {target} ({len(payload)} bytes)")
                saved.append(target)
                newly_written.append((target, subject))

            if mark_seen and not dry_run:
                imap.store(msg_id, "+FLAGS", "\\Seen")

            # One matching mail with attachments is enough for the daily drop
            if saved:
                break

    if newly_written and forward_to:
        for path, subject in newly_written:
            try:
                # Dry-run: file may not exist on disk yet — skip real SMTP, still log intent
                if dry_run and not path.is_file():
                    print(f"  dry-run would forward {path.name} → To={forward_to} Cc={forward_cc}")
                    continue
                forward_xls(
                    user=user,
                    password=password,
                    to_addrs=forward_to,
                    cc_addrs=forward_cc,
                    subject=subject or "PRODCDB : Sales Inventory",
                    attachment_path=path,
                    dry_run=dry_run,
                )
            except Exception as err:  # noqa: BLE001 — do not fail the drop on forward errors
                print(f"  WARN: forward failed for {path.name}: {err}", file=sys.stderr)

    return saved


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch XXTT inventory .xls from Gmail → DataDrops")
    parser.add_argument("--dry-run", action="store_true", help="Do not write files or mark Seen")
    parser.add_argument(
        "--dest",
        default="",
        help="Override destination folder (default: DataDrops/Sales Inventory Availability)",
    )
    parser.add_argument(
        "--forward-existing",
        action="store_true",
        help="Email the newest XXTT .xls already in the drop folder (no IMAP fetch). For catch-up.",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[2]
    load_dotenv_local(repo_root)

    user = (os.environ.get("XXTT_GMAIL_USER") or "").strip()
    password = (os.environ.get("XXTT_GMAIL_APP_PASSWORD") or "").strip().replace(" ", "")
    if not user or not password:
        print(
            "XXTT_GMAIL_USER / XXTT_GMAIL_APP_PASSWORD not set in .env.local — "
            "skipping Gmail fetch (manual drop still works).",
            file=sys.stderr,
        )
        return 2

    data_root = Path(
        (os.environ.get("PORTAL_DATA_ROOT") or os.environ.get("DATADROPS_ROOT") or DEFAULT_DATA_ROOT)
        .strip()
        .replace("/", "\\")
    )
    dest = Path(args.dest) if args.dest else data_root / "Sales Inventory Availability"
    subject = (os.environ.get("XXTT_GMAIL_SUBJECT_CONTAINS") or DEFAULT_SUBJECT).strip()
    prefix = (os.environ.get("XXTT_GMAIL_ATTACHMENT_PREFIX") or DEFAULT_PREFIX).strip()
    lookback = int(os.environ.get("XXTT_GMAIL_LOOKBACK_DAYS") or "5")
    mark_seen = (os.environ.get("XXTT_GMAIL_MARK_SEEN") or "1").strip() not in ("0", "false", "False")
    forward_enable = (os.environ.get("XXTT_FORWARD_ENABLE") or "1").strip() not in ("0", "false", "False")
    forward_to = _split_addrs(os.environ.get("XXTT_FORWARD_TO") or "") if forward_enable else []
    forward_cc = _split_addrs(os.environ.get("XXTT_FORWARD_CC") or "") if forward_enable else []
    if forward_to:
        print(f"Forward new XXTT files to: {', '.join(forward_to)}"
              + (f" (Cc {', '.join(forward_cc)})" if forward_cc else ""))

    print(f"Destination: {dest}")

    if args.forward_existing:
        if not forward_to:
            print("XXTT_FORWARD_TO not set — nothing to forward.", file=sys.stderr)
            return 2
        candidates = sorted(
            [
                p
                for p in dest.glob("*.xls")
                if p.is_file() and not p.name.startswith("~$") and attachment_matches(p.name, prefix)
            ],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if not candidates:
            print(f"No XXTT .xls in {dest}", file=sys.stderr)
            return 3
        latest = candidates[0]
        print(f"Forwarding existing: {latest.name}")
        try:
            forward_xls(
                user=user,
                password=password,
                to_addrs=forward_to,
                cc_addrs=forward_cc,
                subject=subject,
                attachment_path=latest,
                dry_run=args.dry_run,
            )
        except Exception as err:  # noqa: BLE001
            print(f"Forward failed: {err}", file=sys.stderr)
            return 1
        print("Done — existing file forwarded.")
        return 0

    try:
        saved = fetch_and_drop(
            user=user,
            password=password,
            dest_dir=dest,
            subject_contains=subject,
            attachment_prefix=prefix,
            lookback_days=lookback,
            mark_seen=mark_seen,
            dry_run=args.dry_run,
            forward_to=forward_to,
            forward_cc=forward_cc,
        )
    except imaplib.IMAP4.error as err:
        print(f"Gmail IMAP error: {err}", file=sys.stderr)
        return 1

    if not saved:
        print("No matching XXTT attachment found in lookback window.")
        return 3

    print(f"Done — {len(saved)} file(s) ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
