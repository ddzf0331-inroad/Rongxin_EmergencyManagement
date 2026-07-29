import unittest

from simulation_service.slab import is_available, parse_ground_table, run_slab, threshold_polygon
from simulation_service.models import simulate


@unittest.skipUnless(is_available(), "platform SLAB binary not installed")
class SlabTests(unittest.TestCase):
    def test_platform_binary_and_parser(self):
        chemical = {
            "molarMassKgMol": 0.0709, "vaporHeatCapacityJkgK": 480.0,
            "boilingPointK": 239.1, "latentHeatJkg": 287000.0,
            "liquidHeatCapacityJkgK": 900.0, "liquidDensityKgM3": 1500.0,
        }
        source = {
            "releaseKind": "gas", "liquidMassFraction": 0.0, "temperatureK": 298.15,
            "massRateKgS": 1.0, "areaM2": 0.01, "durationS": 60.0,
            "instantaneousMassKg": 0.0, "heightM": 1.0,
        }
        weather = {
            "surfaceRoughnessM": 0.3, "windMeasurementHeightM": 10.0, "windSpeedMS": 3.0,
            "temperatureK": 298.15, "relativeHumidityPct": 50.0, "stabilityClass": "D",
        }
        rows = parse_ground_table(run_slab(chemical, source, weather))
        self.assertGreater(len(rows), 5)
        self.assertTrue(all(len(row["fractions"]) == 6 for row in rows))
        threshold = max(row["fractions"][0] for row in rows) * 0.001
        polygon, timing = threshold_polygon(rows, threshold)
        self.assertGreater(len(polygon), 4)
        self.assertTrue(timing)

    def test_dense_gas_end_to_end(self):
        chemical = {
            "id": "dense-test", "name": "dense test", "cas": "7782-50-5", "phase": "liquefiedGas",
            "molarMassKgMol": 0.0709, "gasDensityKgM3": 2.95, "liquidDensityKgM3": 1500.0,
            "boilingPointK": 239.1, "vaporPressurePa": 700000.0,
            "vaporHeatCapacityJkgK": 480.0, "liquidHeatCapacityJkgK": 900.0,
            "latentHeatJkg": 287000.0, "gamma": 1.33,
            "erpg1Ppm": 1.0, "erpg2Ppm": 3.0, "erpg3Ppm": 20.0, "erpgUnit": "ppm",
            "erpgSource": "test", "erpgVersion": "test", "propertySource": "test", "propertyVersion": "test",
        }
        body = {
            "scenario": {
                "releaseType": "pressurizedGas", "inventoryKg": 100.0, "isolationTimeS": 60.0,
                "releaseTemperatureK": 298.15, "releaseHeightM": 1.0, "holeDiameterM": 0.02,
                "vesselPressurePa": 800000.0, "sourceCoordinate": {"eastM": 0.0, "northM": 0.0},
            },
            "weather": {
                "windSpeedMS": 3.0, "windDirectionDeg": 0.0, "temperatureK": 298.15,
                "pressurePa": 101325.0, "relativeHumidityPct": 50.0, "stabilityClass": "D",
                "surfaceRoughnessM": 0.3, "source": "test", "corrected": False,
            },
        }
        _, result = simulate(body, chemical)
        self.assertEqual(result["modelRoute"]["model"], "slab")
        distances = [zone["maxDownwindDistanceM"] for zone in result["zones"]]
        self.assertLessEqual(distances[0], distances[1])
        self.assertLessEqual(distances[1], distances[2])


if __name__ == "__main__":
    unittest.main()
