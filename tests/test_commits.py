"""commits.py: counting by month, zero months kept, forks left out, a failed read raises instead of writing a zero."""
import datetime as dt
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "collector"))
import commits  # noqa: E402
from net import FetchError  # noqa: E402

UTC = dt.timezone.utc
NOW = dt.datetime(2026, 11, 17, 12, 0, tzinfo=UTC)
RAISE = dt.datetime(2026, 9, 10, 0, 0, tzinfo=UTC)
P = {"ticker": "T", "base_mint": "M", "status": "found", "github": ["acme"]}


def c(date):
    return {"commit": {"committer": {"date": date}}}


class Commits(unittest.TestCase):
    def run_rows(self, repos, commit_pages):
        def fake_github(path):
            if "/commits?" in path:
                name = path.split("/repos/acme/")[1].split("/")[0]
                v = commit_pages[name]
                if isinstance(v, Exception):
                    raise v
                return v, {}
            raise AssertionError(path)
        with mock.patch.object(commits, "org_repos", lambda o: repos), mock.patch.object(commits, "github", fake_github):
            return commits.build_rows([P, {"ticker": "X", "base_mint": "Z", "status": "not_found", "github": []}], {"M": RAISE}, NOW)

    def test_months_zero_months_last_commit_and_forks(self):
        repos = [{"name": "a", "fork": False, "pushed_at": "2026-11-10T00:00:00Z"}, {"name": "f", "fork": True, "pushed_at": "2026-11-10T00:00:00Z"}]
        rows = self.run_rows(repos, {"a": [c("2026-11-10T08:00:00Z"), c("2026-11-02T08:00:00Z"), c("2026-09-30T23:59:59Z")]})
        self.assertEqual({r["repo"] for r in rows}, {"acme/a"})
        got = {r["month"]: r["commits"] for r in rows}
        self.assertEqual(got, {"2026-09": 1, "2026-10": 0, "2026-11": 2})
        self.assertTrue(all(r["last_commit"] == "2026-11-10T08:00:00Z" and r["read_at"] == "2026-11-17" for r in rows))

    def test_repo_not_pushed_since_the_raise_has_zero_rows_and_no_last_commit(self):
        rows = self.run_rows([{"name": "old", "fork": False, "pushed_at": "2026-01-01T00:00:00Z"}], {})
        self.assertEqual([r["commits"] for r in rows], [0, 0, 0])
        self.assertEqual({r["last_commit"] for r in rows}, {""})

    def test_empty_repo_is_zero_but_other_errors_are_not(self):
        r = [{"name": "e", "fork": False, "pushed_at": "2026-11-10T00:00:00Z"}]
        self.assertEqual({x["commits"] for x in self.run_rows(r, {"e": FetchError("HTTP 409 x")})}, {0})
        with self.assertRaises(FetchError):
            self.run_rows(r, {"e": FetchError("HTTP 403 x")})

    def test_months_between_crosses_a_year(self):
        self.assertEqual(list(commits.months_between(dt.datetime(2025, 11, 5, tzinfo=UTC), dt.datetime(2026, 2, 1, tzinfo=UTC))), ["2025-11", "2025-12", "2026-01", "2026-02"])


if __name__ == "__main__":
    unittest.main()
