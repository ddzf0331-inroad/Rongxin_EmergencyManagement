from __future__ import annotations

from typing import Any


BUILTIN_PROPERTIES: dict[str, dict[str, float]] = {
    "7664-41-7": {
        "gasDensityKgM3": 0.696126,
        "liquidDensityKgM3": 682.8,
        "boilingPointK": 239.72,
        "vaporPressurePa": 994427.0,
        "vaporHeatCapacityJkgK": 2170.0,
        "liquidHeatCapacityJkgK": 4294.0,
        "latentHeatJkg": 1370840.0,
        "gamma": 1.307,
    },
    "7783-06-4": {
        "gasDensityKgM3": 1.392824,
        "liquidDensityKgM3": 960.0,
        "boilingPointK": 212.81,
        "vaporPressurePa": 2032032.0,
        "vaporHeatCapacityJkgK": 1004.0,
        "liquidHeatCapacityJkgK": 2010.0,
        "latentHeatJkg": 547980.0,
        "gamma": 1.33,
    },
    "7782-50-5": {
        "gasDensityKgM3": 2.898215,
        "liquidDensityKgM3": 1574.0,
        "boilingPointK": 239.10,
        "vaporPressurePa": 774357.0,
        "vaporHeatCapacityJkgK": 498.1,
        "liquidHeatCapacityJkgK": 926.3,
        "latentHeatJkg": 287840.0,
        "gamma": 1.308,
    },
    "7446-09-5": {
        "gasDensityKgM3": 2.618514,
        "liquidDensityKgM3": 1462.0,
        "boilingPointK": 263.13,
        "vaporPressurePa": 401293.0,
        "vaporHeatCapacityJkgK": 622.6,
        "liquidHeatCapacityJkgK": 1331.0,
        "latentHeatJkg": 386500.0,
        "gamma": 1.29,
    },
}

LIQUID_PROPERTY_FIELDS = (
    "liquidDensityKgM3",
    "boilingPointK",
    "vaporPressurePa",
    "vaporHeatCapacityJkgK",
    "liquidHeatCapacityJkgK",
    "latentHeatJkg",
    "gamma",
)


def is_builtin_chemical(chemical: dict[str, Any]) -> bool:
    return str(chemical.get("cas", "")).strip() in BUILTIN_PROPERTIES
