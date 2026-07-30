import unittest

from simulation_service.slab import build_input, is_available, parse_ground_table, run_slab, threshold_polygon
from simulation_service.models import simulate


class SlabInputTests(unittest.TestCase):
    def test_input_uses_integer_control_fields_and_decimal_real_fields(self):
        chemical = {
            "molarMassKgMol": 0.03408, "vaporHeatCapacityJkgK": 1010.0,
            "boilingPointK": 212.9, "latentHeatJkg": 548000.0,
            "liquidHeatCapacityJkgK": 2400.0, "liquidDensityKgM3": 964.0,
        }
        source = {
            "releaseKind": "gas", "liquidMassFraction": 0.0, "temperatureK": 298.15,
            "massRateKgS": 1.0, "areaM2": 0.00007853981633974484, "durationS": 600.0,
            "instantaneousMassKg": 0.0, "heightM": 1.0,
        }
        weather = {
            "surfaceRoughnessM": 0.3, "windMeasurementHeightM": 10.0, "windSpeedMS": 3.0,
            "temperatureK": 298.15, "relativeHumidityPct": 60.0, "stabilityClass": "D",
        }
        lines = build_input(chemical, source, weather).splitlines()
        self.assertEqual((lines[0], lines[1], lines[28]), ("2", "1", "4"))
        self.assertEqual(lines[12], "1.0")
        self.assertEqual(lines[13], "0.00007853981633974484")
        self.assertEqual(lines[14], "600.0")
        self.assertTrue(all("e" not in line.lower() for line in lines))

    def test_ideal_gas_approximation_uses_internal_inactive_liquid_placeholders(self):
        chemical = {
            "molarMassKgMol": 0.0709,
            "vaporHeatCapacityJkgK": 410.5,
            "propertyMode": "idealGasApproximation",
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
        lines = build_input(chemical, source, weather).splitlines()
        self.assertEqual([lines[index] for index in (4, 6, 7, 8)], ["1.0"] * 4)


@unittest.skipUnless(is_available(), "platform SLAB binary not installed")
class SlabTests(unittest.TestCase):
    def test_unknown_heavy_ideal_gas_continuous_and_instantaneous(self):
        chemical = {
            "id": "unknown-heavy", "name": "未知重气", "cas": "9999-99-9", "phase": "gas",
            "molarMassKgMol": 0.0709,
            "erpg1Ppm": 0.1, "erpg2Ppm": 0.3, "erpg3Ppm": 1.0,
        }
        weather = {
            "windSpeedMS": 3.0, "windDirectionDeg": 45.0, "temperatureK": 298.15,
            "pressurePa": 101325.0, "relativeHumidityPct": 60.0, "stabilityClass": "D",
            "surfaceRoughnessM": 0.3, "windMeasurementHeightM": 10.0,
            "source": "test", "corrected": False,
        }
        scenarios = [
            {
                "releaseType": "pressurizedGas", "inventoryKg": 100.0, "isolationTimeS": 600.0,
                "releaseTemperatureK": 298.15, "releaseHeightM": 1.0, "holeDiameterM": 0.01,
                "vesselPressurePa": 800000.0, "sourceCoordinate": {"eastM": 0.0, "northM": 0.0},
            },
            {
                "releaseType": "instantaneous", "inventoryKg": 1100.0,
                "releaseTemperatureK": 298.15, "releaseHeightM": 1.0,
                "sourceCoordinate": {"eastM": 0.0, "northM": 0.0},
            },
        ]
        for scenario in scenarios:
            with self.subTest(release_type=scenario["releaseType"]):
                normalized, result = simulate({"scenario": scenario, "weather": weather}, chemical)
                self.assertEqual(result["modelRoute"]["model"], "slab")
                self.assertEqual(result["propertyMode"], "idealGasApproximation")
                self.assertEqual(normalized["chemical"]["gamma"], 1.4)
                self.assertTrue(all(zone["maxDownwindDistanceM"] > 0 for zone in result["zones"]))

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

    def test_hydrogen_sulfide_small_orifice_end_to_end(self):
        chemical = {
            "id": "h2s-test", "name": "硫化氢", "cas": "7783-06-4", "phase": "gas",
            "molarMassKgMol": 0.03408, "gasDensityKgM3": 1.36, "liquidDensityKgM3": 964.0,
            "boilingPointK": 212.9, "vaporPressurePa": 1880000.0,
            "vaporHeatCapacityJkgK": 1010.0, "liquidHeatCapacityJkgK": 2400.0,
            "latentHeatJkg": 548000.0, "gamma": 1.32,
            "erpg1Ppm": 0.1, "erpg2Ppm": 30.0, "erpg3Ppm": 100.0, "erpgUnit": "ppm",
            "erpgSource": "test", "erpgVersion": "test", "propertySource": "test", "propertyVersion": "test",
        }
        body = {
            "scenario": {
                "releaseType": "pressurizedGas", "inventoryKg": 100.0, "isolationTimeS": 600.0,
                "releaseTemperatureK": 298.15, "releaseHeightM": 1.0, "holeDiameterM": 0.01,
                "vesselPressurePa": 800000.0, "sourceCoordinate": {"eastM": 0.0, "northM": 0.0},
            },
            "weather": {
                "windSpeedMS": 3.0, "windDirectionDeg": 45.0, "temperatureK": 298.15,
                "pressurePa": 101325.0, "relativeHumidityPct": 60.0, "stabilityClass": "D",
                "surfaceRoughnessM": 0.3, "windMeasurementHeightM": 10.0,
                "source": "test", "corrected": False,
            },
        }
        _, result = simulate(body, chemical)
        self.assertEqual(result["modelRoute"]["model"], "slab")
        self.assertEqual(len(result["zones"]), 3)
        self.assertTrue(all(zone["maxDownwindDistanceM"] > 0 for zone in result["zones"]))

    def test_hydrogen_sulfide_instantaneous_release_end_to_end(self):
        chemical = {
            "id": "h2s-test", "name": "硫化氢", "cas": "7783-06-4", "phase": "gas",
            "molarMassKgMol": 0.03408, "gasDensityKgM3": 1.36, "liquidDensityKgM3": 964.0,
            "boilingPointK": 212.9, "vaporPressurePa": 1880000.0,
            "vaporHeatCapacityJkgK": 1010.0, "liquidHeatCapacityJkgK": 2400.0,
            "latentHeatJkg": 548000.0, "gamma": 1.32,
            "erpg1Ppm": 0.1, "erpg2Ppm": 30.0, "erpg3Ppm": 100.0, "erpgUnit": "ppm",
            "erpgSource": "test", "erpgVersion": "test", "propertySource": "test", "propertyVersion": "test",
        }
        body = {
            "scenario": {
                "releaseType": "instantaneous", "inventoryKg": 1100.0,
                "releaseTemperatureK": 298.15, "releaseHeightM": 1.0,
                "sourceCoordinate": {"eastM": 0.0, "northM": 0.0},
            },
            "weather": {
                "windSpeedMS": 3.0, "windDirectionDeg": 45.0, "temperatureK": 298.15,
                "pressurePa": 101325.0, "relativeHumidityPct": 60.0, "stabilityClass": "D",
                "surfaceRoughnessM": 0.3, "windMeasurementHeightM": 10.0,
                "source": "test", "corrected": False,
            },
        }
        normalized, result = simulate(body, chemical)
        source = normalized["sourceTerm"]
        self.assertEqual(result["modelRoute"]["model"], "slab")
        self.assertEqual(source["massRateKgS"], 0.0)
        self.assertEqual(source["durationS"], 0.0)
        self.assertAlmostEqual(source["areaM2"], 789.6697202536956)
        distances = [zone["maxDownwindDistanceM"] for zone in result["zones"]]
        self.assertEqual(distances, [454.0, 779.0, 8910.0])
        self.assertTrue(all(zone["areaM2"] > 0 for zone in result["zones"]))


if __name__ == "__main__":
    unittest.main()
