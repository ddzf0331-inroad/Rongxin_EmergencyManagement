from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS chemicals (
          id TEXT PRIMARY KEY,
          cas TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          profile_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS simulation_runs (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          status TEXT NOT NULL,
          raw_input_json TEXT NOT NULL,
          normalized_input_json TEXT,
          chemical_version TEXT,
          weather_source TEXT,
          weather_corrected INTEGER NOT NULL DEFAULT 0,
          route_json TEXT,
          engine_version TEXT NOT NULL,
          result_json TEXT,
          error_json TEXT
        );
        CREATE TABLE IF NOT EXISTS emergency_incidents (
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
        CREATE INDEX IF NOT EXISTS idx_emergency_incidents_status_reported
          ON emergency_incidents (status, reported_at DESC);
        CREATE TABLE IF NOT EXISTS dashboard_api_config (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          config_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS dashboard_api_cache (
          source_key TEXT NOT NULL,
          query_key TEXT NOT NULL,
          config_updated_at TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          fetched_at TEXT NOT NULL,
          PRIMARY KEY (source_key, query_key, config_updated_at)
        );
        """
    )
    return connection


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def loads(value: str | None) -> Any:
    return json.loads(value) if value else None


def row_to_run(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "createdAt": row["created_at"],
        "status": row["status"],
        "rawInput": loads(row["raw_input_json"]),
        "normalizedInput": loads(row["normalized_input_json"]),
        "chemicalVersion": row["chemical_version"],
        "weatherSource": row["weather_source"],
        "weatherCorrected": bool(row["weather_corrected"]),
        "modelRoute": loads(row["route_json"]),
        "engineVersion": row["engine_version"],
        "result": loads(row["result_json"]),
        "error": loads(row["error_json"]),
    }


def row_to_incident(row: sqlite3.Row) -> dict[str, Any]:
    location = row["location"]
    reported_at = row["reported_at"]
    return {
        "id": row["id"],
        "title": row["title"],
        "type": row["type"],
        "level": "high",
        "status": row["status"],
        "location": location,
        "address": location,
        "description": row["description"],
        "reporter": row["reporter"],
        "reporterPhone": row["reporter_phone"],
        "reportedAt": reported_at,
        "judgedAt": row["judged_at"],
        "respondedAt": row["responded_at"],
        "terminatedAt": row["terminated_at"],
        "terminationReasons": loads(row["termination_reasons_json"]) or [],
        "terminationNote": row["termination_note"],
        "startedAt": row["responded_at"] or reported_at,
        "substance": "",
        "affectedArea": location,
        "updatedAt": row["updated_at"],
    }
