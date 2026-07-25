#!/usr/bin/env python3
"""Low-frequency public storefront intelligence for WordPress/WooCommerce."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import re
import sqlite3
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "https://biologixlabsresearch.com"
DEFAULT_INTERVAL_SECONDS = 900
MIN_INTERVAL_SECONDS = 300
DEFAULT_TIMEOUT_SECONDS = 20.0
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
USER_AGENT = (
    "OVO-Public-Storefront-Research/1.0 "
    "(low-frequency public GET monitoring; no customer or order data)"
)

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_DB_PATH = SCRIPT_DIR / "data" / "biologix-public-intel.sqlite3"
DEFAULT_REPORT_DIR = SCRIPT_DIR / "reports"


SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    captured_at TEXT NOT NULL UNIQUE,
    base_url TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    parent_count INTEGER NOT NULL,
    variation_count INTEGER NOT NULL,
    exact_inventory_units INTEGER NOT NULL,
    displayed_inventory_value_cents INTEGER NOT NULL,
    homepage_bytes INTEGER,
    trackers_json TEXT NOT NULL,
    response_meta_json TEXT NOT NULL,
    errors_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS observations (
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    item_key TEXT NOT NULL,
    record_type TEXT NOT NULL,
    product_type TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    parent_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    variation TEXT NOT NULL,
    sku TEXT NOT NULL,
    price_cents INTEGER,
    regular_price_cents INTEGER,
    sale_price_cents INTEGER,
    stock_quantity INTEGER,
    stock_text TEXT NOT NULL,
    in_stock INTEGER NOT NULL,
    on_backorder INTEGER NOT NULL,
    purchasable INTEGER NOT NULL,
    track_inventory INTEGER NOT NULL,
    popularity_rank INTEGER,
    modified_gmt TEXT,
    permalink TEXT NOT NULL,
    raw_hash TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_observations_item
    ON observations(item_key, snapshot_id);
CREATE INDEX IF NOT EXISTS idx_observations_parent
    ON observations(snapshot_id, parent_id);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    previous_snapshot_id INTEGER REFERENCES snapshots(id) ON DELETE SET NULL,
    observed_at TEXT NOT NULL,
    event_type TEXT NOT NULL,
    item_key TEXT NOT NULL,
    parent_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    variation TEXT NOT NULL,
    old_quantity INTEGER,
    new_quantity INTEGER,
    quantity_delta INTEGER,
    old_price_cents INTEGER,
    new_price_cents INTEGER,
    displayed_value_cents INTEGER,
    old_rank INTEGER,
    new_rank INTEGER,
    confidence REAL NOT NULL,
    modified_gmt TEXT,
    group_id TEXT,
    evidence_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_observed
    ON events(observed_at, event_type);
CREATE INDEX IF NOT EXISTS idx_events_group
    ON events(group_id);

CREATE TABLE IF NOT EXISTS event_groups (
    group_id TEXT PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    observed_at TEXT NOT NULL,
    occurred_at TEXT,
    group_type TEXT NOT NULL,
    item_count INTEGER NOT NULL,
    unit_count INTEGER NOT NULL,
    displayed_value_cents INTEGER NOT NULL,
    confidence REAL NOT NULL,
    evidence_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_groups_observed
    ON event_groups(observed_at, group_type);
"""


@dataclass(frozen=True)
class HttpResult:
    url: str
    body: bytes
    status: int
    headers: dict[str, str]
    duration_ms: int


@dataclass(frozen=True)
class Observation:
    item_key: str
    record_type: str
    product_type: str
    product_id: int
    parent_id: int
    name: str
    variation: str
    sku: str
    price_cents: int | None
    regular_price_cents: int | None
    sale_price_cents: int | None
    stock_quantity: int | None
    stock_text: str
    in_stock: bool
    on_backorder: bool
    purchasable: bool
    track_inventory: bool
    popularity_rank: int | None
    modified_gmt: str | None
    permalink: str
    raw_hash: str


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def isoformat_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="microseconds")


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_since(value: str, now: datetime | None = None) -> str:
    now = now or utc_now()
    match = re.fullmatch(r"(\d+)([mhdw])", value.strip().lower())
    if match:
        amount = int(match.group(1))
        unit = match.group(2)
        delta = {
            "m": timedelta(minutes=amount),
            "h": timedelta(hours=amount),
            "d": timedelta(days=amount),
            "w": timedelta(weeks=amount),
        }[unit]
        return isoformat_utc(now - delta)
    parsed = parse_datetime(value)
    if parsed is None:
        raise ValueError(f"Invalid --since value: {value}")
    return isoformat_utc(parsed)


def parse_stock_quantity(stock_text: str | None, in_stock: bool) -> int | None:
    text = (stock_text or "").strip()
    match = re.match(r"^(-?\d+)\s+in stock\b", text, flags=re.IGNORECASE)
    if match:
        return int(match.group(1))
    if not in_stock and text.lower().startswith("out of stock"):
        return 0
    return None


def cents(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def stable_hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def add_query_value(url: str, key: str, value: str | int) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query[key] = str(value)
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
    )


def fetch_url(
    url: str,
    *,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    max_bytes: int = MAX_RESPONSE_BYTES,
    attempts: int = 3,
) -> HttpResult:
    last_error: Exception | None = None
    for attempt in range(attempts):
        started = time.monotonic()
        request = Request(
            url,
            headers={
                "Accept": "application/json,text/html;q=0.9,*/*;q=0.1",
                "User-Agent": USER_AGENT,
            },
            method="GET",
        )
        try:
            with urlopen(request, timeout=timeout) as response:
                body = response.read(max_bytes + 1)
                if len(body) > max_bytes:
                    raise ValueError(f"Response exceeded {max_bytes} bytes: {url}")
                return HttpResult(
                    url=response.geturl(),
                    body=body,
                    status=int(response.status),
                    headers={key.lower(): value for key, value in response.headers.items()},
                    duration_ms=round((time.monotonic() - started) * 1000),
                )
        except (HTTPError, URLError, TimeoutError, ValueError) as error:
            last_error = error
            if isinstance(error, HTTPError) and error.code < 500:
                break
            if attempt + 1 < attempts:
                time.sleep(0.5 * (2**attempt))
    assert last_error is not None
    raise RuntimeError(f"GET failed after {attempts} attempts: {url}: {last_error}")


def fetch_json_collection(
    url: str,
    *,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    max_pages: int = 20,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    records: list[dict[str, Any]] = []
    response_meta: list[dict[str, Any]] = []
    page = 1
    total_pages = 1
    while page <= total_pages:
        if page > max_pages:
            raise RuntimeError(f"Collection exceeded the {max_pages}-page safety cap: {url}")
        page_url = add_query_value(url, "page", page)
        result = fetch_url(page_url, timeout=timeout)
        decoded = json.loads(result.body)
        if not isinstance(decoded, list):
            raise ValueError(f"Expected a JSON list from {page_url}")
        records.extend(decoded)
        total_pages = int(result.headers.get("x-wp-totalpages", "1") or "1")
        response_meta.append(
            {
                "url": page_url,
                "status": result.status,
                "duration_ms": result.duration_ms,
                "items": len(decoded),
                "total_items": result.headers.get("x-wp-total"),
                "total_pages": total_pages,
                "last_modified": result.headers.get("last-modified"),
            }
        )
        page += 1
    return records, response_meta


def detect_trackers(html: str) -> list[dict[str, str]]:
    patterns = {
        "google_tag_manager": r"\bGTM-[A-Z0-9]{5,}\b",
        "google_analytics": r"\bG-[A-Z0-9]{6,}\b",
        "universal_analytics": r"\bUA-\d{4,}-\d+\b",
        "google_ads": r"\bAW-\d{5,}\b",
        "meta_pixel": r"""fbq\(\s*['"]init['"]\s*,\s*['"](\d{5,})['"]""",
        "tiktok_pixel": r"""ttq\.load\(\s*['"]([A-Z0-9]{8,})['"]""",
        "microsoft_clarity": r"""clarity\.ms/tag/([a-z0-9]+)""",
        "hotjar": r"""hjid\s*[:=]\s*(\d+)""",
    }
    found: set[tuple[str, str]] = set()
    for provider, pattern in patterns.items():
        for match in re.finditer(pattern, html, flags=re.IGNORECASE):
            identifier = match.group(1) if match.lastindex else match.group(0)
            found.add((provider, identifier.upper()))

    generic_markers = {
        "brevo": ("sibautomation.com", "sendinblue"),
        "meta_pixel_present": ("connect.facebook.net/en_US/fbevents.js",),
        "tiktok_pixel_present": ("analytics.tiktok.com",),
    }
    lowered = html.lower()
    for provider, markers in generic_markers.items():
        if any(marker.lower() in lowered for marker in markers):
            found.add((provider, "present"))

    return [
        {"provider": provider, "public_id": identifier}
        for provider, identifier in sorted(found)
    ]


def build_observations(
    parents: Sequence[dict[str, Any]],
    variations: Sequence[dict[str, Any]],
    wp_products: Sequence[dict[str, Any]],
) -> list[Observation]:
    modified_by_id = {
        int(product["id"]): product.get("modified_gmt")
        for product in wp_products
        if product.get("id") is not None
    }

    exact_child_parents: set[int] = set()
    variation_quantities: dict[int, int | None] = {}
    for variation in variations:
        quantity = parse_stock_quantity(
            variation.get("stock_availability", {}).get("text"),
            bool(variation.get("is_in_stock")),
        )
        variation_quantities[int(variation["id"])] = quantity
        if quantity is not None:
            exact_child_parents.add(int(variation.get("parent") or 0))

    observations: list[Observation] = []

    def normalize(
        item: dict[str, Any],
        *,
        record_type: str,
        rank: int | None,
        quantity: int | None,
        track_inventory: bool,
    ) -> Observation:
        product_id = int(item["id"])
        parent_id = int(item.get("parent") or product_id)
        prices = item.get("prices") or {}
        stock_text = str((item.get("stock_availability") or {}).get("text") or "")
        selected = {
            "id": product_id,
            "parent": parent_id,
            "name": item.get("name"),
            "variation": item.get("variation"),
            "sku": item.get("sku"),
            "price": prices.get("price"),
            "regular_price": prices.get("regular_price"),
            "sale_price": prices.get("sale_price"),
            "stock_quantity": quantity,
            "stock_text": stock_text,
            "in_stock": item.get("is_in_stock"),
            "on_backorder": item.get("is_on_backorder"),
            "purchasable": item.get("is_purchasable"),
            "rank": rank,
            "modified_gmt": modified_by_id.get(parent_id),
        }
        return Observation(
            item_key=f"{record_type}:{product_id}",
            record_type=record_type,
            product_type=str(item.get("type") or ""),
            product_id=product_id,
            parent_id=parent_id,
            name=str(item.get("name") or ""),
            variation=str(item.get("variation") or ""),
            sku=str(item.get("sku") or ""),
            price_cents=cents(prices.get("price")),
            regular_price_cents=cents(prices.get("regular_price")),
            sale_price_cents=cents(prices.get("sale_price")),
            stock_quantity=quantity,
            stock_text=stock_text,
            in_stock=bool(item.get("is_in_stock")),
            on_backorder=bool(item.get("is_on_backorder")),
            purchasable=bool(item.get("is_purchasable")),
            track_inventory=track_inventory,
            popularity_rank=rank,
            modified_gmt=modified_by_id.get(parent_id),
            permalink=str(item.get("permalink") or ""),
            raw_hash=stable_hash(selected),
        )

    for rank, parent in enumerate(parents, start=1):
        in_stock = bool(parent.get("is_in_stock"))
        quantity = parse_stock_quantity(
            (parent.get("stock_availability") or {}).get("text"), in_stock
        )
        product_id = int(parent["id"])
        product_type = str(parent.get("type") or "")
        track_parent = (
            quantity is not None
            and bool(parent.get("is_purchasable"))
            and (
                product_type == "simple"
                or (product_type == "variable" and product_id not in exact_child_parents)
            )
        )
        observations.append(
            normalize(
                parent,
                record_type="product",
                rank=rank,
                quantity=quantity,
                track_inventory=track_parent,
            )
        )

    for variation in variations:
        quantity = variation_quantities[int(variation["id"])]
        observations.append(
            normalize(
                variation,
                record_type="variation",
                rank=None,
                quantity=quantity,
                track_inventory=quantity is not None
                and bool(variation.get("is_purchasable")),
            )
        )

    return observations


def connect_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA)
    return connection


def previous_snapshot_id(connection: sqlite3.Connection) -> int | None:
    row = connection.execute(
        "SELECT id FROM snapshots ORDER BY id DESC LIMIT 1"
    ).fetchone()
    return int(row["id"]) if row else None


def observation_rows(
    connection: sqlite3.Connection, snapshot_id: int
) -> dict[str, sqlite3.Row]:
    return {
        row["item_key"]: row
        for row in connection.execute(
            "SELECT * FROM observations WHERE snapshot_id = ?", (snapshot_id,)
        )
    }


def insert_event(
    connection: sqlite3.Connection,
    *,
    snapshot_id: int,
    previous_id: int | None,
    observed_at: str,
    event_type: str,
    current: sqlite3.Row,
    previous: sqlite3.Row | None,
    quantity_delta: int | None = None,
    displayed_value_cents: int | None = None,
    confidence: float = 1.0,
    evidence: dict[str, Any],
) -> int:
    cursor = connection.execute(
        """
        INSERT INTO events (
            snapshot_id, previous_snapshot_id, observed_at, event_type,
            item_key, parent_id, name, variation,
            old_quantity, new_quantity, quantity_delta,
            old_price_cents, new_price_cents, displayed_value_cents,
            old_rank, new_rank, confidence, modified_gmt, group_id, evidence_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
        """,
        (
            snapshot_id,
            previous_id,
            observed_at,
            event_type,
            current["item_key"],
            current["parent_id"],
            current["name"],
            current["variation"],
            previous["stock_quantity"] if previous else None,
            current["stock_quantity"],
            quantity_delta,
            previous["price_cents"] if previous else None,
            current["price_cents"],
            displayed_value_cents,
            previous["popularity_rank"] if previous else None,
            current["popularity_rank"],
            confidence,
            current["modified_gmt"],
            json.dumps(evidence, sort_keys=True),
        ),
    )
    return int(cursor.lastrowid)


def cluster_decreases(
    connection: sqlite3.Connection,
    *,
    snapshot_id: int,
    observed_at: str,
    decrease_event_ids: Sequence[int],
    correlation_seconds: int = 5,
) -> int:
    if len(decrease_event_ids) < 2:
        return 0
    placeholders = ",".join("?" for _ in decrease_event_ids)
    rows = list(
        connection.execute(
            f"SELECT * FROM events WHERE id IN ({placeholders})", decrease_event_ids
        )
    )
    if not rows:
        return 0

    previous_id = rows[0]["previous_snapshot_id"]
    current_capture_row = connection.execute(
        "SELECT captured_at FROM snapshots WHERE id = ?", (snapshot_id,)
    ).fetchone()
    previous_capture_row = (
        connection.execute(
            "SELECT captured_at FROM snapshots WHERE id = ?", (previous_id,)
        ).fetchone()
        if previous_id is not None
        else None
    )
    current_capture = (
        parse_datetime(current_capture_row["captured_at"])
        if current_capture_row
        else None
    )
    previous_capture = (
        parse_datetime(previous_capture_row["captured_at"])
        if previous_capture_row
        else None
    )
    timestamp_grace = timedelta(minutes=2)

    timestamped = [
        (row, parse_datetime(row["modified_gmt"]))
        for row in rows
        if (
            parse_datetime(row["modified_gmt"]) is not None
            and (
                previous_capture is None
                or parse_datetime(row["modified_gmt"])
                >= previous_capture - timestamp_grace
            )
            and (
                current_capture is None
                or parse_datetime(row["modified_gmt"])
                <= current_capture + timestamp_grace
            )
        )
    ]
    timestamped.sort(key=lambda pair: pair[1])

    clusters: list[list[tuple[sqlite3.Row, datetime | None]]] = []
    active: list[tuple[sqlite3.Row, datetime | None]] = []
    for pair in timestamped:
        if not active:
            active = [pair]
            continue
        assert pair[1] is not None and active[-1][1] is not None
        if (pair[1] - active[-1][1]).total_seconds() <= correlation_seconds:
            active.append(pair)
        else:
            if len(active) >= 2:
                clusters.append(active)
            active = [pair]
    if len(active) >= 2:
        clusters.append(active)

    inserted = 0
    for cluster in clusters:
        event_ids = [int(pair[0]["id"]) for pair in cluster]
        if len(set(event_ids)) < 2:
            continue
        occurred_at = min(pair[1] for pair in cluster if pair[1] is not None)
        unit_count = sum(abs(int(pair[0]["quantity_delta"] or 0)) for pair in cluster)
        displayed_value = sum(
            int(pair[0]["displayed_value_cents"] or 0) for pair in cluster
        )
        digest_input = (
            f"{snapshot_id}:{occurred_at.isoformat()}:{','.join(map(str, event_ids))}"
        )
        group_id = "basket-" + hashlib.sha256(digest_input.encode()).hexdigest()[:16]
        evidence = {
            "classification": "probable_basket_not_confirmed_sale",
            "basis": (
                f"{len(cluster)} public inventory decreases had parent-product "
                f"modified timestamps within {correlation_seconds} seconds and "
                "inside the snapshot interval"
            ),
            "event_ids": event_ids,
            "limits": [
                "May be an unpaid or failed order",
                "May be a manual or automated inventory adjustment",
                "Displayed prices exclude discounts, tax, shipping, and refunds",
            ],
        }
        connection.execute(
            """
            INSERT OR IGNORE INTO event_groups (
                group_id, snapshot_id, observed_at, occurred_at, group_type,
                item_count, unit_count, displayed_value_cents, confidence,
                evidence_json
            ) VALUES (?, ?, ?, ?, 'probable_basket', ?, ?, ?, 0.70, ?)
            """,
            (
                group_id,
                snapshot_id,
                observed_at,
                isoformat_utc(occurred_at),
                len(cluster),
                unit_count,
                displayed_value,
                json.dumps(evidence, sort_keys=True),
            ),
        )
        connection.execute(
            f"UPDATE events SET group_id = ? WHERE id IN ({','.join('?' for _ in event_ids)})",
            (group_id, *event_ids),
        )
        inserted += 1
    return inserted


def detect_events(
    connection: sqlite3.Connection,
    *,
    previous_id: int | None,
    snapshot_id: int,
    observed_at: str,
) -> dict[str, int]:
    if previous_id is None:
        return {"events": 0, "probable_baskets": 0}

    previous_rows = observation_rows(connection, previous_id)
    current_rows = observation_rows(connection, snapshot_id)
    event_count = 0
    decrease_ids: list[int] = []

    for item_key in sorted(set(previous_rows) & set(current_rows)):
        old = previous_rows[item_key]
        new = current_rows[item_key]

        if (
            old["track_inventory"]
            and new["track_inventory"]
            and old["stock_quantity"] is not None
            and new["stock_quantity"] is not None
            and old["stock_quantity"] != new["stock_quantity"]
        ):
            delta = int(new["stock_quantity"]) - int(old["stock_quantity"])
            event_type = "inventory_decrease" if delta < 0 else "inventory_increase"
            displayed_value = (
                abs(delta) * int(new["price_cents"])
                if new["price_cents"] is not None
                else None
            )
            event_id = insert_event(
                connection,
                snapshot_id=snapshot_id,
                previous_id=previous_id,
                observed_at=observed_at,
                event_type=event_type,
                current=new,
                previous=old,
                quantity_delta=delta,
                displayed_value_cents=displayed_value,
                confidence=1.0,
                evidence={
                    "classification": "observed_public_inventory_change",
                    "old_stock": old["stock_quantity"],
                    "new_stock": new["stock_quantity"],
                    "not_proof_of": [
                        "payment",
                        "settlement",
                        "fulfillment",
                        "non-refund",
                    ],
                },
            )
            event_count += 1
            if delta < 0:
                decrease_ids.append(event_id)

        if old["price_cents"] != new["price_cents"]:
            insert_event(
                connection,
                snapshot_id=snapshot_id,
                previous_id=previous_id,
                observed_at=observed_at,
                event_type="price_change",
                current=new,
                previous=old,
                confidence=1.0,
                evidence={
                    "classification": "observed_public_price_change",
                    "old_price_cents": old["price_cents"],
                    "new_price_cents": new["price_cents"],
                },
            )
            event_count += 1

        if (
            old["record_type"] == "product"
            and old["popularity_rank"] != new["popularity_rank"]
        ):
            insert_event(
                connection,
                snapshot_id=snapshot_id,
                previous_id=previous_id,
                observed_at=observed_at,
                event_type="popularity_rank_change",
                current=new,
                previous=old,
                confidence=1.0,
                evidence={
                    "classification": "observed_public_rank_change",
                    "old_rank": old["popularity_rank"],
                    "new_rank": new["popularity_rank"],
                    "note": "Rank movement does not reveal the underlying sales count.",
                },
            )
            event_count += 1

        if old["in_stock"] != new["in_stock"]:
            insert_event(
                connection,
                snapshot_id=snapshot_id,
                previous_id=previous_id,
                observed_at=observed_at,
                event_type="availability_change",
                current=new,
                previous=old,
                confidence=1.0,
                evidence={
                    "classification": "observed_public_availability_change",
                    "old_in_stock": bool(old["in_stock"]),
                    "new_in_stock": bool(new["in_stock"]),
                },
            )
            event_count += 1

    for item_key in sorted(set(current_rows) - set(previous_rows)):
        new = current_rows[item_key]
        insert_event(
            connection,
            snapshot_id=snapshot_id,
            previous_id=previous_id,
            observed_at=observed_at,
            event_type="catalog_added",
            current=new,
            previous=None,
            confidence=1.0,
            evidence={"classification": "observed_public_catalog_addition"},
        )
        event_count += 1

    for item_key in sorted(set(previous_rows) - set(current_rows)):
        old = previous_rows[item_key]
        insert_event(
            connection,
            snapshot_id=snapshot_id,
            previous_id=previous_id,
            observed_at=observed_at,
            event_type="catalog_removed",
            current=old,
            previous=old,
            confidence=1.0,
            evidence={
                "classification": "observed_public_catalog_removal",
                "note": "The record may have been unpublished, deleted, or temporarily hidden.",
            },
        )
        event_count += 1

    baskets = cluster_decreases(
        connection,
        snapshot_id=snapshot_id,
        observed_at=observed_at,
        decrease_event_ids=decrease_ids,
    )
    return {"events": event_count, "probable_baskets": baskets}


def collect_snapshot(
    *,
    connection: sqlite3.Connection,
    base_url: str,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    started = time.monotonic()
    base_url = base_url.rstrip("/") + "/"
    parent_url = urljoin(
        base_url,
        "wp-json/wc/store/v1/products?per_page=100&orderby=popularity&order=desc",
    )
    variation_url = urljoin(
        base_url,
        "wp-json/wc/store/v1/products?per_page=100&type=variation",
    )
    wp_products_url = urljoin(
        base_url,
        (
            "wp-json/wp/v2/product?per_page=100"
            "&_fields=id,modified,modified_gmt,title"
        ),
    )

    parents, parent_meta = fetch_json_collection(parent_url, timeout=timeout)
    variations, variation_meta = fetch_json_collection(variation_url, timeout=timeout)
    wp_products, wp_meta = fetch_json_collection(wp_products_url, timeout=timeout)
    homepage = fetch_url(base_url, timeout=timeout, max_bytes=3 * 1024 * 1024)
    trackers = detect_trackers(homepage.body.decode("utf-8", errors="replace"))

    observations = build_observations(parents, variations, wp_products)
    exact_inventory_units = sum(
        observation.stock_quantity or 0
        for observation in observations
        if observation.track_inventory and observation.stock_quantity is not None
    )
    displayed_inventory_value_cents = sum(
        (observation.stock_quantity or 0) * (observation.price_cents or 0)
        for observation in observations
        if observation.track_inventory and observation.stock_quantity is not None
    )
    captured_at = isoformat_utc(utc_now())
    previous_id = previous_snapshot_id(connection)

    response_meta = {
        "parents": parent_meta,
        "variations": variation_meta,
        "wp_products": wp_meta,
        "homepage": {
            "url": homepage.url,
            "status": homepage.status,
            "duration_ms": homepage.duration_ms,
            "server": homepage.headers.get("server"),
            "platform": homepage.headers.get("platform"),
            "panel": homepage.headers.get("panel"),
            "cache": homepage.headers.get("x-litespeed-cache"),
        },
    }
    duration_ms = round((time.monotonic() - started) * 1000)

    with connection:
        cursor = connection.execute(
            """
            INSERT INTO snapshots (
                captured_at, base_url, duration_ms, parent_count, variation_count,
                exact_inventory_units, displayed_inventory_value_cents,
                homepage_bytes, trackers_json, response_meta_json, errors_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')
            """,
            (
                captured_at,
                base_url,
                duration_ms,
                len(parents),
                len(variations),
                exact_inventory_units,
                displayed_inventory_value_cents,
                len(homepage.body),
                json.dumps(trackers, sort_keys=True),
                json.dumps(response_meta, sort_keys=True),
            ),
        )
        snapshot_id = int(cursor.lastrowid)
        connection.executemany(
            """
            INSERT INTO observations (
                snapshot_id, item_key, record_type, product_type, product_id,
                parent_id, name, variation, sku, price_cents,
                regular_price_cents, sale_price_cents, stock_quantity, stock_text,
                in_stock, on_backorder, purchasable, track_inventory,
                popularity_rank, modified_gmt, permalink, raw_hash
            ) VALUES (
                :snapshot_id, :item_key, :record_type, :product_type, :product_id,
                :parent_id, :name, :variation, :sku, :price_cents,
                :regular_price_cents, :sale_price_cents, :stock_quantity, :stock_text,
                :in_stock, :on_backorder, :purchasable, :track_inventory,
                :popularity_rank, :modified_gmt, :permalink, :raw_hash
            )
            """,
            [
                {
                    "snapshot_id": snapshot_id,
                    **asdict(observation),
                    "in_stock": int(observation.in_stock),
                    "on_backorder": int(observation.on_backorder),
                    "purchasable": int(observation.purchasable),
                    "track_inventory": int(observation.track_inventory),
                }
                for observation in observations
            ],
        )
        event_summary = detect_events(
            connection,
            previous_id=previous_id,
            snapshot_id=snapshot_id,
            observed_at=captured_at,
        )

    return {
        "snapshot_id": snapshot_id,
        "captured_at": captured_at,
        "duration_ms": duration_ms,
        "parent_count": len(parents),
        "variation_count": len(variations),
        "exact_inventory_units": exact_inventory_units,
        "displayed_inventory_value_cents": displayed_inventory_value_cents,
        "trackers": trackers,
        **event_summary,
    }


def latest_snapshot(connection: sqlite3.Connection) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT * FROM snapshots ORDER BY id DESC LIMIT 1"
    ).fetchone()


def product_activity(
    connection: sqlite3.Connection, *, snapshot_id: int, since: str
) -> dict[str, Any]:
    since_datetime = parse_datetime(since)
    rows = [
        dict(row)
        for row in connection.execute(
            """
            SELECT product_id, name, modified_gmt
            FROM observations
            WHERE snapshot_id = ?
              AND record_type = 'product'
              AND modified_gmt IS NOT NULL
            ORDER BY modified_gmt
            """,
            (snapshot_id,),
        )
        if (
            parse_datetime(row["modified_gmt"]) is not None
            and (
                since_datetime is None
                or parse_datetime(row["modified_gmt"]) >= since_datetime
            )
        )
    ]
    timestamped = [
        (row, parse_datetime(row["modified_gmt"]))
        for row in rows
        if parse_datetime(row["modified_gmt"]) is not None
    ]
    clusters: list[list[tuple[dict[str, Any], datetime | None]]] = []
    active: list[tuple[dict[str, Any], datetime | None]] = []
    for pair in timestamped:
        if not active:
            active = [pair]
            continue
        assert pair[1] is not None and active[-1][1] is not None
        if (pair[1] - active[-1][1]).total_seconds() <= 5:
            active.append(pair)
        else:
            clusters.append(active)
            active = [pair]
    if active:
        clusters.append(active)

    return {
        "products_modified": len(rows),
        "timestamp_clusters": len(clusters),
        "classification": "observed_product_activity_not_sales",
        "clusters": [
            {
                "occurred_at": isoformat_utc(
                    min(pair[1] for pair in cluster if pair[1] is not None)
                ),
                "product_count": len(cluster),
                "products": [pair[0]["name"] for pair in cluster],
            }
            for cluster in reversed(clusters)
        ],
    }


def report_data(
    connection: sqlite3.Connection, *, since: str
) -> dict[str, Any]:
    latest = latest_snapshot(connection)
    if latest is None:
        raise RuntimeError("No snapshots exist. Run `snapshot` first.")

    latest_id = int(latest["id"])
    movement = connection.execute(
        """
        SELECT
            COALESCE(SUM(CASE WHEN event_type = 'inventory_decrease'
                THEN ABS(quantity_delta) ELSE 0 END), 0) AS units_down,
            COALESCE(SUM(CASE WHEN event_type = 'inventory_decrease'
                THEN displayed_value_cents ELSE 0 END), 0) AS displayed_gmv_cents,
            COALESCE(SUM(CASE WHEN event_type = 'inventory_increase'
                THEN quantity_delta ELSE 0 END), 0) AS units_up,
            COALESCE(SUM(CASE WHEN event_type = 'price_change' THEN 1 ELSE 0 END), 0)
                AS price_changes,
            COALESCE(SUM(CASE WHEN event_type = 'popularity_rank_change'
                THEN 1 ELSE 0 END), 0) AS rank_changes,
            COALESCE(SUM(CASE WHEN event_type = 'availability_change'
                THEN 1 ELSE 0 END), 0) AS availability_changes
        FROM events
        WHERE observed_at >= ?
        """,
        (since,),
    ).fetchone()
    basket_summary = connection.execute(
        """
        SELECT
            COUNT(*) AS basket_count,
            COALESCE(SUM(unit_count), 0) AS units,
            COALESCE(SUM(displayed_value_cents), 0) AS displayed_value_cents
        FROM event_groups
        WHERE observed_at >= ? AND group_type = 'probable_basket'
        """,
        (since,),
    ).fetchone()
    grouped_decrease_count = connection.execute(
        """
        SELECT COUNT(*) AS count
        FROM events
        WHERE observed_at >= ?
          AND event_type = 'inventory_decrease'
          AND group_id IS NOT NULL
        """,
        (since,),
    ).fetchone()["count"]
    total_decrease_count = connection.execute(
        """
        SELECT COUNT(*) AS count
        FROM events
        WHERE observed_at >= ? AND event_type = 'inventory_decrease'
        """,
        (since,),
    ).fetchone()["count"]

    top_products = [
        dict(row)
        for row in connection.execute(
            """
            SELECT popularity_rank, product_id, name, price_cents, stock_text,
                   in_stock, permalink
            FROM observations
            WHERE snapshot_id = ?
              AND record_type = 'product'
              AND popularity_rank IS NOT NULL
            ORDER BY popularity_rank
            LIMIT 12
            """,
            (latest_id,),
        )
    ]
    recent_events = [
        dict(row)
        for row in connection.execute(
            """
            SELECT observed_at, event_type, name, variation, quantity_delta,
                   old_quantity, new_quantity, old_price_cents, new_price_cents,
                   displayed_value_cents, old_rank, new_rank, confidence,
                   modified_gmt, group_id
            FROM events
            WHERE observed_at >= ?
            ORDER BY id DESC
            LIMIT 30
            """,
            (since,),
        )
    ]
    probable_baskets = [
        {
            **dict(row),
            "evidence": json.loads(row["evidence_json"]),
        }
        for row in connection.execute(
            """
            SELECT *
            FROM event_groups
            WHERE observed_at >= ?
            ORDER BY observed_at DESC
            LIMIT 30
            """,
            (since,),
        )
    ]

    return {
        "generated_at": isoformat_utc(utc_now()),
        "since": since,
        "latest_snapshot": {
            "id": latest_id,
            "captured_at": latest["captured_at"],
            "parent_count": latest["parent_count"],
            "variation_count": latest["variation_count"],
            "exact_inventory_units": latest["exact_inventory_units"],
            "displayed_inventory_value_cents": latest[
                "displayed_inventory_value_cents"
            ],
            "trackers": json.loads(latest["trackers_json"]),
        },
        "observed_movement": {
            **dict(movement),
            "inventory_decrease_events": int(total_decrease_count),
            "grouped_inventory_decrease_events": int(grouped_decrease_count),
            "unclustered_inventory_decrease_events": int(total_decrease_count)
            - int(grouped_decrease_count),
        },
        "probable_baskets": {
            **dict(basket_summary),
            "confidence": 0.70,
            "classification": "inference_not_confirmed_sale",
            "groups": probable_baskets,
        },
        "top_products": top_products,
        "public_product_activity": product_activity(
            connection, snapshot_id=latest_id, since=since
        ),
        "recent_events": recent_events,
        "traffic": {
            "direct_counts_available": False,
            "publicly_detectable": [
                "analytics tag presence",
                "catalog activity",
                "product modification timestamps",
                "popularity-rank movement",
            ],
            "requires_authorized_access": [
                "sessions",
                "pageviews",
                "traffic sources",
                "conversion rate",
                "paid revenue",
                "refunds and chargebacks",
            ],
        },
    }


def dollars(value: int | None) -> str:
    return f"${(value or 0) / 100:,.2f}"


def safe_csv_value(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    if value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + value
    return value


def safe_csv_row(row: sqlite3.Row) -> dict[str, Any]:
    return {key: safe_csv_value(row[key]) for key in row.keys()}


def markdown_report(data: dict[str, Any]) -> str:
    latest = data["latest_snapshot"]
    movement = data["observed_movement"]
    baskets = data["probable_baskets"]
    activity = data["public_product_activity"]
    lines = [
        "# Biologix Public Intelligence Report",
        "",
        f"Generated: `{data['generated_at']}`",
        f"Window begins: `{data['since']}`",
        f"Latest snapshot: `{latest['captured_at']}`",
        "",
        "## Current public inventory",
        "",
        f"- Parent products: **{latest['parent_count']}**",
        f"- Variations: **{latest['variation_count']}**",
        f"- Exact countable units: **{latest['exact_inventory_units']:,}**",
        (
            "- Displayed-price inventory value: "
            f"**{dollars(latest['displayed_inventory_value_cents'])}**"
        ),
        "",
        "## Observed movement",
        "",
        f"- Units down: **{movement['units_down']:,}**",
        f"- Displayed-price GMV signal: **{dollars(movement['displayed_gmv_cents'])}**",
        f"- Units up: **{movement['units_up']:,}**",
        (
            "- Inventory-decrease records: "
            f"**{movement['inventory_decrease_events']:,}**"
        ),
        (
            "- Unclustered decrease candidates: "
            f"**{movement['unclustered_inventory_decrease_events']:,}**"
        ),
        f"- Price changes: **{movement['price_changes']:,}**",
        f"- Popularity-rank changes: **{movement['rank_changes']:,}**",
        f"- Availability changes: **{movement['availability_changes']:,}**",
        "",
        "## Probable baskets",
        "",
        f"- Correlated groups: **{baskets['basket_count']:,}**",
        f"- Units in correlated groups: **{baskets['units']:,}**",
        (
            "- Displayed-price value in correlated groups: "
            f"**{dollars(baskets['displayed_value_cents'])}**"
        ),
        "- Confidence: **70% inference, not a confirmed sale**",
        "",
        "## Public product activity",
        "",
        (
            "- Products whose latest public modification falls in this window: "
            f"**{activity['products_modified']:,}**"
        ),
        (
            "- Distinct five-second timestamp clusters: "
            f"**{activity['timestamp_clusters']:,}**"
        ),
        (
            "- Classification: **observed product activity, not sales or traffic**"
        ),
    ]
    for cluster in activity["clusters"][:10]:
        lines.append(
            f"- `{cluster['occurred_at']}`: {', '.join(cluster['products'])}"
        )

    lines.extend(
        [
        "",
        "## Current public popularity order",
        "",
        "| Rank | Product | Displayed price | Stock text |",
        "|---:|---|---:|---|",
        ]
    )
    for product in data["top_products"]:
        lines.append(
            f"| {product['popularity_rank']} | {product['name']} | "
            f"{dollars(product['price_cents'])} | {product['stock_text'] or '—'} |"
        )

    lines.extend(
        [
            "",
            "## Traffic visibility",
            "",
            (
                "- Direct sessions, pageviews, sources, and conversion rate are "
                "**not publicly available**."
            ),
            (
                "- Public analytics tags detected: "
                f"`{json.dumps(latest['trackers'], sort_keys=True)}`"
            ),
            (
                "- Exact traffic requires authorized GA4, Cloudflare, Jetpack, "
                "Search Console, or equivalent access."
            ),
            "",
            "## Recent events",
            "",
        ]
    )
    if not data["recent_events"]:
        lines.append("No changes have been observed in this window.")
    else:
        for event in data["recent_events"][:20]:
            item = event["name"]
            if event["variation"]:
                item += f" ({event['variation']})"
            if event["event_type"].startswith("inventory_"):
                detail = (
                    f"{event['old_quantity']} → {event['new_quantity']} "
                    f"({event['quantity_delta']:+d})"
                )
            elif event["event_type"] == "price_change":
                detail = (
                    f"{dollars(event['old_price_cents'])} → "
                    f"{dollars(event['new_price_cents'])}"
                )
            elif event["event_type"] == "popularity_rank_change":
                detail = f"#{event['old_rank']} → #{event['new_rank']}"
            else:
                detail = event["event_type"].replace("_", " ")
            group_note = f", `{event['group_id']}`" if event["group_id"] else ""
            lines.append(
                f"- `{event['observed_at']}`: **{item}**, {detail}{group_note}"
            )

    lines.extend(
        [
            "",
            "## Evidence boundary",
            "",
            (
                "Inventory movement is real public data. It is not proof of payment, "
                "settlement, fulfillment, non-refund, or customer demand. Displayed "
                "GMV excludes discounts, coupons, taxes, shipping, and refunds."
            ),
        ]
    )
    return "\n".join(lines) + "\n"


def export_csv(
    connection: sqlite3.Connection, *, since: str, output_dir: Path
) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    latest = latest_snapshot(connection)
    if latest is None:
        raise RuntimeError("No snapshots exist. Run `snapshot` first.")

    exports: list[tuple[str, str, tuple[Any, ...]]] = [
        (
            "snapshots.csv",
            "SELECT * FROM snapshots WHERE captured_at >= ? ORDER BY id",
            (since,),
        ),
        (
            "events.csv",
            "SELECT * FROM events WHERE observed_at >= ? ORDER BY id",
            (since,),
        ),
        (
            "probable-baskets.csv",
            "SELECT * FROM event_groups WHERE observed_at >= ? ORDER BY observed_at",
            (since,),
        ),
        (
            "current-inventory.csv",
            """
            SELECT item_key, record_type, product_type, product_id, parent_id,
                   name, variation, sku, price_cents, stock_quantity, stock_text,
                   in_stock, on_backorder, purchasable, track_inventory,
                   popularity_rank, modified_gmt, permalink
            FROM observations
            WHERE snapshot_id = ?
            ORDER BY COALESCE(popularity_rank, 9999), name, variation
            """,
            (latest["id"],),
        ),
    ]
    written: list[Path] = []
    for filename, query, params in exports:
        rows = list(connection.execute(query, params))
        destination = output_dir / filename
        with destination.open("w", encoding="utf-8", newline="") as handle:
            if rows:
                writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
                writer.writeheader()
                writer.writerows(safe_csv_row(row) for row in rows)
            else:
                handle.write("")
        written.append(destination)
    return written


def traffic_audit(connection: sqlite3.Connection) -> dict[str, Any]:
    latest = latest_snapshot(connection)
    if latest is None:
        raise RuntimeError("No snapshots exist. Run `snapshot` first.")
    response_meta = json.loads(latest["response_meta_json"])
    return {
        "captured_at": latest["captured_at"],
        "detected_public_trackers": json.loads(latest["trackers_json"]),
        "homepage": response_meta.get("homepage", {}),
        "direct_traffic_counts_available": False,
        "explanation": (
            "Public tag IDs show which analytics tools may be installed. They do not "
            "grant access to sessions, pageviews, sources, conversions, or revenue."
        ),
        "authorized_sources_needed": [
            "GA4 or Tag Manager read-only access",
            "Cloudflare or Jetpack analytics",
            "Google Search Console",
            "WooCommerce Analytics exports",
            "payment processor settlement and chargeback exports",
        ],
    }


def print_snapshot_result(result: dict[str, Any]) -> None:
    print(
        json.dumps(
            {
                **result,
                "displayed_inventory_value": dollars(
                    result["displayed_inventory_value_cents"]
                ),
            },
            indent=2,
            sort_keys=True,
        )
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Low-frequency public WordPress/WooCommerce inventory intelligence. "
            "Public GET requests only."
        )
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("snapshot", help="Collect and store one snapshot")

    watch_parser = subparsers.add_parser("watch", help="Poll continuously")
    watch_parser.add_argument(
        "--interval", type=int, default=DEFAULT_INTERVAL_SECONDS
    )
    watch_parser.add_argument("--jitter", type=int, default=30)

    report_parser = subparsers.add_parser("report", help="Analyze collected snapshots")
    report_parser.add_argument("--since", default="24h")
    report_parser.add_argument(
        "--format", choices=("markdown", "json"), default="markdown"
    )

    export_parser = subparsers.add_parser("export", help="Write analysis tables to CSV")
    export_parser.add_argument("--since", default="30d")
    export_parser.add_argument("--output-dir", type=Path, default=DEFAULT_REPORT_DIR)

    subparsers.add_parser(
        "traffic-audit", help="Show detectable public analytics tags and limits"
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    connection = connect_db(args.db)

    try:
        if args.command == "snapshot":
            result = collect_snapshot(
                connection=connection,
                base_url=args.base_url,
                timeout=args.timeout,
            )
            print_snapshot_result(result)
            return 0

        if args.command == "watch":
            if args.interval < MIN_INTERVAL_SECONDS:
                parser.error(
                    f"--interval must be at least {MIN_INTERVAL_SECONDS} seconds"
                )
            if args.jitter < 0 or args.jitter >= args.interval:
                parser.error("--jitter must be non-negative and lower than --interval")
            print(
                f"Polling {args.base_url} every {args.interval}s "
                f"(±{args.jitter}s). Stop with Ctrl-C.",
                flush=True,
            )
            while True:
                cycle_started = time.monotonic()
                try:
                    result = collect_snapshot(
                        connection=connection,
                        base_url=args.base_url,
                        timeout=args.timeout,
                    )
                    print_snapshot_result(result)
                except Exception as error:  # Keep supervised polling alive.
                    print(
                        json.dumps(
                            {
                                "captured_at": isoformat_utc(utc_now()),
                                "error": str(error),
                            }
                        ),
                        file=sys.stderr,
                        flush=True,
                    )
                elapsed = time.monotonic() - cycle_started
                target = args.interval + random.uniform(-args.jitter, args.jitter)
                time.sleep(max(1.0, target - elapsed))

        if args.command == "report":
            since = parse_since(args.since)
            data = report_data(connection, since=since)
            if args.format == "json":
                print(json.dumps(data, indent=2, sort_keys=True))
            else:
                print(markdown_report(data), end="")
            return 0

        if args.command == "export":
            since = parse_since(args.since)
            files = export_csv(
                connection,
                since=since,
                output_dir=args.output_dir,
            )
            print(json.dumps({"files": [str(path) for path in files]}, indent=2))
            return 0

        if args.command == "traffic-audit":
            print(json.dumps(traffic_audit(connection), indent=2, sort_keys=True))
            return 0

        parser.error(f"Unknown command: {args.command}")
    except KeyboardInterrupt:
        print("\nStopped.", file=sys.stderr)
        return 130
    finally:
        connection.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
