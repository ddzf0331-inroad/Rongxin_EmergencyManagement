from __future__ import annotations

import math
from typing import Any

from . import ENGINE_VERSION
from . import slab

R = 8.314462618
AIR_MOLAR_MASS = 0.0289652
G = 9.80665


class InputError(ValueError):
    def __init__(self, message: str, fields: list[str] | None = None):
        super().__init__(message)
        self.fields = fields or []


def require_number(data: dict[str, Any], field: str, positive: bool = True) -> float:
    value = data.get(field)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        raise InputError(f"{field} must be a finite number", [field])
    number = float(value)
    if positive and number <= 0:
        raise InputError(f"{field} must be greater than zero", [field])
    return number


def validate_chemical(chemical: dict[str, Any]) -> dict[str, Any]:
    required_text = ("name", "cas", "phase", "erpgSource", "erpgVersion", "propertySource", "propertyVersion")
    missing = [field for field in required_text if not str(chemical.get(field, "")).strip()]
    numeric = (
        "molarMassKgMol", "gasDensityKgM3", "liquidDensityKgM3", "boilingPointK", "vaporPressurePa",
        "vaporHeatCapacityJkgK", "liquidHeatCapacityJkgK", "latentHeatJkg", "gamma",
        "erpg1Ppm", "erpg2Ppm", "erpg3Ppm",
    )
    for field in numeric:
        try:
            require_number(chemical, field)
        except InputError:
            missing.append(field)
    if missing:
        raise InputError("Chemical profile is incomplete", sorted(set(missing)))
    if not chemical["erpg1Ppm"] < chemical["erpg2Ppm"] < chemical["erpg3Ppm"]:
        raise InputError("ERPG thresholds must satisfy ERPG-1 < ERPG-2 < ERPG-3", ["erpg1Ppm", "erpg2Ppm", "erpg3Ppm"])
    if chemical.get("erpgUnit") != "ppm":
        raise InputError("ERPG unit must be ppm", ["erpgUnit"])
    if chemical["gamma"] <= 1:
        raise InputError("gamma must be greater than 1", ["gamma"])
    return chemical


def validate_weather(weather: dict[str, Any]) -> dict[str, Any]:
    for field in ("windSpeedMS", "windDirectionDeg", "temperatureK", "pressurePa", "relativeHumidityPct", "surfaceRoughnessM"):
        require_number(weather, field, positive=field != "windDirectionDeg")
    stability = str(weather.get("stabilityClass", "")).upper()
    if stability not in tuple("ABCDEF"):
        raise InputError("Pasquill stability class A-F must be confirmed", ["stabilityClass"])
    if weather["windSpeedMS"] < 0.5:
        raise InputError("Wind speed below 0.5 m/s is outside this rapid model; confirm a corrected value", ["windSpeedMS"])
    if not 0 <= weather["relativeHumidityPct"] <= 100:
        raise InputError("relativeHumidityPct must be between 0 and 100", ["relativeHumidityPct"])
    normalized = dict(weather)
    normalized["stabilityClass"] = stability
    normalized["windDirectionDeg"] = float(weather["windDirectionDeg"]) % 360
    return normalized


def source_term(scenario: dict[str, Any], chemical: dict[str, Any], weather: dict[str, Any]) -> dict[str, float | str]:
    kind = scenario.get("releaseType")
    inventory = require_number(scenario, "inventoryKg")
    temperature = require_number(scenario, "releaseTemperatureK")
    height = require_number(scenario, "releaseHeightM", positive=False)
    if height < 0:
        raise InputError("releaseHeightM cannot be negative", ["releaseHeightM"])

    if kind == "instantaneous":
        initial_density = weather["pressurePa"] * chemical["molarMassKgMol"] / (R * temperature)
        initial_volume = inventory / initial_density
        return {
            "releaseKind": "instantaneous", "massRateKgS": 0.0, "durationS": 0.0,
            "releasedMassKg": inventory, "instantaneousMassKg": inventory,
            "initialGasDensityKgM3": initial_density, "instantaneousVolumeM3": initial_volume,
            "areaM2": initial_volume / height if height > 0 else 0.0,
            "heightM": height, "temperatureK": temperature, "liquidMassFraction": 0.0,
        }

    isolation = min(require_number(scenario, "isolationTimeS"), 3600.0)
    cd = require_number({"dischargeCoefficient": scenario.get("dischargeCoefficient", 0.62)}, "dischargeCoefficient")
    if not 0 < cd <= 1:
        raise InputError("dischargeCoefficient must be in (0, 1]", ["dischargeCoefficient"])

    diameter = require_number(scenario, "holeDiameterM")
    area = math.pi * diameter * diameter / 4
    pressure = require_number(scenario, "vesselPressurePa")
    ambient_pressure = weather["pressurePa"]

    if kind == "pressurizedGas":
        gamma = chemical["gamma"]
        molar_mass = chemical["molarMassKgMol"]
        critical_ratio = (2 / (gamma + 1)) ** (gamma / (gamma - 1))
        if ambient_pressure / pressure <= critical_ratio:
            rate = cd * area * pressure * math.sqrt(
                gamma * molar_mass / (R * temperature) * (2 / (gamma + 1)) ** ((gamma + 1) / (gamma - 1))
            )
            regime = "choked"
        else:
            ratio = ambient_pressure / pressure
            rate = cd * area * pressure * math.sqrt(
                2 * gamma * molar_mass / (R * temperature * (gamma - 1))
                * (ratio ** (2 / gamma) - ratio ** ((gamma + 1) / gamma))
            )
            regime = "subsonic"
        duration = min(inventory / rate, isolation, 3600.0)
        return {
            "releaseKind": "gas", "flowRegime": regime, "massRateKgS": rate, "durationS": duration,
            "releasedMassKg": rate * duration, "instantaneousMassKg": 0.0, "areaM2": area,
            "heightM": height, "temperatureK": temperature, "liquidMassFraction": 0.0,
        }

    if kind != "liquefiedGas":
        raise InputError("Unsupported releaseType", ["releaseType"])
    delta_p = pressure - ambient_pressure
    if delta_p <= 0:
        raise InputError("vesselPressurePa must exceed ambient pressure", ["vesselPressurePa"])
    liquid_rate = cd * area * math.sqrt(2 * chemical["liquidDensityKgM3"] * delta_p)
    duration = min(inventory / liquid_rate, isolation, 3600.0)
    flash_fraction = max(0.0, min(1.0, chemical["liquidHeatCapacityJkgK"] * (temperature - chemical["boilingPointK"]) / chemical["latentHeatJkg"]))
    flash_rate = liquid_rate * flash_fraction
    remaining_rate = liquid_rate - flash_rate
    pool_area = require_number(scenario, "poolAreaM2")
    heat_flux = require_number(scenario, "poolHeatFluxWM2")
    heat_evaporation = heat_flux * pool_area / chemical["latentHeatJkg"]
    mass_transfer = require_number({"massTransferCoefficientMS": scenario.get("massTransferCoefficientMS", 0.0)}, "massTransferCoefficientMS", positive=False)
    if mass_transfer < 0:
        raise InputError("massTransferCoefficientMS cannot be negative", ["massTransferCoefficientMS"])
    vapor_pressure = require_number(scenario, "vaporPressurePa")
    vapor_density = vapor_pressure * chemical["molarMassKgMol"] / (R * weather["temperatureK"])
    mass_evaporation = max(0.0, mass_transfer * pool_area * vapor_density)
    pool_rate = min(remaining_rate, heat_evaporation + mass_evaporation)
    rate = flash_rate + pool_rate
    if rate <= 0:
        raise InputError("Flash and pool evaporation source strength is zero", ["poolHeatFluxWM2", "massTransferCoefficientMS"])
    return {
        "releaseKind": "pool", "flowRegime": "flash-and-pool", "massRateKgS": rate,
        "liquidOutflowKgS": liquid_rate, "flashFraction": flash_fraction, "flashRateKgS": flash_rate,
        "poolEvaporationKgS": pool_rate, "durationS": duration, "releasedMassKg": rate * duration,
        "instantaneousMassKg": 0.0, "areaM2": pool_area, "heightM": height,
        "temperatureK": temperature, "liquidMassFraction": max(0.0, 1.0 - flash_fraction),
    }


def air_density(weather: dict[str, Any]) -> float:
    return weather["pressurePa"] * AIR_MOLAR_MASS / (R * weather["temperatureK"])


def model_route(chemical: dict[str, Any], source: dict[str, Any], weather: dict[str, Any]) -> dict[str, Any]:
    rho_air = air_density(weather)
    rho_gas = chemical["gasDensityKgM3"]
    u_star = 0.4 * weather["windSpeedMS"] / math.log(max(10.0 / weather["surfaceRoughnessM"], 1.01))
    characteristic = max(source["heightM"], math.sqrt(source["areaM2"]), 0.1)
    reduced_g = G * max(rho_gas - rho_air, 0.0) / rho_air
    ri = reduced_g * characteristic / max(u_star * u_star, 1e-9)
    model = "gaussian" if rho_gas <= rho_air or ri < 1.0 else "slab"
    return {
        "model": model, "criterion": "gas-density-or-friction-Richardson",
        "gasDensityKgM3": rho_gas, "airDensityKgM3": rho_air, "frictionVelocityMS": u_star,
        "richardsonNumber": ri, "criticalRichardsonNumber": 1.0,
        "modelVersion": "PG-AQ3046-1.0" if model == "gaussian" else "EPA-SLAB-1990",
    }


def ppm_to_kg_m3(ppm: float, chemical: dict[str, Any], weather: dict[str, Any]) -> float:
    return ppm * 1e-6 * chemical["molarMassKgMol"] * weather["pressurePa"] / (R * weather["temperatureK"])


def sigmas(x: float, stability: str, roughness: float) -> tuple[float, float]:
    coefficients = {
        "A": (0.22, 0.20, 0.0, 1.0), "B": (0.16, 0.12, 0.0, 1.0),
        "C": (0.11, 0.08, 0.0002, 0.5), "D": (0.08, 0.06, 0.0015, 0.5),
        "E": (0.06, 0.03, 0.0003, 1.0), "F": (0.04, 0.016, 0.0003, 1.0),
    }
    ay, az, bz, pz = coefficients[stability]
    sy = ay * x * (1 + 0.0001 * x) ** -0.5
    sz = az * x * (1 + bz * x) ** -pz
    factor = max(0.75, min(1.5, (roughness / 0.1) ** 0.08))
    return sy * factor, sz * factor


def _rotate(local: tuple[float, float], source_xy: dict[str, float], wind_from_deg: float) -> dict[str, float]:
    downwind = math.radians((wind_from_deg + 180.0) % 360.0)
    x, y = local
    return {
        "eastM": source_xy["eastM"] + x * math.sin(downwind) + y * math.cos(downwind),
        "northM": source_xy["northM"] + x * math.cos(downwind) - y * math.sin(downwind),
    }


def _polygon_metrics(local: list[tuple[float, float]]) -> tuple[float, float, float]:
    if not local:
        return 0.0, 0.0, 0.0
    distance = max(point[0] for point in local)
    width = max(point[1] for point in local) - min(point[1] for point in local)
    area = abs(sum(local[i][0] * local[(i + 1) % len(local)][1] - local[(i + 1) % len(local)][0] * local[i][1] for i in range(len(local))) / 2)
    return distance, width, area


def gaussian_zone(threshold: float, source: dict[str, Any], weather: dict[str, Any]) -> tuple[list[tuple[float, float]], float]:
    q = source["massRateKgS"]
    u = weather["windSpeedMS"]
    height = source["heightM"]
    upper: list[tuple[float, float]] = []
    peak = 0.0
    for index in range(1, 401):
        x = 2.0 * 1.025 ** index
        sy, sz = sigmas(x, weather["stabilityClass"], weather["surfaceRoughnessM"])
        center = q / (math.pi * u * sy * sz) * math.exp(-(height * height) / (2 * sz * sz))
        peak = max(peak, center)
        if center >= threshold:
            y = sy * math.sqrt(2 * math.log(center / threshold))
            upper.append((x, y))
        elif upper and x > upper[-1][0] * 1.15:
            break
        if x > 20000:
            break
    if not upper:
        return [], peak
    local = [(0.0, 0.0), *upper, *[(x, -y) for x, y in reversed(upper)]]
    return local, peak


def gaussian_puff_zone(threshold: float, source: dict[str, Any], weather: dict[str, Any]) -> tuple[list[tuple[float, float]], float]:
    mass = source["releasedMassKg"]
    height = source["heightM"]
    upper: list[tuple[float, float]] = []
    peak = 0.0
    for index in range(1, 401):
        x = 2.0 * 1.025 ** index
        sy, sz = sigmas(x, weather["stabilityClass"], weather["surfaceRoughnessM"])
        sx = sy
        center = 2 * mass / ((2 * math.pi) ** 1.5 * sx * sy * sz) * math.exp(-(height * height) / (2 * sz * sz))
        peak = max(peak, center)
        if center >= threshold:
            y = sy * math.sqrt(2 * math.log(center / threshold))
            upper.append((x, y))
        elif upper and x > upper[-1][0] * 1.15:
            break
        if x > 20000:
            break
    if not upper:
        return [], peak
    return [(0.0, 0.0), *upper, *[(x, -y) for x, y in reversed(upper)]], peak


def _clip_polygon_x(polygon: list[tuple[float, float]], boundary: float, keep_greater: bool) -> list[tuple[float, float]]:
    if not polygon:
        return []
    result: list[tuple[float, float]] = []
    previous = polygon[-1]
    previous_inside = previous[0] >= boundary if keep_greater else previous[0] <= boundary
    for current in polygon:
        current_inside = current[0] >= boundary if keep_greater else current[0] <= boundary
        if current_inside != previous_inside:
            ratio = (boundary - previous[0]) / (current[0] - previous[0])
            result.append((boundary, previous[1] + ratio * (current[1] - previous[1])))
        if current_inside:
            result.append(current)
        previous, previous_inside = current, current_inside
    return result


def _frames(zones: list[dict[str, Any]], source: dict[str, Any], weather: dict[str, Any]) -> list[dict[str, Any]]:
    max_distance = max((zone["maxDownwindDistanceM"] for zone in zones), default=0.0)
    end = min(3600.0, source["durationS"] + max_distance / weather["windSpeedMS"])
    step = max(10.0, min(60.0, end / 30.0 if end else 10.0))
    frames = []
    time_s = 0.0
    while time_s <= end + 0.001:
        leading = time_s * weather["windSpeedMS"]
        trailing = max(0.0, (time_s - source["durationS"]) * weather["windSpeedMS"])
        frame_zones = []
        for zone in zones:
            coords = zone["localCoordinates"]
            clipped = _clip_polygon_x(_clip_polygon_x(coords, trailing, True), leading, False)
            if len(clipped) >= 3:
                frame = dict(zone)
                frame["coordinates"] = [_rotate(point, zone["sourceCoordinate"], weather["windDirectionDeg"]) for point in clipped]
                frame.pop("localCoordinates", None)
                frame.pop("sourceCoordinate", None)
                frame_zones.append(frame)
        frames.append({"timeS": round(time_s, 3), "zones": frame_zones})
        time_s += step
    return frames


def simulate(raw: dict[str, Any], chemical: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    chemical = validate_chemical(dict(chemical))
    scenario = dict(raw.get("scenario") or {})
    weather = validate_weather(dict(raw.get("weather") or {}))
    source_xy = dict(scenario.get("sourceCoordinate") or {})
    require_number(source_xy, "eastM", positive=False)
    require_number(source_xy, "northM", positive=False)
    source = source_term(scenario, chemical, weather)
    route = model_route(chemical, source, weather)
    if route["model"] == "slab" and source["releaseKind"] == "instantaneous" and source["heightM"] <= 0:
        raise InputError(
            "releaseHeightM must be greater than zero for an instantaneous SLAB volume source",
            ["releaseHeightM"],
        )
    thresholds = (("ERPG-3", chemical["erpg3Ppm"], "#ff3b30"), ("ERPG-2", chemical["erpg2Ppm"], "#ffc400"), ("ERPG-1", chemical["erpg1Ppm"], "#168cff"))
    slab_rows = None
    if route["model"] == "slab":
        slab_rows = slab.parse_ground_table(slab.run_slab(chemical, source, weather))
    zones: list[dict[str, Any]] = []
    for level, ppm, color in thresholds:
        threshold = ppm_to_kg_m3(ppm, chemical, weather)
        if slab_rows is not None:
            fraction = slab.mass_concentration_to_fraction(threshold, chemical["molarMassKgMol"], weather["pressurePa"], weather["temperatureK"])
            local, timing = slab.threshold_polygon(slab_rows, fraction)
            peak = slab_rows[0]["fractions"][0] * weather["pressurePa"] / (R * weather["temperatureK"]) * chemical["molarMassKgMol"]
        else:
            local, peak = (gaussian_puff_zone if source["releaseKind"] == "instantaneous" else gaussian_zone)(threshold, source, weather)
            timing = []
        distance, width, area = _polygon_metrics(local)
        arrival = distance / weather["windSpeedMS"] if distance else 0.0
        zone = {
            "level": level, "thresholdPpm": ppm, "thresholdKgM3": threshold, "color": color,
            "coordinates": [_rotate(point, source_xy, weather["windDirectionDeg"]) for point in local],
            "localCoordinates": local, "sourceCoordinate": source_xy,
            "maxDownwindDistanceM": distance, "maxWidthM": width, "areaM2": area,
            "peakConcentrationKgM3": peak, "arrivalTimeS": arrival,
            "durationS": source["durationS"], "timing": timing,
            "harmDescription": {"ERPG-3": "可能出现危及生命的健康影响", "ERPG-2": "可能妨碍采取防护行动", "ERPG-1": "可能出现轻微、短暂健康影响"}[level],
        }
        zones.append(zone)
    # Numeric construction uses one threshold family, which guarantees the required nesting.
    frames = _frames(zones, source, weather)
    public_zones = []
    for zone in zones:
        cleaned = dict(zone)
        cleaned.pop("localCoordinates", None)
        cleaned.pop("sourceCoordinate", None)
        public_zones.append(cleaned)
    normalized = {"scenario": scenario, "weather": weather, "chemical": chemical, "sourceTerm": source}
    result = {
        "engineVersion": ENGINE_VERSION, "modelRoute": route, "sourceTerm": source,
        "zones": public_zones, "frames": frames,
        "summary": {"model": route["model"], "releasedMassKg": source["releasedMassKg"], "effectiveDurationS": source["durationS"]},
    }
    return normalized, result
