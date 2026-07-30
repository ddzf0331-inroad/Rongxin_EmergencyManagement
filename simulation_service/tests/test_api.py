import json
import sqlite3
import tempfile
import threading
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from simulation_service.api_config import default_api_config
from simulation_service.db import connect, next_incident_no
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

    def delete_json(self, path):
        request = urllib.request.Request(self.base + path, method="DELETE")
        with urllib.request.urlopen(request) as response:
            return response.status, json.load(response)

    def test_health_and_seed_chemical(self):
        status, health = self.get_json("/api/accident-simulation/health")
        self.assertEqual(status, 200)
        self.assertTrue(health["offline"])
        _, chemicals = self.get_json("/api/accident-simulation/chemicals")
        self.assertEqual(chemicals[0]["cas"], "7664-41-7")

    def test_minimal_builtin_chemical_can_be_saved_without_sources_or_properties(self):
        status, chemical = self.post_json("/api/accident-simulation/chemicals", {
            "id": "chemical-sulfur-dioxide",
            "name": "二氧化硫",
            "cas": "7446-09-5",
            "phase": "gas",
            "molarMassKgMol": 0.064063,
            "erpg1Ppm": 0.3,
            "erpg2Ppm": 3.0,
            "erpg3Ppm": 15.0,
        })
        self.assertEqual(status, 201)
        self.assertEqual(chemical["erpgUnit"], "ppm")
        self.assertEqual(chemical["propertySource"], "")
        self.assertNotIn("liquidDensityKgM3", chemical)

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
        self.assertEqual(result["engineVersion"], "1.1.0")
        self.assertEqual(result["propertyMode"], "builtin")
        _, stored = self.get_json(f"/api/accident-simulation/runs/{result['id']}")
        self.assertTrue(stored["weatherCorrected"])
        self.assertEqual(stored["result"]["zones"], result["zones"])
        self.assertEqual(stored["normalizedInput"]["chemical"]["vaporPressurePa"], 994427.0)

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
        self.assertRegex(incident["incidentNo"], r"^SJ-\d{8}-\d{4}$")

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
        _, records = self.get_json(f"/api/emergency/incidents?keyword={incident['incidentNo']}")
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

    def test_gds_alarm_time_is_persisted_for_response_display(self):
        occurred_at = "2025-10-20T14:07:32+08:00"
        status, incident = self.post_json("/api/emergency/incidents", {
            "title": "气化装置区氨气浓度超限",
            "type": "GDS报警",
            "location": "气化装置区",
            "description": "气化装置区异常报警，报警值36.8 ppm",
            "reporter": "GDS系统",
            "reporterPhone": "",
            "occurredAt": occurred_at,
        })
        self.assertEqual(status, 201)
        self.assertEqual(incident["reportedAt"], occurred_at)
        self.assertEqual(incident["type"], "GDS报警")

    def test_legacy_incidents_receive_ordered_human_readable_numbers(self):
        path = Path(self.temp.name) / "legacy-incidents.sqlite3"
        database = sqlite3.connect(path)
        database.executescript(
            """
            CREATE TABLE emergency_incidents (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              type TEXT NOT NULL,
              location TEXT NOT NULL,
              description TEXT NOT NULL,
              reporter TEXT NOT NULL,
              reporter_phone TEXT NOT NULL DEFAULT '',
              reported_at TEXT NOT NULL,
              status TEXT NOT NULL,
              judged_at TEXT,
              responded_at TEXT,
              terminated_at TEXT,
              termination_reasons_json TEXT,
              termination_note TEXT NOT NULL DEFAULT '',
              updated_at TEXT NOT NULL
            );
            INSERT INTO emergency_incidents (
              id, title, type, location, description, reporter, reported_at, status, updated_at
            ) VALUES
              ('legacy-1', '较早事件', '泄漏', '一号区域', '描述', '张三', '2026-07-28T01:00:00+00:00', 'terminated', '2026-07-28T01:00:00+00:00'),
              ('legacy-2', '较晚事件', '泄漏', '二号区域', '描述', '李四', '2026-07-28T02:00:00+00:00', 'terminated', '2026-07-28T02:00:00+00:00'),
              ('legacy-3', '次日事件', '泄漏', '三号区域', '描述', '王五', '2026-07-28T16:30:00+00:00', 'terminated', '2026-07-28T16:30:00+00:00');
            """
        )
        database.close()

        migrated = connect(path)
        columns = {row["name"] for row in migrated.execute("PRAGMA table_info(emergency_incidents)")}
        self.assertIn("deleted_at", columns)
        rows = migrated.execute(
            "SELECT incident_no FROM emergency_incidents ORDER BY reported_at"
        ).fetchall()
        self.assertEqual([row["incident_no"] for row in rows], [
            "SJ-20260728-0001",
            "SJ-20260728-0002",
            "SJ-20260729-0001",
        ])
        self.assertEqual(next_incident_no(migrated, "2026-07-28T03:00:00+00:00"), "SJ-20260728-0003")
        migrated.close()

    def test_incident_soft_delete_and_restore(self):
        _, incident = self.post_json("/api/emergency/incidents", {
            "title": "待删除测试事件",
            "type": "其他",
            "location": "测试区域",
            "description": "用于验证软删除和恢复。",
            "reporter": "测试员",
            "reporterPhone": "",
        })

        status, deleted = self.delete_json(f"/api/emergency/incidents/{incident['id']}")
        self.assertEqual(status, 200)
        self.assertIsNotNone(deleted["deletedAt"])

        _, active_records = self.get_json(f"/api/emergency/incidents?keyword={incident['incidentNo']}")
        self.assertEqual(active_records, [])
        _, pending = self.get_json("/api/emergency/incidents/pending")
        self.assertNotEqual(pending["id"] if pending else None, incident["id"])
        _, recycled_records = self.get_json(
            f"/api/emergency/incidents?deleted=only&keyword={incident['incidentNo']}"
        )
        self.assertEqual([record["id"] for record in recycled_records], [incident["id"]])

        _, restored = self.post_json(f"/api/emergency/incidents/{incident['id']}/restore", {})
        self.assertIsNone(restored["deletedAt"])
        _, active_records = self.get_json(f"/api/emergency/incidents?keyword={incident['incidentNo']}")
        self.assertEqual([record["id"] for record in active_records], [incident["id"]])

    def test_api_config_proxy_and_last_successful_cache(self):
        config = default_api_config()
        config["baseUrl"] = self.external_base
        config["sources"]["materials"]["enabled"] = True
        config["sources"]["chemicals"]["itemPaths"]["cas"] = "profile.casCode"
        config["sources"]["dashboardPlans"]["itemPaths"]["attachments"] = "payload.files"
        status, saved = self.put_json("/api/emergency-dashboard/api-config", config)
        self.assertEqual(status, 200)
        self.assertTrue(saved["updatedAt"])
        self.assertEqual(saved["sources"]["chemicals"]["itemPaths"]["cas"], "profile.casCode")
        self.assertEqual(
            saved["sources"]["dashboardPlans"]["itemPaths"]["attachments"],
            "payload.files",
        )
        _, loaded = self.get_json("/api/emergency-dashboard/api-config")
        self.assertEqual(loaded["sources"]["chemicals"]["itemPaths"]["cas"], "profile.casCode")
        self.assertEqual(
            loaded["sources"]["dashboardPlans"]["itemPaths"]["attachments"],
            "payload.files",
        )

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
