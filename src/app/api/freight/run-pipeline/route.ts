import { execFile } from "child_process";
import { promises as fs } from "fs";
import { promisify } from "util";
import { NextResponse } from "next/server";
import {
  joinPortalDataRoot,
  uncPathForChildProcess,
} from "@/lib/sharePaths";

export const dynamic = "force-dynamic";
/** Vercel Hobby caps serverless functions at 300s; local/VM can use longer runs via env. */
export const maxDuration = process.env.VERCEL ? 300 : 3600;

const execFileAsync = promisify(execFile);

const NO_PYTHON_HINT =
  "No working Python was found on PATH. Install Python from https://www.python.org/downloads/ (check \"Add python.exe to PATH\"), or set FREIGHT_PYTHON in .env.local to the full path of python.exe (e.g. C:\\\\Python312\\\\python.exe). On Windows 11: Settings -> Apps -> Advanced app settings -> App execution aliases: turn off the python.exe / python3.exe store stubs if they block a real install.";

/**
 * Picks a Python executable. `FREIGHT_PYTHON` may be a full path or a command
 * plus flags, e.g. `C:\\Python312\\python.exe` or `py -3`.
 */
async function resolveFreightPython(): Promise<{ cmd: string; args: string[] } | null> {
  const explicit = process.env.FREIGHT_PYTHON?.trim();
  if (explicit) {
    const parts = explicit.split(/\s+/).filter(Boolean);
    return { cmd: parts[0]!, args: [...parts.slice(1), "update.py"] };
  }
  if (process.platform !== "win32") {
    return { cmd: "python3", args: ["update.py"] };
  }
  const candidates: { cmd: string; checkArgs: string[]; runArgs: string[] }[] = [
    { cmd: "py", checkArgs: ["-3", "--version"], runArgs: ["-3", "update.py"] },
    { cmd: "py", checkArgs: ["--version"], runArgs: ["update.py"] },
    { cmd: "python3", checkArgs: ["--version"], runArgs: ["update.py"] },
    { cmd: "python", checkArgs: ["--version"], runArgs: ["update.py"] },
  ];
  for (const c of candidates) {
    try {
      await execFileAsync(c.cmd, c.checkArgs, {
        timeout: 10_000,
        windowsHide: true,
        env: process.env as NodeJS.ProcessEnv,
      });
      return { cmd: c.cmd, args: [...c.runArgs] };
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Runs `Freight/_pipeline/update.py` with Python (reads `.xlsb` inputs and
 * rebuilds workbook + should emit HTML per your pipeline design).
 *
 * Enable only when intended: set `FREIGHT_ALLOW_PIPELINE=1` in `.env.local`.
 */
export async function POST() {
  if (process.env.FREIGHT_ALLOW_PIPELINE !== "1") {
    return NextResponse.json(
      {
        error: "Pipeline execution is disabled.",
        hint: "Set FREIGHT_ALLOW_PIPELINE=1 in .env.local to allow POST /api/freight/run-pipeline (dev/ops only).",
      },
      { status: 403 },
    );
  }

  const pipelineDirPosix = joinPortalDataRoot("Freight", "_pipeline");
  const scriptPosix = joinPortalDataRoot("Freight", "_pipeline", "update.py");

  try {
    await fs.access(scriptPosix);
  } catch {
    return NextResponse.json(
      {
        error: "update.py not found.",
        expectedPath: scriptPosix,
      },
      { status: 404 },
    );
  }

  const timeoutMs =
    Number(process.env.FREIGHT_PIPELINE_TIMEOUT_MS?.trim()) ||
    60 * 60 * 1000;

  const cwd = uncPathForChildProcess(pipelineDirPosix);

  const invoke = await resolveFreightPython();
  if (!invoke) {
    return NextResponse.json(
      {
        ok: false,
        error: "Python interpreter not found.",
        hint: NO_PYTHON_HINT,
      },
      { status: 500 },
    );
  }

  try {
    const { stdout, stderr } = await execFileAsync(invoke.cmd, invoke.args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        // Windows defaults to cp1252 for piped stdout; pipeline scripts print Unicode (e.g. →).
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
      },
    });
    return NextResponse.json({
      ok: true,
      cwd,
      python: [invoke.cmd, ...invoke.args].join(" "),
      stdout: stdout.slice(-24_000),
      stderr: stderr.slice(-24_000),
    });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const stderr = e.stderr ?? "";
    const msg = e.message ?? "";
    const hint =
      /Python was not found|No Python at|failed to locate py/i.test(stderr) ||
      /Python was not found/i.test(msg)
        ? NO_PYTHON_HINT
        : /ETIMEDOUT|timed out|timeout/i.test(msg)
          ? `Pipeline hit the Node subprocess timeout (${timeoutMs} ms). Set FREIGHT_PIPELINE_TIMEOUT_MS in .env.local (e.g. 7200000 for 2 hours) and restart npm run dev.`
          : undefined;
    return NextResponse.json(
      {
        ok: false,
        error: msg || "Pipeline failed",
        stdout: e.stdout?.slice(-32_000),
        stderr: stderr.slice(-32_000),
        timeoutMs,
        ...(hint ? { hint } : {}),
      },
      { status: 500 },
    );
  }
}
