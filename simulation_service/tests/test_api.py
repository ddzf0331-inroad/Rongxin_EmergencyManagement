import json
import tempfile
import threading
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from simulation_service.api_config import default_api_config
from simulation_service.server import make_server


class MockExternalHandler(BaseHTTPRequestHandler):
    available = True

    def log_message(self, format, *args):
        pass

    def do_GET(self):
        if not type(self).available:
            self.send_error(503)
            return
        payload = {
            "code": 0,
            "message": "success",
            "data": {
                "list": [{
                    "id": "m-test", "name": "测试防化服", "location": "测试库",
                    "expireAt": "2026-08-01", "owner": "测试员", "expiryStatus": "expiring",
                }],
                "total": 1,
                "page": 1,
                "pageSize": 20,
            },
            "pageUrl": "/resources",
            "timestamp": "2026-07-28T10:00:00Z",
        }
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.external = ThreadingHTTPServer(("127.0.0.1", 0), MockExternalHandler)
        cls.external_thread = threading.Thread(target=cls.external.serve_forever, daemon=True)
        cls.external_thread.start()
        cls.external_base = f"http://127.0.0.1:{cls.external.server_port}"
        cls.server = make_server("127.0.0.1", 0, Path(cls.temp.name) / "test.sqlite3", Path(cls.temp.name) / "static")
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)
        cls.external.shutdown()
        cls.external.server_close()
        cls.external_thread.join(timeout=2)
        cls.temp.cleanup()

    def get_json(self, path):
        with urllib.request.urlopen(self.base + path) as response:
            return response.status, json.load(response)

    def post_json(self, path, value):
        request = urllib.request.Request(
            self.base + path, data=json.dumps(value).encode("utf-8"),
            headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(request) as response:
            return response.status, json.load(response)

    def put_json(self, path, value):
        request = urllib.request.Request(
            self.base + path, data=json.dumps(value).encode("utf-8"),
            headers={"Content-Type": "application/json"}, method="PUT",
        )
        with urllib.request.urlopen(request) as response:
            return response.status, json.load(response)

    def test_health_and_seed_chemical(self):
        status, health = self.get_json("/api/accident-simulation/health")
        self.assertEqual(status, 200)
        self.assertTrue(health["offline"])
        _, chemicals = self.get_json("/api/accident-simulation/chemicals")
        self.assertEqual(chemicals[0]["cas"], "7664-41-7")

    def test_run_is_persisted_and_queryable(self):
        body = {
            "chemicalId": "chemical-ammonia",
            "scenario": {
                "releaseType": "pressurizedGas", "inventoryKg": 100.0, "isolationTimeS": 300.0,
                "releaseTemperatureK": 298.15, "releaseHeightM": 1.0, "holeDiameterM": 0.01,
                "vesselPressurePa": 800000.0, "sourceCoordinate": {"eastM": 0.0, "northM": 0.0},
            },
            "weather": {
                "windSpeedMS": 3.0, "windDirectionDeg": 45.0, "temperatureK": 298.15,
                "pressurePa": 101325.0, "relativeHumidityPct": 50.0, "stabilityClass": "D",
                "surfaceRoughnessM": 0.3, "source": "test", "corrected": True,
            },
        }
        status, result = self.post_json("/api/accident-simulation/runs", body)
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], "completed")
        _, stored = self.get_json(f"/api/accident-simulation/runs/{result['id']}")
        self.assertTrue(stored["weatherCorrected"])
        self.assertEqual(stored["result"]["zones"], result["zones"])

    def test_emergency_incident_lifecycle_is_persisted(self):
        status, incident = self.post_json("/api/emergency/incidents", {
            "title": "23号储罐泄漏",
            "type": "泄漏",
            "location": "化一区储罐区23号",
            "description": "现场发现液体泄漏，人员正在疏散。",
            "reporter": "张伟",
            "reporterPhone": "13800000000",
        })
        self.assertEqual(status, 201)
        self.assertEqual(incident["status"], "pending")

        _, pending = self.get_json("/api/emergency/incidents/pending")
        self.assertEqual(pending["id"], incident["id"])

        _, responding = self.post_json(f"/api/emergency/incidents/{incident['id']}/respond", {})
        self.assertEqual(responding["status"], "responding")
        _, active = self.get_json("/api/emergency/incidents/active")
        self.assertEqual(active["id"], incident["id"])

        reason = "引发事故的危险源已得到有效控制、消除"
        _, terminated = self.post_json(f"/api/emergency/incidents/{incident['id']}/terminate", {
            "reasons": [reason],
            "note": "现场检测值已恢复正常。",
        })
        self.assertEqual(terminated["status"], "terminated")
        self.assertEqual(terminated["terminationReasons"], [reason])

        _, records = self.get_json("/api/emergency/incidents?status=terminated&keyword=23")
        self.assertEqual([item["id"] for item in records], [incident["id"]])

    def test_pending_incident_can_be_classified_as_non_emergency(self):
        _, incident = self.post_json("/api/emergency/incidents", {
            "title": "巡检误报",
            "type": "设备故障",
            "location": "动力站",
            "description": "传感器离线，经现场确认无异常。",
            "reporter": "李明",
            "reporterPhone": "",
        })
        _, judged = self.post_json(f"/api/emergency/incidents/{incident['id']}/non-emergency", {})
        self.assertEqual(judged["status"], "non_emergency")
        self.assertIsNotNone(judged["judgedAt"])

    def test_api_config_proxy_and_last_successful_cache(self):
        config = default_api_config()
        config["baseUrl"] = self.external_base
        config["sources"]["materials"]["enabled"] = True
        status, saved = self.put_json("/api/emergency-dashboard/api-config", config)
        self.assertEqual(status, 200)
        self.assertTrue(saved["updatedAt"])

        status, preview = self.post_json("/api/emergency-dashboard/api-config/test", {
            "sourceKey": "materials",
            "config": saved,
        })
        self.assertEqual(status, 200)
        self.assertEqual(preview["normalized"]["data"]["list"][0]["id"], "m-test")

        _, fresh = self.get_json("/api/emergency-dashboard/external/materials?page=1&pageSize=20")
        self.assertFalse(fresh["stale"])
        self.assertEqual(fresh["data"]["list"][0]["detailUrl"], f"{self.external_base}/resources?id=m-test")

        MockExternalHandler.available = False
        try:
            _, cached = self.get_json("/api/emergency-dashboard/external/materials?page=1&pageSize=20")
        finally:
            MockExternalHandler.available = True
        self.assertTrue(cached["stale"])
        self.assertEqual(cached["data"]["list"][0]["id"], "m-test")


if __name__ == "__main__":
    unittest.main()
