from __future__ import annotations

import sqlite3
import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

import poller


def product(
    product_id: int,
    name: str,
    *,
    product_type: str = "simple",
    stock: str = "10 in stock",
    price: str = "1000",
    parent: int = 0,
    variation: str = "",
    purchasable: bool = True,
    in_stock: bool = True,
) -> dict:
    return {
        "id": product_id,
        "parent": parent,
        "name": name,
        "type": product_type,
        "variation": variation,
        "sku": f"SKU-{product_id}",
        "prices": {
            "price": price,
            "regular_price": price,
            "sale_price": price,
        },
        "stock_availability": {"text": stock},
        "is_in_stock": in_stock,
        "is_on_backorder": False,
        "is_purchasable": purchasable,
        "permalink": f"https://example.test/product/{product_id}",
    }


class PollerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test.sqlite3"
        self.connection = poller.connect_db(self.db_path)

    def tearDown(self) -> None:
        self.connection.close()
        self.temp_dir.cleanup()

    def insert_snapshot(
        self, captured_at: str, observations: list[poller.Observation]
    ) -> int:
        with self.connection:
            cursor = self.connection.execute(
                """
                INSERT INTO snapshots (
                    captured_at, base_url, duration_ms, parent_count,
                    variation_count, exact_inventory_units,
                    displayed_inventory_value_cents, homepage_bytes,
                    trackers_json, response_meta_json, errors_json
                ) VALUES (?, 'https://example.test/', 1, 0, 0, 0, 0, 0, '[]', '{}', '[]')
                """,
                (captured_at,),
            )
            snapshot_id = int(cursor.lastrowid)
            for observation in observations:
                values = poller.asdict(observation)
                self.connection.execute(
                    """
                    INSERT INTO observations (
                        snapshot_id, item_key, record_type, product_type,
                        product_id, parent_id, name, variation, sku,
                        price_cents, regular_price_cents, sale_price_cents,
                        stock_quantity, stock_text, in_stock, on_backorder,
                        purchasable, track_inventory, popularity_rank,
                        modified_gmt, permalink, raw_hash
                    ) VALUES (
                        :snapshot_id, :item_key, :record_type, :product_type,
                        :product_id, :parent_id, :name, :variation, :sku,
                        :price_cents, :regular_price_cents, :sale_price_cents,
                        :stock_quantity, :stock_text, :in_stock, :on_backorder,
                        :purchasable, :track_inventory, :popularity_rank,
                        :modified_gmt, :permalink, :raw_hash
                    )
                    """,
                    {
                        "snapshot_id": snapshot_id,
                        **values,
                        "in_stock": int(observation.in_stock),
                        "on_backorder": int(observation.on_backorder),
                        "purchasable": int(observation.purchasable),
                        "track_inventory": int(observation.track_inventory),
                    },
                )
        return snapshot_id

    def test_stock_parsing(self) -> None:
        self.assertEqual(poller.parse_stock_quantity("24 in stock", True), 24)
        self.assertEqual(
            poller.parse_stock_quantity("24 in stock (can be backordered)", True), 24
        )
        self.assertEqual(poller.parse_stock_quantity("Out of stock", False), 0)
        self.assertIsNone(poller.parse_stock_quantity("", True))

    def test_observation_model_avoids_variable_parent_double_count(self) -> None:
        parents = [
            product(1, "Simple", stock="4 in stock"),
            product(2, "Variable", product_type="variable", stock="20 in stock"),
        ]
        variations = [
            product(
                21,
                "Variable",
                product_type="variation",
                stock="7 in stock",
                parent=2,
                variation="Amount: 10mg",
            )
        ]
        modified = [
            {"id": 1, "modified_gmt": "2026-07-24T20:00:00"},
            {"id": 2, "modified_gmt": "2026-07-24T20:01:00"},
        ]
        observations = poller.build_observations(parents, variations, modified)
        by_key = {observation.item_key: observation for observation in observations}
        self.assertTrue(by_key["product:1"].track_inventory)
        self.assertFalse(by_key["product:2"].track_inventory)
        self.assertTrue(by_key["variation:21"].track_inventory)
        self.assertEqual(
            sum(
                observation.stock_quantity or 0
                for observation in observations
                if observation.track_inventory
            ),
            11,
        )

    def test_detects_and_clusters_probable_basket(self) -> None:
        source = poller.build_observations(
            [
                product(1, "Alpha", stock="10 in stock", price="2500"),
                product(2, "Beta", stock="8 in stock", price="5000"),
            ],
            [],
            [
                {"id": 1, "modified_gmt": "2026-07-24T21:00:02"},
                {"id": 2, "modified_gmt": "2026-07-24T21:00:04"},
            ],
        )
        changed = [
            replace(
                observation,
                stock_quantity=observation.stock_quantity - 1,
                stock_text=f"{observation.stock_quantity - 1} in stock",
            )
            for observation in source
        ]
        first_id = self.insert_snapshot("2026-07-24T20:55:00+00:00", source)
        second_id = self.insert_snapshot("2026-07-24T21:05:00+00:00", changed)
        with self.connection:
            summary = poller.detect_events(
                self.connection,
                previous_id=first_id,
                snapshot_id=second_id,
                observed_at="2026-07-24T21:05:00+00:00",
            )
        self.assertEqual(summary, {"events": 2, "probable_baskets": 1})
        group = self.connection.execute("SELECT * FROM event_groups").fetchone()
        self.assertEqual(group["unit_count"], 2)
        self.assertEqual(group["displayed_value_cents"], 7500)
        self.assertAlmostEqual(group["confidence"], 0.70)

    def test_inventory_increase_is_not_a_basket(self) -> None:
        source = poller.build_observations(
            [product(1, "Alpha", stock="2 in stock")],
            [],
            [{"id": 1, "modified_gmt": "2026-07-24T21:00:00"}],
        )
        changed = [replace(source[0], stock_quantity=9, stock_text="9 in stock")]
        first_id = self.insert_snapshot("2026-07-24T20:55:00+00:00", source)
        second_id = self.insert_snapshot("2026-07-24T21:05:00+00:00", changed)
        with self.connection:
            summary = poller.detect_events(
                self.connection,
                previous_id=first_id,
                snapshot_id=second_id,
                observed_at="2026-07-24T21:05:00+00:00",
            )
        self.assertEqual(summary, {"events": 1, "probable_baskets": 0})
        event = self.connection.execute("SELECT * FROM events").fetchone()
        self.assertEqual(event["event_type"], "inventory_increase")
        self.assertEqual(event["quantity_delta"], 7)

    def test_stale_modified_times_do_not_create_probable_basket(self) -> None:
        source = poller.build_observations(
            [
                product(1, "Alpha", stock="10 in stock"),
                product(2, "Beta", stock="10 in stock"),
            ],
            [],
            [
                {"id": 1, "modified_gmt": "2026-07-20T21:00:02"},
                {"id": 2, "modified_gmt": "2026-07-20T21:00:04"},
            ],
        )
        changed = [
            replace(
                observation,
                stock_quantity=observation.stock_quantity - 1,
                stock_text=f"{observation.stock_quantity - 1} in stock",
            )
            for observation in source
        ]
        first_id = self.insert_snapshot("2026-07-24T20:55:00+00:00", source)
        second_id = self.insert_snapshot("2026-07-24T21:05:00+00:00", changed)
        with self.connection:
            summary = poller.detect_events(
                self.connection,
                previous_id=first_id,
                snapshot_id=second_id,
                observed_at="2026-07-24T21:05:00+00:00",
            )
        self.assertEqual(summary, {"events": 2, "probable_baskets": 0})

    def test_tracker_detection(self) -> None:
        html = """
        <script>gtag('config', 'G-ABCDEF12');</script>
        <script>fbq('init', '123456789012345');</script>
        <script src="https://sibautomation.com/sa.js"></script>
        """
        trackers = poller.detect_trackers(html)
        self.assertIn(
            {"provider": "google_analytics", "public_id": "G-ABCDEF12"}, trackers
        )
        self.assertIn(
            {"provider": "meta_pixel", "public_id": "123456789012345"}, trackers
        )
        self.assertIn({"provider": "brevo", "public_id": "present"}, trackers)

    def test_parse_since(self) -> None:
        now = datetime(2026, 7, 25, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(
            poller.parse_since("24h", now=now),
            "2026-07-24T00:00:00.000000+00:00",
        )

    def test_product_activity_clusters_public_timestamps(self) -> None:
        observations = poller.build_observations(
            [
                product(1, "Alpha"),
                product(2, "Beta"),
                product(3, "Gamma"),
            ],
            [],
            [
                {"id": 1, "modified_gmt": "2026-07-24T21:00:02"},
                {"id": 2, "modified_gmt": "2026-07-24T21:00:04"},
                {"id": 3, "modified_gmt": "2026-07-24T22:00:00"},
            ],
        )
        snapshot_id = self.insert_snapshot(
            "2026-07-24T23:00:00+00:00", observations
        )
        activity = poller.product_activity(
            self.connection,
            snapshot_id=snapshot_id,
            since="2026-07-24T20:00:00+00:00",
        )
        self.assertEqual(activity["products_modified"], 3)
        self.assertEqual(activity["timestamp_clusters"], 2)
        self.assertEqual(activity["clusters"][1]["products"], ["Alpha", "Beta"])

    def test_cli_rejects_sub_five_minute_interval(self) -> None:
        parser = poller.build_parser()
        args = parser.parse_args(["watch", "--interval", "300"])
        self.assertEqual(args.interval, poller.MIN_INTERVAL_SECONDS)

    def test_csv_formula_values_are_neutralized(self) -> None:
        self.assertEqual(
            poller.safe_csv_value('=HYPERLINK("bad")'), '\'=HYPERLINK("bad")'
        )
        self.assertEqual(poller.safe_csv_value("+SUM(1,1)"), "'+SUM(1,1)")
        self.assertEqual(poller.safe_csv_value("Normal product"), "Normal product")
        self.assertEqual(poller.safe_csv_value(42), 42)


if __name__ == "__main__":
    unittest.main()
