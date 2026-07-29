from __future__ import annotations

import math
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


class SlabUnavailable(RuntimeError):
    pass


def default_binary() -> Path:
    override = os.environ.get("SLAB_BINARY")
    if override:
        return Path(override)
    name = "slab.exe" if os.name == "nt" else "slab"
    bundle_root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    return bundle_root / "simulation_service" / "vendor" / "slab" / name


def is_available() -> bool:
    binary = default_binary()
    return binary.is_file() and os.access(binary, os.X_OK)


def _number(value: float) -> str:
    return f"{value:.8g}"


def build_input(chemical: dict[str, Any], source: dict[str, float], weather: dict[str, Any]) -> str:
    source_type = 4 if source["releaseKind"] == "instantaneous" else 1 if source["releaseKind"] == "pool" else 2
    liquid_fraction = source.get("liquidMassFraction", 0.0)
    values = (
        source_type, 1,
        chemical["molarMassKgMol"], chemical["vaporHeatCapacityJkgK"],
        chemical["boilingPointK"], liquid_fraction, chemical["latentHeatJkg"],
        chemical["liquidHeatCapacityJkgK"], chemical["liquidDensityKgM3"], -1.0, 0.0,
        source["temperatureK"], source["massRateKgS"], source["areaM2"],
        source["durationS"], source.get("instantaneousMassKg", 0.0), source.get("heightM", 0.0),
        10.0, 5000.0, 0.0, 0.0, 0.0, 0.0,
        weather["surfaceRoughnessM"], weather.get("windMeasurementHeightM", 10.0),
        weather["windSpeedMS"], weather["temperatureK"], weather["relativeHumidityPct"],
        ord(weather["stabilityClass"].upper()) - ord("A") + 1,
        -1.0,
    )
    lines = [_number(value) for value in values]
    return "\n".join(lines) + "\n"


def run_slab(chemical: dict[str, Any], source: dict[str, float], weather: dict[str, Any], timeout_s: int = 8) -> str:
    binary = default_binary()
    if not is_available():
        raise SlabUnavailable(f"SLAB executable is unavailable for this platform: {binary}")
    with tempfile.TemporaryDirectory(prefix="toxic-slab-") as directory:
        work = Path(directory)
        (work / "input").write_text(build_input(chemical, source, weather), encoding="ascii")
        completed = subprocess.run(
            [str(binary)], cwd=work, capture_output=True, text=True, timeout=timeout_s, check=False
        )
        output = work / "predict"
        if completed.returncode != 0 or not output.exists():
            detail = (completed.stderr or completed.stdout or "no output").strip()
            raise RuntimeError(f"SLAB failed with code {completed.returncode}: {detail[:500]}")
        return output.read_text(encoding="latin-1")


def parse_ground_table(text: str) -> list[dict[str, Any]]:
    marker = "concentration in the z"
    start = text.lower().find(marker)
    if start < 0:
        raise RuntimeError("SLAB output does not contain the ground concentration table")
    rows: list[dict[str, Any]] = []
    numeric = re.compile(r"[-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?")
    for line in text[start:].splitlines():
        values = [float(value) for value in numeric.findall(line)]
        if len(values) >= 10:
            rows.append({
                "xM": values[0], "timeS": values[1], "durationS": values[2], "halfWidthM": values[3],
                "fractions": values[4:10],
            })
        elif rows and not line.strip():
            break
    if len(rows) < 2:
        raise RuntimeError("SLAB ground concentration table could not be parsed")
    return rows


def threshold_polygon(rows: list[dict[str, Any]], threshold_fraction: float) -> tuple[list[tuple[float, float]], list[dict[str, float]]]:
    upper: list[tuple[float, float]] = []
    timing: list[dict[str, float]] = []
    ratios = (0.0, 0.5, 1.0, 1.5, 2.0, 2.5)
    for row in rows:
        concentrations = row["fractions"]
        if concentrations[0] < threshold_fraction:
            continue
        ratio = ratios[-1]
        for index in range(1, len(concentrations)):
            if concentrations[index] <= threshold_fraction:
                hi, lo = concentrations[index - 1], concentrations[index]
                fraction = 0.0 if hi == lo else (hi - threshold_fraction) / (hi - lo)
                ratio = ratios[index - 1] + fraction * (ratios[index] - ratios[index - 1])
                break
        y = max(0.0, ratio * row["halfWidthM"])
        upper.append((row["xM"], y))
        timing.append({"xM": row["xM"], "arrivalS": row["timeS"], "durationS": row["durationS"]})
    if not upper:
        return [], []
    polygon = [(0.0, 0.0), *upper, *[(x, -y) for x, y in reversed(upper)]]
    return polygon, timing


def mass_concentration_to_fraction(value_kg_m3: float, molar_mass_kg_mol: float, pressure_pa: float, temperature_k: float) -> float:
    return value_kg_m3 / molar_mass_kg_mol / (pressure_pa / (8.314462618 * temperature_k))
