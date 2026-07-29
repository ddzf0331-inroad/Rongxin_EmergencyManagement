import unittest
from unittest.mock import patch
from urllib.error import URLError

from simulation_service.api_config import (
    ExternalSourceError,
    SOURCE_FIELDS,
    build_detail_url,
    build_request_url,
    default_api_config,
    fetch_external_json,
    normalize_payload,
    resolve_path,
    validate_api_config,
)
from simulation_service.models import InputError


class ApiConfigUnitTests(unittest.TestCase):
    def test_point_paths_only_support_properties_and_array_indexes(self):
        value = {"data": {"list": [{"name": "防化服"}]}}
        self.assertEqual(resolve_path(value, "data.list[0].name"), "防化服")
        with self.assertRaises(ExternalSourceError):
            resolve_path(value, "$.data.list")

    def test_config_rejects_absolute_source_path_and_invalid_base_url(self):
        config = default_api_config()
        config["baseUrl"] = "file:///tmp/data"
        with self.assertRaises(InputError):
            validate_api_config(config)
        config["baseUrl"] = "https://example.com"
        config["sources"]["materials"]["enabled"] = True
        config["sources"]["materials"]["apiPath"] = "https://other.example/api"
        with self.assertRaises(InputError):
            validate_api_config(config)

    def test_config_save_preserves_every_frontend_item_mapping(self):
        config = default_api_config()
        config["baseUrl"] = "https://example.com"
        for source_key, fields in SOURCE_FIELDS.items():
            for field in fields:
                config["sources"][source_key]["itemPaths"][field] = f"payload.{field}"

        saved = validate_api_config(config)

        for source_key, fields in SOURCE_FIELDS.items():
            self.assertEqual(
                saved["sources"][source_key]["itemPaths"],
                {field: f"payload.{field}" for field in fields},
            )
        self.assertEqual(saved["sources"]["chemicals"]["itemPaths"]["cas"], "payload.cas")
        self.assertEqual(
            saved["sources"]["dashboardPlans"]["itemPaths"]["attachments"],
            "payload.attachments",
        )

    def test_request_and_detail_urls_preserve_expected_parameters(self):
        config = default_api_config()
        source = config["sources"]["materials"]
        request_url = build_request_url("https://example.com", source, 2, 10, "呼吸器")
        self.assertIn("type=material", request_url)
        self.assertIn("page=2", request_url)
        self.assertIn("pageSize=10", request_url)
        detail_url = build_detail_url(
            "https://example.com", "/resources?type=material", "", "id", "m-1",
        )
        self.assertEqual(detail_url, "https://example.com/resources?type=material&id=m-1")
        self.assertEqual(
            build_detail_url("https://example.com", "https://evil.example/item", "", "id", "m-1"),
            "",
        )

    def test_material_normalization_filters_normal_items(self):
        config = default_api_config()
        source = config["sources"]["materials"]
        payload = {
            "code": 0,
            "message": "success",
            "data": {
                "list": [
                    {
                        "id": "m-1", "name": "防化服", "location": "一号库",
                        "expireAt": "2026-08-01", "owner": "张伟", "expiryStatus": "expiring",
                    },
                    {
                        "id": "m-2", "name": "对讲机", "location": "二号库",
                        "expireAt": "2028-01-01", "owner": "李明", "expiryStatus": "normal",
                    },
                ],
                "total": 2, "page": 1, "pageSize": 20,
            },
            "pageUrl": "/resources",
            "timestamp": "2026-07-28T10:00:00Z",
        }
        normalized = normalize_payload("materials", "https://example.com", source, payload)
        self.assertEqual([row["id"] for row in normalized["data"]["list"]], ["m-1"])
        self.assertEqual(normalized["data"]["list"][0]["expiryStatus"], "expiring")
        self.assertEqual(normalized["data"]["list"][0]["detailUrl"], "https://example.com/resources?id=m-1")

    def test_all_seven_sources_normalize_to_canonical_fields(self):
        config = default_api_config()
        for source_key, fields in SOURCE_FIELDS.items():
            source = config["sources"][source_key]
            source["pagePath"] = f"/{source_key}"
            raw_item = {field: f"{field}-value" for field in fields}
            if source_key == "materials":
                raw_item["expiryStatus"] = "expired"
            payload = {
                "code": 0,
                "message": "success",
                "data": {"list": [raw_item], "total": 1, "page": 1, "pageSize": 20},
                "pageUrl": f"/{source_key}",
                "timestamp": "2026-07-28T10:00:00Z",
            }
            normalized = normalize_payload(source_key, "https://example.com", source, payload)
            self.assertEqual(set(fields).issubset(normalized["data"]["list"][0]), True)
            self.assertTrue(normalized["data"]["list"][0]["detailUrl"].startswith("https://example.com/"))

    def test_connection_timeout_becomes_clear_external_source_error(self):
        with patch("simulation_service.api_config.urlopen", side_effect=URLError("timed out")):
            with self.assertRaisesRegex(ExternalSourceError, "连接失败"):
                fetch_external_json("https://example.com/api")


if __name__ == "__main__":
    unittest.main()
