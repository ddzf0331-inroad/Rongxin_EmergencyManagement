from __future__ import annotations

import json
import re
import time
from copy import deepcopy
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen

from .models import InputError

SOURCE_FIELDS: dict[str, tuple[str, ...]] = {
    "materials": ("id", "name", "location", "expireAt", "owner", "expiryStatus"),
    "drills": ("id", "time", "department", "unit", "planName", "status"),
    "hazards": ("id", "level", "name", "area", "owner", "medium", "status"),
    "dashboardPlans": ("id", "name", "type", "version", "owner", "status"),
    "chemicals": ("id", "name", "alias", "hazardClass", "danger", "emergencyMeasure", "detail"),
    "cases": ("id", "title", "accidentType", "level", "occurredAt", "summary"),
    "responsePlans": ("id", "name", "category", "level", "owner", "status"),
}

SOURCE_LABELS = {
    "materials": "应急物资",
    "drills": "应急演练",
    "hazards": "重大危险源",
    "dashboardPlans": "应急预案清单",
    "chemicals": "化学品特性",
    "cases": "典型案例",
    "responsePlans": "应急响应预案",
}

DEFAULT_ITEM_PATHS = {
    "materials": {
        "id": "id", "name": "name", "location": "location", "expireAt": "expireAt",
        "owner": "owner", "expiryStatus": "expiryStatus",
    },
    "drills": {
        "id": "id", "time": "time", "department": "department", "unit": "unit",
        "planName": "planName", "status": "status",
    },
    "hazards": {
        "id": "id", "level": "level", "name": "name", "area": "area",
        "owner": "owner", "medium": "medium", "status": "status",
    },
    "dashboardPlans": {
        "id": "id", "name": "name", "type": "type", "version": "version",
        "owner": "owner", "status": "status",
    },
    "chemicals": {
        "id": "id", "name": "name", "alias": "alias", "hazardClass": "hazardClass",
        "danger": "danger", "emergencyMeasure": "emergencyMeasure", "detail": "detail",
    },
    "cases": {
        "id": "id", "title": "title", "accidentType": "accidentType", "level": "level",
        "occurredAt": "occurredAt", "summary": "summary",
    },
    "responsePlans": {
        "id": "id", "name": "name", "category": "category", "level": "level",
        "owner": "owner", "status": "status",
    },
}

DEFAULT_RESPONSE_PATHS = {
    "code": "code",
    "message": "message",
    "list": "data.list",
    "total": "data.total",
    "page": "data.page",
    "pageSize": "data.pageSize",
    "pageUrl": "pageUrl",
    "timestamp": "timestamp",
}


class ExternalSourceError(RuntimeError):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def default_api_config() -> dict[str, Any]:
    sources: dict[str, Any] = {}
    for key in SOURCE_FIELDS:
        sources[key] = {
            "enabled": False,
            "apiPath": "/api/open/resources" if key == "materials" else "",
            "pagePath": "/resources" if key == "materials" else "",
            "defaultParams": {"type": "material"} if key == "materials" else {},
            "queryParams": {"page": "page", "pageSize": "pageSize", "keyword": "keyword"},
            "responsePaths": deepcopy(DEFAULT_RESPONSE_PATHS),
            "itemPaths": deepcopy(DEFAULT_ITEM_PATHS[key]),
            "successValue": 0,
            "detailIdParam": "id",
            **(
                {"statusValues": {"expiring": "expiring", "expired": "expired"}}
                if key == "materials"
                else {}
            ),
        }
    return {"baseUrl": "", "sources": sources, "updatedAt": ""}


_PATH_TOKEN = re.compile(r"(?:^|\.)([^.\[\]]+)|\[(\d+)\]")
_PARAM_NAME = re.compile(r"^[A-Za-z0-9_.-]+$")


def _path_tokens(path: str) -> list[str | int]:
    if not path:
        return []
    tokens: list[str | int] = []
    position = 0
    for match in _PATH_TOKEN.finditer(path):
        if match.start() != position:
            raise ValueError(path)
        tokens.append(int(match.group(2)) if match.group(2) is not None else match.group(1))
        position = match.end()
    if position != len(path) or not tokens:
        raise ValueError(path)
    return tokens


def resolve_path(value: Any, path: str, *, optional: bool = False) -> Any:
    if not path:
        return None
    try:
        current = value
        for token in _path_tokens(path):
            current = current[token] if isinstance(token, int) else current[token]
        return current
    except (KeyError, IndexError, TypeError, ValueError):
        if optional:
            return None
        raise ExternalSourceError(f"字段路径无法解析：{path}") from None


def _text(value: Any, field: str, *, required: bool = True) -> str:
    if not isinstance(value, str):
        raise InputError(f"{field}格式不正确", [field])
    result = value.strip()
    if required and not result:
        raise InputError(f"请填写{field}", [field])
    return result


def _relative_path(value: Any, field: str, *, required: bool) -> str:
    path = _text(value, field, required=required)
    if not path:
        return ""
    parsed = urlsplit(path)
    if parsed.scheme or parsed.netloc or not path.startswith("/"):
        raise InputError(f"{field}必须是以 / 开头的相对路径", [field])
    return path


def _validate_mapping_path(value: Any, field: str, *, required: bool) -> str:
    path = _text(value, field, required=required)
    if path:
        try:
            _path_tokens(path)
        except ValueError:
            raise InputError(f"{field}不是有效的点路径", [field]) from None
    return path


def validate_api_config(value: Any, *, require_base_url: bool = True) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise InputError("API 配置必须是 JSON 对象", ["config"])
    result = default_api_config()
    base_url = _text(value.get("baseUrl", ""), "Base URL", required=require_base_url).rstrip("/")
    if base_url:
        parsed = urlsplit(base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.query or parsed.fragment:
            raise InputError("Base URL 必须是有效的 http/https 地址", ["baseUrl"])
    result["baseUrl"] = base_url
    supplied_sources = value.get("sources")
    if not isinstance(supplied_sources, dict):
        raise InputError("数据源配置不完整", ["sources"])

    for source_key, fields in SOURCE_FIELDS.items():
        source_value = supplied_sources.get(source_key)
        if not isinstance(source_value, dict):
            raise InputError(f"缺少{SOURCE_LABELS[source_key]}配置", [f"sources.{source_key}"])
        source = result["sources"][source_key]
        source["enabled"] = bool(source_value.get("enabled"))
        source["apiPath"] = _relative_path(
            source_value.get("apiPath", ""), f"{SOURCE_LABELS[source_key]} API 路径",
            required=source["enabled"],
        )
        source["pagePath"] = _relative_path(
            source_value.get("pagePath", ""), f"{SOURCE_LABELS[source_key]}跳转路径",
            required=False,
        )
        default_params = source_value.get("defaultParams", {})
        if not isinstance(default_params, dict) or any(
            not isinstance(key, str) or not _PARAM_NAME.fullmatch(key) or not isinstance(item, (str, int, float, bool))
            for key, item in default_params.items()
        ):
            raise InputError(f"{SOURCE_LABELS[source_key]}默认参数格式不正确", [f"sources.{source_key}.defaultParams"])
        source["defaultParams"] = default_params

        query_params = source_value.get("queryParams", {})
        if not isinstance(query_params, dict):
            raise InputError(f"{SOURCE_LABELS[source_key]}分页参数格式不正确", [f"sources.{source_key}.queryParams"])
        for name in ("page", "pageSize", "keyword"):
            parameter = _text(query_params.get(name, ""), f"{SOURCE_LABELS[source_key]} {name} 参数", required=name != "keyword")
            if parameter and not _PARAM_NAME.fullmatch(parameter):
                raise InputError(f"{name} 参数名格式不正确", [f"sources.{source_key}.queryParams.{name}"])
            source["queryParams"][name] = parameter

        response_paths = source_value.get("responsePaths", {})
        item_paths = source_value.get("itemPaths", {})
        if not isinstance(response_paths, dict) or not isinstance(item_paths, dict):
            raise InputError(f"{SOURCE_LABELS[source_key]}字段映射不完整", [f"sources.{source_key}"])
        for name in DEFAULT_RESPONSE_PATHS:
            source["responsePaths"][name] = _validate_mapping_path(
                response_paths.get(name, ""),
                f"{SOURCE_LABELS[source_key]}响应字段 {name}",
                required=name == "list",
            )
        for name in fields:
            source["itemPaths"][name] = _validate_mapping_path(
                item_paths.get(name, ""),
                f"{SOURCE_LABELS[source_key]}明细字段 {name}",
                required=True,
            )

        success_value = source_value.get("successValue", 0)
        if not isinstance(success_value, (str, int, float, bool)):
            raise InputError("成功码必须是字符串或数字", [f"sources.{source_key}.successValue"])
        source["successValue"] = success_value
        detail_parameter = _text(
            source_value.get("detailIdParam", "id"),
            f"{SOURCE_LABELS[source_key]}详情 ID 参数",
        )
        if not _PARAM_NAME.fullmatch(detail_parameter):
            raise InputError("详情 ID 参数名格式不正确", [f"sources.{source_key}.detailIdParam"])
        source["detailIdParam"] = detail_parameter
        if source_key == "materials":
            status_values = source_value.get("statusValues", {})
            if not isinstance(status_values, dict):
                raise InputError("物资有效期状态值格式不正确", ["sources.materials.statusValues"])
            source["statusValues"] = {
                "expiring": _text(status_values.get("expiring", ""), "临期状态值"),
                "expired": _text(status_values.get("expired", ""), "过期状态值"),
            }
    return result


def build_request_url(base_url: str, source: dict[str, Any], page: int, page_size: int, keyword: str) -> str:
    params = {key: str(value) for key, value in source["defaultParams"].items()}
    params[source["queryParams"]["page"]] = str(page)
    params[source["queryParams"]["pageSize"]] = str(page_size)
    keyword_name = source["queryParams"].get("keyword")
    if keyword and keyword_name:
        params[keyword_name] = keyword
    endpoint = urljoin(f"{base_url}/", source["apiPath"].lstrip("/"))
    separator = "&" if "?" in endpoint else "?"
    return f"{endpoint}{separator}{urlencode(params)}"


def build_detail_url(base_url: str, page_url: Any, fallback: str, parameter: str, record_id: Any) -> str:
    candidate = str(page_url or fallback or "").strip()
    if not candidate or record_id in (None, ""):
        return ""
    target = urljoin(f"{base_url}/", candidate.lstrip("/")) if not urlsplit(candidate).scheme else candidate
    base_parts = urlsplit(base_url)
    parts = urlsplit(target)
    if (parts.scheme, parts.netloc) != (base_parts.scheme, base_parts.netloc):
        return ""
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query[parameter] = str(record_id)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def normalize_payload(source_key: str, base_url: str, source: dict[str, Any], payload: Any) -> dict[str, Any]:
    paths = source["responsePaths"]
    if paths.get("code"):
        actual_code = resolve_path(payload, paths["code"])
        if str(actual_code) != str(source["successValue"]):
            message = resolve_path(payload, paths.get("message", ""), optional=True)
            raise ExternalSourceError(str(message or f"第三方返回失败码：{actual_code}"))
    raw_list = resolve_path(payload, paths["list"])
    if not isinstance(raw_list, list):
        raise ExternalSourceError(f"列表字段不是数组：{paths['list']}")
    page_url = resolve_path(payload, paths.get("pageUrl", ""), optional=True)
    rows: list[dict[str, Any]] = []
    for index, raw_item in enumerate(raw_list):
        if not isinstance(raw_item, dict):
            raise ExternalSourceError(f"第 {index + 1} 条记录不是对象")
        row: dict[str, Any] = {}
        for field, path in source["itemPaths"].items():
            try:
                row[field] = resolve_path(raw_item, path)
            except ExternalSourceError as error:
                raise ExternalSourceError(f"第 {index + 1} 条记录的 {field} 映射失败：{error}") from None
        row["detailUrl"] = build_detail_url(
            base_url, page_url, source["pagePath"], source["detailIdParam"], row["id"],
        )
        if source_key == "materials":
            raw_status = str(row["expiryStatus"])
            values = source["statusValues"]
            row["expiryStatus"] = (
                "expired" if raw_status == values["expired"]
                else "expiring" if raw_status == values["expiring"]
                else "normal"
            )
            if row["expiryStatus"] == "normal":
                continue
        rows.append(row)

    def optional_number(name: str, default: int) -> int:
        value = resolve_path(payload, paths.get(name, ""), optional=True)
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    return {
        "sourceKey": source_key,
        "data": {
            "list": rows,
            "total": optional_number("total", len(rows)),
            "page": optional_number("page", 1),
            "pageSize": optional_number("pageSize", len(rows) or 20),
        },
        "sourceTimestamp": resolve_path(payload, paths.get("timestamp", ""), optional=True),
        "stale": False,
        "fetchedAt": "",
    }


def fetch_external_json(url: str, timeout: float = 10.0) -> tuple[int, Any, int]:
    started = time.monotonic()
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "EmergencyDashboard/1.0"})
    try:
        with urlopen(request, timeout=timeout) as response:
            status = response.status
            raw = response.read(2_000_001)
    except HTTPError as error:
        raise ExternalSourceError(f"第三方接口返回 HTTP {error.code}", error.code) from error
    except (URLError, TimeoutError, OSError) as error:
        raise ExternalSourceError(f"第三方接口连接失败：{error.reason if isinstance(error, URLError) else error}") from error
    if len(raw) > 2_000_000:
        raise ExternalSourceError("第三方响应超过 2MB")
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ExternalSourceError("第三方响应不是有效 JSON") from error
    return status, payload, round((time.monotonic() - started) * 1000)


def request_source(
    source_key: str,
    config: dict[str, Any],
    page: int,
    page_size: int,
    keyword: str,
    fetcher: Callable[[str], tuple[int, Any, int]] = fetch_external_json,
) -> tuple[dict[str, Any], int, Any, str]:
    if source_key not in SOURCE_FIELDS:
        raise ExternalSourceError("未知数据源", 404)
    source = config["sources"][source_key]
    if not source["enabled"]:
        raise ExternalSourceError(f"{SOURCE_LABELS[source_key]}数据源未启用", 503)
    url = build_request_url(config["baseUrl"], source, page, page_size, keyword)
    status, raw_payload, elapsed_ms = fetcher(url)
    normalized = normalize_payload(source_key, config["baseUrl"], source, raw_payload)
    return normalized, elapsed_ms, raw_payload, url
