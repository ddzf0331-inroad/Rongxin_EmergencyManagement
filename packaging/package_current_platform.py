from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the current platform's offline simulation package")
    parser.add_argument("--slab-binary", type=Path, help="License-reviewed SLAB binary for the current platform")
    parser.add_argument("--output", type=Path, default=ROOT / "release")
    args = parser.parse_args()
    subprocess.run(["npm", "run", "build"], cwd=ROOT / "dashboard", check=True)
    if shutil.which("pyinstaller") is None:
        raise SystemExit("PyInstaller is required for packaging: python -m pip install -r packaging/requirements-build.txt")
    separator = ";" if os.name == "nt" else ":"
    target = args.output / f"accident-simulation-{platform.system().lower()}-{platform.machine().lower()}"
    work = ROOT / "build" / "pyinstaller"
    command = [
        "pyinstaller", "--noconfirm", "--clean", "--onedir", "--name", "AccidentSimulationService",
        "--distpath", str(target), "--workpath", str(work), "--specpath", str(work),
        "--add-data", f"{ROOT / 'dashboard' / 'dist'}{separator}dashboard/dist",
        "--add-data", f"{ROOT / 'simulation_service' / 'vendor' / 'slab' / 'NOTICE.md'}{separator}simulation_service/vendor/slab",
        str(ROOT / "run_simulation_service.py"),
    ]
    if args.slab_binary:
        slab_binary = args.slab_binary.resolve()
        if not slab_binary.is_file():
            raise SystemExit(f"SLAB binary not found: {slab_binary}")
        expected = "slab.exe" if os.name == "nt" else "slab"
        command[command.index(str(ROOT / "run_simulation_service.py")):command.index(str(ROOT / "run_simulation_service.py"))] = [
            "--add-binary", f"{slab_binary}{separator}simulation_service/vendor/slab",
        ]
    environment = os.environ.copy()
    environment["PYINSTALLER_CONFIG_DIR"] = str(work / "config")
    subprocess.run(command, cwd=ROOT, env=environment, check=True)
    package = target / "AccidentSimulationService"
    (package / "data").mkdir(exist_ok=True)
    if os.name == "nt":
        (package / "start.bat").write_text("@echo off\r\nAccidentSimulationService.exe --host 127.0.0.1 --port 8765\r\n", encoding="utf-8")
        (package / "health-check.bat").write_text("@powershell -NoProfile -Command \"Invoke-RestMethod http://127.0.0.1:8765/api/accident-simulation/health\"\r\n", encoding="utf-8")
    else:
        start = package / "start.sh"
        health = package / "health-check.sh"
        start.write_text("#!/bin/sh\nexec \"$(dirname \"$0\")/AccidentSimulationService\" --host 127.0.0.1 --port 8765\n", encoding="utf-8")
        health.write_text("#!/bin/sh\ncurl --fail --silent http://127.0.0.1:8765/api/accident-simulation/health\n", encoding="utf-8")
        start.chmod(0o755)
        health.chmod(0o755)
    shutil.copy2(ROOT / "simulation_service" / "vendor" / "slab" / "NOTICE.md", package / "SLAB-NOTICE.md")
    print(package)


if __name__ == "__main__":
    main()
