import math
import unittest

from simulation_service.models import InputError, model_route, ppm_to_kg_m3, simulate, source_term


CHEMICAL = {
    "id": "ammonia", "name": "氨", "cas": "7664-41-7", "phase": "liquefiedGas",
    "molarMassKgMol": 0.017031, "gasDensityKgM3": 0.73, "liquidDensityKgM3": 682.0,
    "boilingPointK": 239.82, "vaporPressurePa": 101325.0, "vaporHeatCapacityJkgK": 2060.0,
    "liquidHeatCapacityJkgK": 4700.0, "latentHeatJkg": 1_371_000.0, "gamma": 1.31,
    "erpg1Ppm": 25.0, "erpg2Ppm": 150.0, "erpg3Ppm": 1500.0,
    "erpgUnit": "ppm", "erpgSource": "test", "erpgVersion": "test", "propertySource": "test", "propertyVersion": "test",
}
WEATHER = {
    "windSpeedMS": 3.0, "windDirectionDeg": 90.0, "temperatureK": 298.15,
    "pressurePa": 101325.0, "relativeHumidityPct": 50.0, "stabilityClass": "D",
    "surfaceRoughnessM": 0.3, "source": "test", "corrected": False,
}


class ModelTests(unittest.TestCase):
    def test_choked_gas_and_effective_duration(self):
        scenario = {
            "releaseType": "pressurizedGas", "inventoryKg": 100.0, "isolationTimeS": 900.0,
            "releaseTemperatureK": 298.15, "releaseHeightM": 1.0, "holeDiameterM": 0.01,
            "vesselPressurePa": 800000.0, "dischargeCoefficient": 0.62,
        }
        source = source_term(scenario, CHEMICAL, WEATHER)
        self.assertEqual(source["flowRegime"], "choked")
        self.assertAlmostEqual(source["massRateKgS"], 0.0683163131, places=9)
        self.assertAlmostEqual(source["durationS"], min(100 / source["massRateKgS"], 900, 3600))

    def test_flash_and_pool_components(self):
        scenario = {
            "releaseType": "liquefiedGas", "inventoryKg": 1000.0, "isolationTimeS": 600.0,
            "releaseTemperatureK": 260.0, "releaseHeightM": 0.0, "holeDiameterM": 0.01,
            "vesselPressurePa": 900000.0, "dischargeCoefficient": 0.62,
            "poolAreaM2": 20.0, "poolHeatFluxWM2": 500.0, "massTransferCoefficientMS": 0.002,
            "vaporPressurePa": 700000.0,
        }
        source = source_term(scenario, CHEMICAL, WEATHER)
        expected_flash = 4700 * (260 - 239.82) / 1_371_000
        self.assertAlmostEqual(source["flashFraction"], expected_flash)
        self.assertGreater(source["poolEvaporationKgS"], 0)

    def test_ppm_conversion(self):
        value = ppm_to_kg_m3(1000, CHEMICAL, WEATHER)
        expected = 1000e-6 * 0.017031 * 101325 / (8.314462618 * 298.15)
        self.assertAlmostEqual(value, expected)

    def test_gaussian_end_to_end_is_deterministic_and_nested(self):
        body = {
            "scenario": {
                "releaseType": "pressurizedGas", "inventoryKg": 100.0, "isolationTimeS": 300.0,
                "releaseTemperatureK": 298.15, "releaseHeightM": 1.0, "holeDiameterM": 0.01,
                "vesselPressurePa": 800000.0, "dischargeCoefficient": 0.62,
                "sourceCoordinate": {"eastM": 100.0, "northM": 100.0},
            },
            "weather": WEATHER,
        }
        _, first = simulate(body, CHEMICAL)
        _, second = simulate(body, CHEMICAL)
        self.assertEqual(first, second)
        distances = {zone["level"]: zone["maxDownwindDistanceM"] for zone in first["zones"]}
        self.assertLessEqual(distances["ERPG-3"], distances["ERPG-2"])
        self.assertLessEqual(distances["ERPG-2"], distances["ERPG-1"])

    def test_low_wind_and_missing_stability_block(self):
        body = {
            "scenario": {"sourceCoordinate": {"eastM": 0.0, "northM": 0.0}},
            "weather": {**WEATHER, "windSpeedMS": 0.2, "stabilityClass": ""},
        }
        with self.assertRaises(InputError):
            simulate(body, CHEMICAL)
        body["weather"] = {**WEATHER, "stabilityClass": ""}
        with self.assertRaises(InputError):
            simulate(body, CHEMICAL)

    def test_dense_route_requires_slab(self):
        source = {"heightM": 0.0, "areaM2": 4.0}
        route = model_route({**CHEMICAL, "gasDensityKgM3": 5.0}, source, WEATHER)
        self.assertEqual(route["model"], "slab")
        self.assertGreaterEqual(route["richardsonNumber"], 1.0)

    def test_instantaneous_puff_does_not_require_isolation(self):
        body = {
            "scenario": {
                "releaseType": "instantaneous", "inventoryKg": 50.0,
                "releaseTemperatureK": 298.15, "releaseHeightM": 0.0,
                "sourceCoordinate": {"eastM": 100.0, "northM": 100.0},
            },
            "weather": WEATHER,
        }
        _, result = simulate(body, CHEMICAL)
        self.assertEqual(result["sourceTerm"]["releaseKind"], "instantaneous")
        self.assertEqual(result["sourceTerm"]["massRateKgS"], 0.0)
        self.assertEqual(result["sourceTerm"]["durationS"], 0.0)
        self.assertEqual(result["summary"]["releasedMassKg"], 50.0)
        self.assertTrue(result["frames"])

    def test_instantaneous_slab_requires_positive_cloud_height(self):
        body = {
            "scenario": {
                "releaseType": "instantaneous", "inventoryKg": 50.0,
                "releaseTemperatureK": 298.15, "releaseHeightM": 0.0,
                "sourceCoordinate": {"eastM": 0.0, "northM": 0.0},
            },
            "weather": WEATHER,
        }
        with self.assertRaises(InputError) as caught:
            simulate(body, {**CHEMICAL, "gasDensityKgM3": 2.0})
        self.assertEqual(caught.exception.fields, ["releaseHeightM"])

    def test_meteorological_wind_direction_rotates_downwind(self):
        body = {
            "scenario": {
                "releaseType": "pressurizedGas", "inventoryKg": 100.0, "isolationTimeS": 300.0,
                "releaseTemperatureK": 298.15, "releaseHeightM": 1.0, "holeDiameterM": 0.01,
                "vesselPressurePa": 800000.0, "sourceCoordinate": {"eastM": 100.0, "northM": 100.0},
            },
            "weather": WEATHER,
        }
        _, result = simulate(body, CHEMICAL)
        outer = result["zones"][-1]["coordinates"]
        self.assertLess(min(point["eastM"] for point in outer), 100.0)  # wind is from east
        self.assertAlmostEqual(max(point["eastM"] for point in outer), 100.0, places=6)

    def test_liquid_ammonia_flash_pool_end_to_end(self):
        body = {
            "scenario": {
                "releaseType": "liquefiedGas", "inventoryKg": 1000.0, "isolationTimeS": 600.0,
                "releaseTemperatureK": 260.0, "releaseHeightM": 0.0, "holeDiameterM": 0.01,
                "vesselPressurePa": 900000.0, "poolAreaM2": 20.0, "poolHeatFluxWM2": 500.0,
                "massTransferCoefficientMS": 0.002, "vaporPressurePa": 700000.0,
                "sourceCoordinate": {"eastM": 0.0, "northM": 0.0},
            },
            "weather": WEATHER,
        }
        _, result = simulate(body, CHEMICAL)
        self.assertGreater(result["sourceTerm"]["flashRateKgS"], 0)
        self.assertGreater(result["sourceTerm"]["poolEvaporationKgS"], 0)
        self.assertEqual([zone["level"] for zone in result["zones"]], ["ERPG-3", "ERPG-2", "ERPG-1"])


if __name__ == "__main__":
    unittest.main()
