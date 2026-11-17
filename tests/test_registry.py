"""registry/projects.json must be valid UTF-8 (CI reads it as UTF-8) and use only the known statuses."""
import json
import os
import unittest

PATH = os.path.join(os.path.dirname(__file__), "..", "registry", "projects.json")
STATUSES = {"found", "not_found", "private_declared", "open_declared_not_found"}


class Registry(unittest.TestCase):
    def test_valid_utf8(self):
        raw = open(PATH, "rb").read()
        raw.decode("utf-8")  # raises UnicodeDecodeError on cp1253 or any other encoding
        self.assertFalse(raw.startswith(b"\xef\xbb\xbf"), "no BOM")

    def test_statuses_are_known_and_ascii(self):
        projects = json.loads(open(PATH, encoding="utf-8").read())["projects"]
        self.assertGreaterEqual(len(projects), 32)
        self.assertEqual(len({p["base_mint"] for p in projects}), len(projects), "a mint appears twice")
        for p in projects:
            self.assertIn(p["status"], STATUSES, p["name"])
            self.assertTrue(p["status"].isascii())
            if p["status"] == "found":
                self.assertTrue(p["github"], p["name"])
            else:
                self.assertEqual(p["github"], [], p["name"])


if __name__ == "__main__":
    unittest.main()
