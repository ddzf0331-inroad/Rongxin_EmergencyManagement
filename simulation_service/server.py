from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sqlite3
import sys
import traceback
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from . import ENGINE_VERSION
from .api_config import ExternalSourceError, SOURCE_FIELDS, default_api_config, request_source, validate_api_config
from .db import connect, dumps, loads, next_incident_no, row_to_incident, row_to_run
from .models import InputError, simulate, validate_chemical
from .slab import default_binary, is_available

ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else ROOT
BUNDLE_ROOT = Path(getattr(sys, "_MEIPASS", ROOT))
DEFAULT_DB = APP_ROOT / "data" / "accident-simulation.sqlite3"
DEFAULT_STATIC = BUNDLE_ROOT / "dashboard" / "dist"
INCIDENT_STATUSES = {"pending", "non_emergency", "responding", "terminated"}
TERMINATION_REASONS = {
    "引发事故的危险源已得到有效控制、消除",
    "所有现场人员均得到妥善安置",
    "导致次生、衍生事故的危险因素得到消除",
    "应急总指挥确认为无需采取应急措施或必须终止的",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ammonia_profile() -> dict[str, Any]:
    return {
        "id": "chemical-ammonia", "name": "氨", "cas": "7664-41-7", "phase": "liquefiedGas",
        "molarMassKgMol": 0.017031, "gasDensityKgM3": 0.73, "liquidDensityKgM3": 682.0,
        "boilingPointK": 239.82, "vaporPressurePa": 101325.0,
        "vaporHeatCapacityJkgK": 2060.0, "liquidHeatCapacityJkgK": 4700.0,
        "latentHeatJkg": 1_371_000.0, "gamma": 1.31,
        "erpg1Ppm": 25.0, "erpg2Ppm": 150.0, "erpg3Ppm": 1500.0,
        "erpgUnit": "ppm", "erpgSource": "AIHA ERPG; value must be reviewed by site qualified personnel",
        "erpgVersion": "seed-2024-review-required", "propertySource": "local seed; review required",
        "propertyVersion": "seed-1", "updatedAt": utc_now(),
    }


def initialize_database(path: Path) -> None:
    database = connect(path)
    profile = ammonia_profile()
    now = utc_now()
    database.execute(
        "INSERT OR IGNORE INTO chemicals (id, cas, name, profile_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (profile["id"], profile["cas"], profile["name"], dumps(profile), now, now),
    )
    database.commit()
    database.close()


class WeatherProvider:
    """Replace this provider when the current system's weather-station contract is confirmed."""

    def current(self) -> dict[str, Any]:
        configured = os.environ.get("SIMULATION_WEATHER_JSON")
        if configured:
            value = json.loads(configured)
            value.setdefault("source", "environment-adapter")
            value.setdefault("observedAt", utc_now())
            return value
        return {
            "windSpeedMS": 3.0, "windDirectionDeg": 45.0, "temperatureK": 298.15,
            "pressurePa": 101325.0, "relativeHumidityPct": 60.0, "stabilityClass": "D",
            "surfaceRoughnessM": 0.3, "windMeasurementHeightM": 10.0,
            "observedAt": utc_now(), "source": "local-manual-default", "corrected": False,
            "units": {
                "windSpeedMS": "m/s", "windDirectionDeg": "degree-from-north",
                "temperatureK": "K", "pressurePa": "Pa", "relativeHumidityPct": "%",
                "surfaceRoughnessM": "m",
            },
        }


class SimulationHandler(SimpleHTTPRequestHandler):
    server_version = f"AccidentSimulation/{ENGINE_VERSION}"

    @property
    def database_path(self) -> Path:
        return self.server.database_path  # type: ignore[attr-defined]

    @property
    def static_path(self) -> Path:
        return self.server.static_path  # type: ignore[attr-defined]

    def log_message(self, format: str, *args: Any) -> None:
        sys.stderr.write("%s - %s\n" % (self.log_date_time_string(), format % args))

    def end_headers(self) -> None:
        origin = self.headers.get("Origin", "")
        if origin.startswith("http://127.0.0.1") or origin.startswith("http://localhost"):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def _json(self, status: int, value: Any) -> None:
        payload = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 2_000_000:
            raise InputError("Request body is empty or too large")
        try:
            value = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise InputError("Request body must be valid JSON") from error
        if not isinstance(value, dict):
            raise InputError("Request body must be a JSON object")
        return value

    def _database(self) -> sqlite3.Connection:
        return connect(self.database_path)

    def _chemical_id(self, path: str) -> str | None:
        prefix = "/api/accident-simulation/chemicals/"
        return path[len(prefix):] if path.startswith(prefix) and len(path) > len(prefix) else None

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/api/emergency-dashboard/api-config":
            self._json(200, self._stored_api_config())
            return
        external_prefix = "/api/emergency-dashboard/external/"
        if path.startswith(external_prefix):
            self._external_source(path[len(external_prefix):], parse_qs(parsed.query))
            return
        if path == "/api/emergency/incidents":
            self._list_incidents(parse_qs(parsed.query))
            return
        if path == "/api/emergency/incidents/active":
            self._single_incident("responding", newest=True)
            return
        if path == "/api/emergency/incidents/pending":
            self._single_incident("pending", newest=False)
            return
        incident_prefix = "/api/emergency/incidents/"
        if path.startswith(incident_prefix):
            database = self._database()
            row = database.execute(
                "SELECT * FROM emergency_incidents WHERE id = ?",
                (path[len(incident_prefix):],),
            ).fetchone()
            database.close()
            self._json(200, row_to_incident(row)) if row else self._json(404, {"error": "incident_not_found"})
            return
        if path == "/api/accident-simulation/health":
            self._json(200, {
                "status": "ok", "engineVersion": ENGINE_VERSION, "offline": True,
                "slabAvailable": is_available(), "slabBinary": str(default_binary()),
            })
            return
        if path == "/api/accident-simulation/weather/current":
            self._json(200, WeatherProvider().current())
            return
        if path == "/api/accident-simulation/chemicals":
            database = self._database()
            rows = database.execute("SELECT profile_json FROM chemicals ORDER BY name, cas").fetchall()
            database.close()
            self._json(200, [loads(row["profile_json"]) for row in rows])
            return
        if path == "/api/accident-simulation/runs":
            database = self._database()
            rows = database.execute("SELECT * FROM simulation_runs ORDER BY created_at DESC LIMIT 100").fetchall()
            database.close()
            self._json(200, [row_to_run(row) for row in rows])
            return
        run_prefix = "/api/accident-simulation/runs/"
        if path.startswith(run_prefix):
            database = self._database()
            row = database.execute("SELECT * FROM simulation_runs WHERE id = ?", (path[len(run_prefix):],)).fetchone()
            database.close()
            self._json(200, row_to_run(row)) if row else self._json(404, {"error": "run_not_found"})
            return
        self._static(path)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            body = self._body()
            if path == "/api/emergency-dashboard/api-config/test":
                self._test_api_config(body)
                return
            if path == "/api/emergency/incidents":
                self._create_incident(body)
                return
            incident_prefix = "/api/emergency/incidents/"
            if path.startswith(incident_prefix):
                target = path[len(incident_prefix):]
                if "/" in target:
                    incident_id, action = target.rsplit("/", 1)
                    if action in {"non-emergency", "respond", "terminate"}:
                        self._transition_incident(incident_id, action, body)
                        return
            if path == "/api/accident-simulation/chemicals":
                body["id"] = body.get("id") or f"chemical-{uuid.uuid4().hex}"
                self._save_chemical(body, create=True)
                return
            if path == "/api/accident-simulation/runs":
                self._run(body)
                return
            self._json(404, {"error": "not_found"})
        except InputError as error:
            self._json(422, {"error": "validation_error", "message": str(error), "fields": error.fields})
        except ExternalSourceError as error:
            self._json(error.status, {"error": "external_source_error", "message": str(error)})
        except sqlite3.IntegrityError as error:
            self._json(409, {"error": "conflict", "message": str(error)})

    def do_PUT(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/emergency-dashboard/api-config":
            try:
                self._save_api_config(self._body())
            except InputError as error:
                self._json(422, {"error": "validation_error", "message": str(error), "fields": error.fields})
            return
        chemical_id = self._chemical_id(path)
        if not chemical_id:
            self._json(404, {"error": "not_found"})
            return
        try:
            body = self._body()
            body["id"] = chemical_id
            self._save_chemical(body, create=False)
        except InputError as error:
            self._json(422, {"error": "validation_error", "message": str(error), "fields": error.fields})

    def do_DELETE(self) -> None:
        chemical_id = self._chemical_id(urlparse(self.path).path)
        if not chemical_id:
            self._json(404, {"error": "not_found"})
            return
        database = self._database()
        cursor = database.execute("DELETE FROM chemicals WHERE id = ?", (chemical_id,))
        database.commit()
        database.close()
        self._json(200 if cursor.rowcount else 404, {} if cursor.rowcount else {"error": "chemical_not_found"})

    def _stored_api_config(self) -> dict[str, Any]:
        database = self._database()
        row = database.execute("SELECT config_json, updated_at FROM dashboard_api_config WHERE id = 1").fetchone()
        database.close()
        if not row:
            return default_api_config()
        config = loads(row["config_json"])
        config["updatedAt"] = row["updated_at"]
        return config

    def _save_api_config(self, body: dict[str, Any]) -> None:
        config = validate_api_config(body)
        now = utc_now()
        config["updatedAt"] = now
        database = self._database()
        database.execute(
            """
            INSERT INTO dashboard_api_config (id, config_json, updated_at)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at
            """,
            (dumps(config), now),
        )
        database.commit()
        database.close()
        self._json(200, config)

    def _test_api_config(self, body: dict[str, Any]) -> None:
        source_key = str(body.get("sourceKey", ""))
        if source_key not in SOURCE_FIELDS:
            raise InputError("请选择有效的数据源", ["sourceKey"])
        candidate = body.get("config")
        if not isinstance(candidate, dict):
            raise InputError("缺少待测试配置", ["config"])
        candidate = json.loads(json.dumps(candidate))
        sources = candidate.get("sources")
        if isinstance(sources, dict) and isinstance(sources.get(source_key), dict):
            sources[source_key]["enabled"] = True
        config = validate_api_config(candidate)
        normalized, elapsed_ms, raw_payload, request_url = request_source(
            source_key, config, 1, 20, "",
        )
        normalized["fetchedAt"] = utc_now()
        warning = "" if normalized["data"]["list"] else "接口返回 0 条记录，明细字段映射尚未验证"
        raw_preview = json.dumps(raw_payload, ensure_ascii=False, separators=(",", ":"))[:4000]
        self._json(200, {
            "ok": True,
            "httpStatus": 200,
            "elapsedMs": elapsed_ms,
            "requestUrl": request_url,
            "warning": warning,
            "rawPreview": raw_preview,
            "normalized": normalized,
        })

    @staticmethod
    def _query_number(query: dict[str, list[str]], name: str, default: int, maximum: int) -> int:
        raw = (query.get(name) or [str(default)])[0]
        try:
            value = int(raw)
        except ValueError:
            raise InputError(f"{name}必须是整数", [name]) from None
        if value < 1 or value > maximum:
            raise InputError(f"{name}必须在 1 到 {maximum} 之间", [name])
        return value

    def _external_source(self, source_key: str, query: dict[str, list[str]]) -> None:
        try:
            page = self._query_number(query, "page", 1, 100_000)
            page_size = self._query_number(query, "pageSize", 20, 100)
            keyword = (query.get("keyword") or [""])[0].strip()[:100]
            config = self._stored_api_config()
            query_key = dumps({"keyword": keyword, "page": page, "pageSize": page_size})
            normalized, _, _, _ = request_source(source_key, config, page, page_size, keyword)
            fetched_at = utc_now()
            normalized["fetchedAt"] = fetched_at
            database = self._database()
            database.execute(
                """
                INSERT OR REPLACE INTO dashboard_api_cache
                  (source_key, query_key, config_updated_at, payload_json, fetched_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (source_key, query_key, config["updatedAt"], dumps(normalized), fetched_at),
            )
            database.commit()
            database.close()
            self._json(200, normalized)
        except InputError as error:
            self._json(422, {"error": "validation_error", "message": str(error), "fields": error.fields})
        except ExternalSourceError as error:
            config = self._stored_api_config()
            query_key = dumps({
                "keyword": (query.get("keyword") or [""])[0].strip()[:100],
                "page": int((query.get("page") or ["1"])[0]) if (query.get("page") or ["1"])[0].isdigit() else 1,
                "pageSize": int((query.get("pageSize") or ["20"])[0]) if (query.get("pageSize") or ["20"])[0].isdigit() else 20,
            })
            database = self._database()
            row = database.execute(
                """
                SELECT payload_json, fetched_at FROM dashboard_api_cache
                WHERE source_key = ? AND query_key = ? AND config_updated_at = ?
                """,
                (source_key, query_key, config.get("updatedAt", "")),
            ).fetchone()
            database.close()
            if row:
                cached = loads(row["payload_json"])
                cached.update({"stale": True, "fetchedAt": row["fetched_at"], "errorMessage": str(error)})
                self._json(200, cached)
            else:
                self._json(error.status, {
                    "error": "external_source_unavailable",
                    "sourceKey": source_key,
                    "message": str(error),
                })

    def _save_chemical(self, body: dict[str, Any], create: bool) -> None:
        body = validate_chemical(body)
        now = utc_now()
        body["updatedAt"] = now
        database = self._database()
        try:
            if create:
                database.execute(
                    "INSERT INTO chemicals (id, cas, name, profile_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (body["id"], body["cas"], body["name"], dumps(body), now, now),
                )
                status = 201
            else:
                cursor = database.execute(
                    "UPDATE chemicals SET cas = ?, name = ?, profile_json = ?, updated_at = ? WHERE id = ?",
                    (body["cas"], body["name"], dumps(body), now, body["id"]),
                )
                if not cursor.rowcount:
                    self._json(404, {"error": "chemical_not_found"})
                    return
                status = 200
            database.commit()
        except sqlite3.IntegrityError as error:
            raise InputError("CAS number already exists", ["cas"]) from error
        finally:
            database.close()
        self._json(status, body)

    @staticmethod
    def _incident_text(
        body: dict[str, Any],
        field: str,
        label: str,
        maximum: int,
        required: bool = True,
    ) -> str:
        value = body.get(field, "")
        if not isinstance(value, str):
            raise InputError(f"{label}格式不正确", [field])
        value = value.strip()
        if required and not value:
            raise InputError(f"请填写{label}", [field])
        if len(value) > maximum:
            raise InputError(f"{label}不能超过{maximum}个字符", [field])
        return value

    def _create_incident(self, body: dict[str, Any]) -> None:
        title = self._incident_text(body, "title", "事件名称", 100)
        incident_type = self._incident_text(body, "type", "事件类型", 40)
        location = self._incident_text(body, "location", "事件地点", 200)
        description = self._incident_text(body, "description", "事件描述", 1000)
        reporter = self._incident_text(body, "reporter", "上报人", 60)
        reporter_phone = self._incident_text(body, "reporterPhone", "联系电话", 30, required=False)
        incident_id = f"incident-{uuid.uuid4().hex}"
        now = utc_now()
        database = self._database()
        database.execute("BEGIN IMMEDIATE")
        incident_no = next_incident_no(database, now)
        database.execute(
            """
            INSERT INTO emergency_incidents (
              id, incident_no, title, type, location, description, reporter, reporter_phone,
              reported_at, status, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
            """,
            (incident_id, incident_no, title, incident_type, location, description, reporter, reporter_phone, now, now),
        )
        database.commit()
        row = database.execute("SELECT * FROM emergency_incidents WHERE id = ?", (incident_id,)).fetchone()
        database.close()
        self._json(201, row_to_incident(row))

    def _list_incidents(self, query: dict[str, list[str]]) -> None:
        clauses: list[str] = []
        values: list[str] = []
        status = (query.get("status") or [""])[0].strip()
        incident_type = (query.get("type") or [""])[0].strip()
        keyword = (query.get("keyword") or [""])[0].strip()
        if status:
            if status not in INCIDENT_STATUSES:
                self._json(422, {"error": "validation_error", "message": "事件状态不正确", "fields": ["status"]})
                return
            clauses.append("status = ?")
            values.append(status)
        if incident_type:
            clauses.append("type = ?")
            values.append(incident_type)
        if keyword:
            clauses.append(
                "(incident_no LIKE ? OR id LIKE ? OR title LIKE ? OR location LIKE ? OR description LIKE ? OR reporter LIKE ? OR reporter_phone LIKE ?)"
            )
            values.extend([f"%{keyword}%"] * 7)
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        database = self._database()
        rows = database.execute(
            f"SELECT * FROM emergency_incidents{where} ORDER BY reported_at DESC",
            values,
        ).fetchall()
        database.close()
        self._json(200, [row_to_incident(row) for row in rows])

    def _single_incident(self, status: str, newest: bool) -> None:
        order = "DESC" if newest else "ASC"
        database = self._database()
        row = database.execute(
            f"SELECT * FROM emergency_incidents WHERE status = ? ORDER BY reported_at {order} LIMIT 1",
            (status,),
        ).fetchone()
        database.close()
        self._json(200, row_to_incident(row) if row else None)

    def _transition_incident(self, incident_id: str, action: str, body: dict[str, Any]) -> None:
        normalized_reasons: list[str] = []
        note = ""
        if action == "terminate":
            reasons = body.get("reasons")
            if not isinstance(reasons, list) or not reasons:
                raise InputError("请至少选择一项终止原因", ["reasons"])
            normalized_reasons = list(dict.fromkeys(str(reason).strip() for reason in reasons))
            if any(reason not in TERMINATION_REASONS for reason in normalized_reasons):
                raise InputError("终止原因不正确", ["reasons"])
            note = self._incident_text(body, "note", "终止补充说明", 500, required=False)

        database = self._database()
        database.execute("BEGIN IMMEDIATE")
        row = database.execute(
            "SELECT * FROM emergency_incidents WHERE id = ?",
            (incident_id,),
        ).fetchone()
        if not row:
            database.rollback()
            database.close()
            self._json(404, {"error": "incident_not_found"})
            return

        now = utc_now()
        if action == "non-emergency":
            if row["status"] != "pending":
                database.rollback()
                database.close()
                self._json(409, {"error": "invalid_incident_status"})
                return
            database.execute(
                "UPDATE emergency_incidents SET status = 'non_emergency', judged_at = ?, updated_at = ? WHERE id = ?",
                (now, now, incident_id),
            )
        elif action == "respond":
            if row["status"] != "pending":
                database.rollback()
                database.close()
                self._json(409, {"error": "invalid_incident_status"})
                return
            active = database.execute(
                "SELECT id FROM emergency_incidents WHERE status = 'responding' LIMIT 1"
            ).fetchone()
            if active:
                database.rollback()
                database.close()
                self._json(409, {"error": "active_incident_exists", "incidentId": active["id"]})
                return
            database.execute(
                """
                UPDATE emergency_incidents
                SET status = 'responding', judged_at = ?, responded_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (now, now, now, incident_id),
            )
        else:
            if row["status"] != "responding":
                database.rollback()
                database.close()
                self._json(409, {"error": "invalid_incident_status"})
                return
            database.execute(
                """
                UPDATE emergency_incidents
                SET status = 'terminated', terminated_at = ?, termination_reasons_json = ?,
                    termination_note = ?, updated_at = ?
                WHERE id = ?
                """,
                (now, dumps(normalized_reasons), note, now, incident_id),
            )

        database.commit()
        updated = database.execute(
            "SELECT * FROM emergency_incidents WHERE id = ?",
            (incident_id,),
        ).fetchone()
        database.close()
        self._json(200, row_to_incident(updated))

    def _run(self, body: dict[str, Any]) -> None:
        run_id = f"run-{uuid.uuid4().hex}"
        created = utc_now()
        chemical_id = str(body.get("chemicalId", ""))
        database = self._database()
        weather = body.get("weather") or {}
        database.execute(
            "INSERT INTO simulation_runs (id, created_at, status, raw_input_json, weather_source, weather_corrected, engine_version) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (run_id, created, "running", dumps(body), weather.get("source"), int(bool(weather.get("corrected"))), ENGINE_VERSION),
        )
        database.commit()
        row = database.execute("SELECT profile_json FROM chemicals WHERE id = ?", (chemical_id,)).fetchone()
        if not row:
            error_value = {"type": "InputError", "message": "Chemical profile does not exist", "fields": ["chemicalId"]}
            database.execute("UPDATE simulation_runs SET status = ?, error_json = ? WHERE id = ?", ("failed", dumps(error_value), run_id))
            database.commit()
            database.close()
            self._json(422, {"id": run_id, "status": "failed", "error": error_value})
            return
        chemical = loads(row["profile_json"])
        database.execute("UPDATE simulation_runs SET chemical_version = ? WHERE id = ?", (chemical.get("propertyVersion"), run_id))
        database.commit()
        try:
            normalized, result = simulate(body, chemical)
            result.update({"id": run_id, "createdAt": created, "status": "completed", "chemical": {"id": chemical["id"], "name": chemical["name"], "cas": chemical["cas"]}})
            database.execute(
                "UPDATE simulation_runs SET status = ?, normalized_input_json = ?, route_json = ?, result_json = ? WHERE id = ?",
                ("completed", dumps(normalized), dumps(result["modelRoute"]), dumps(result), run_id),
            )
            database.commit()
            self._json(200, result)
        except Exception as error:
            error_value = {
                "type": type(error).__name__, "message": str(error),
                "fields": error.fields if isinstance(error, InputError) else [],
            }
            database.execute(
                "UPDATE simulation_runs SET status = ?, error_json = ? WHERE id = ?",
                ("failed", dumps(error_value), run_id),
            )
            database.commit()
            status = 422 if isinstance(error, InputError) else 503
            self._json(status, {"id": run_id, "status": "failed", "error": error_value})
        finally:
            database.close()

    def _static(self, path: str) -> None:
        if not self.static_path.is_dir():
            self._json(404, {"error": "frontend_not_built", "message": "Run npm build before using the integrated server"})
            return
        relative = path.lstrip("/") or "index.html"
        target = (self.static_path / relative).resolve()
        if self.static_path.resolve() not in target.parents and target != self.static_path.resolve():
            self._json(403, {"error": "forbidden"})
            return
        if not target.is_file():
            target = self.static_path / "index.html"
        payload = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(target.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def make_server(host: str, port: int, database: Path, static: Path) -> ThreadingHTTPServer:
    initialize_database(database)
    server = ThreadingHTTPServer((host, port), SimulationHandler)
    server.database_path = database  # type: ignore[attr-defined]
    server.static_path = static  # type: ignore[attr-defined]
    return server


def main() -> None:
    parser = argparse.ArgumentParser(description="Offline accident consequence simulation service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--database", type=Path, default=DEFAULT_DB)
    parser.add_argument("--static", type=Path, default=DEFAULT_STATIC)
    args = parser.parse_args()
    # Allow 0.0.0.0 when DEPLOY_BIND_ALL is set (for containerized deployments)
    allow_all = os.environ.get("DEPLOY_BIND_ALL", "").lower() in {"1", "true", "yes"}
    allowed_hosts = {"127.0.0.1", "localhost", "::1", "0.0.0.0"} if allow_all else {"127.0.0.1", "localhost", "::1"}
    if args.host not in allowed_hosts:
        parser.error("production service may only bind to loopback (set DEPLOY_BIND_ALL=1 to allow 0.0.0.0)")
    server = make_server(args.host, args.port, args.database, args.static)
    print(f"Accident simulation service {ENGINE_VERSION}: http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
