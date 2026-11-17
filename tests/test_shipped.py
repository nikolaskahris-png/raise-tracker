"""shipped.py and the contributor counts of commits.py, offline: releases (draft, pre-release, before the raise), bots, all or nothing,
and no username or email in anything that is written."""
import csv
import datetime as dt
import io
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "collector"))
import commits  # noqa: E402
import shipped  # noqa: E402
from net import FetchError  # noqa: E402

UTC = dt.timezone.utc
NOW = dt.datetime(2026, 11, 17, 12, 0, tzinfo=UTC)
RAISE = dt.datetime(2026, 9, 10, 0, 0, tzinfo=UTC)
P = {"ticker": "T", "base_mint": "M", "status": "found", "github": ["acme"]}
SECRETS = ["alice-the-dev", "bob@example.org", "carol-login", "mallory@example.com", "dependabot[bot]"]


def rel(tag, published, draft=False, prerelease=False):
    return {"tag_name": tag, "published_at": published, "created_at": published, "draft": draft, "prerelease": prerelease, "html_url": f"https://github.com/acme/app/releases/tag/{tag}"}


def com(date, login=None, email="x@example.net"):
    return {"author": {"login": login} if login else None, "commit": {"committer": {"date": date}, "author": {"email": email}}}


class Releases(unittest.TestCase):
    def read(self, batches):
        pages = iter(batches)
        with mock.patch.object(shipped, "github", lambda path: (next(pages), {})):
            return shipped.repo_releases("acme", "app", RAISE)

    def test_draft_never_counts_prerelease_apart_and_before_the_raise_left_out(self):
        stable, pre, newest = self.read([[
            rel("v1.3.0", "2026-11-01T10:00:00Z"), rel("v1.3.0-rc1", "2026-10-30T10:00:00Z", prerelease=True),
            rel("v9.9.9", "2026-11-10T10:00:00Z", draft=True), rel("v1.2.0", "2026-10-01T10:00:00Z"),
            rel("v0.1.0", "2026-08-01T10:00:00Z"), rel("v0.1.0-beta", "2026-09-01T10:00:00Z", prerelease=True),
        ]])
        self.assertEqual((stable, pre), (2, 1))
        self.assertEqual(newest["tag_name"], "v1.3.0")  # the newest published release that is not a pre-release; never the draft

    def test_a_newer_prerelease_is_not_the_latest_release(self):
        stable, pre, newest = self.read([[rel("v2.0.0-rc", "2026-11-12T10:00:00Z", prerelease=True), rel("v1.0.0", "2026-10-01T10:00:00Z")]])
        self.assertEqual((stable, pre, newest["tag_name"]), (1, 1, "v1.0.0"))

    def test_no_release_since_the_raise_is_zero_with_no_latest(self):
        self.assertEqual(self.read([[rel("v0.1.0", "2026-08-01T10:00:00Z")]]), (0, 0, None))
        self.assertEqual(self.read([[]]), (0, 0, None))

    def test_follows_pages(self):
        page1 = [rel(f"v1.{i}.0", "2026-10-01T10:00:00Z") for i in range(100)]
        stable, _, _ = self.read([page1, [rel("v2.0.0", "2026-11-01T10:00:00Z")]])
        self.assertEqual(stable, 101)

    def test_too_many_pages_is_an_error_not_a_cut(self):
        with mock.patch.object(shipped, "github", lambda path: ([rel("v1.0.0", "2026-10-01T10:00:00Z")] * 100, {})):
            with self.assertRaises(FetchError):
                shipped.repo_releases("acme", "app", RAISE)


class AllOrNothing(unittest.TestCase):
    COUNTS = {"acme/app": ("T", "M", 2, 3), "acme/lib": ("T", "M", 1, 3)}

    def test_rows_hold_numbers_and_the_latest_release(self):
        def fake(path):
            return ([rel("v1.0.0", "2026-10-01T10:00:00Z")] if "/app/" in path else []), {}
        with mock.patch.object(shipped, "github", fake):
            rows = shipped.build_rows(self.COUNTS, {"M": RAISE}, NOW)
        app = next(r for r in rows if r["repo"] == "acme/app")
        self.assertEqual((app["releases_since_raise"], app["prereleases_since_raise"], app["latest_release_tag"], app["latest_release_date"],
                          app["contributors_since_raise"], app["contributors_project_since_raise"], app["read_at"]), (1, 0, "v1.0.0", "2026-10-01", 2, 3, "2026-11-17"))
        lib = next(r for r in rows if r["repo"] == "acme/lib")
        self.assertEqual((lib["releases_since_raise"], lib["latest_release_tag"], lib["latest_release_url"]), (0, "", ""))

    def test_one_failed_read_writes_nothing_and_is_not_a_zero(self):
        def fake(path):
            if "/lib/" in path:
                raise FetchError("HTTP 403 x")
            return [], {}
        with tempfile.TemporaryDirectory() as d, mock.patch.object(shipped, "github", fake):
            path = os.path.join(d, "shipped.csv")
            with self.assertRaises(FetchError):
                shipped.write_csv(path, shipped.build_rows(self.COUNTS, {"M": RAISE}, NOW))
            self.assertFalse(os.path.exists(path))
            self.assertFalse(os.path.exists(path + ".tmp"))

    def test_a_project_without_a_raise_time_is_an_error(self):
        with mock.patch.object(shipped, "github", lambda p: ([], {})), self.assertRaises(FetchError):
            shipped.build_rows(self.COUNTS, {}, NOW)


class Contributors(unittest.TestCase):
    def run_rows(self, repos, pages):
        def fake(path):
            name = path.split("/repos/acme/")[1].split("/")[0]
            return pages[name], {}
        with mock.patch.object(commits, "org_repos", lambda o: repos), mock.patch.object(commits, "github", fake):
            return commits.build_rows([P], {"M": RAISE}, NOW)

    REPOS = [{"name": "a", "fork": False, "pushed_at": "2026-11-10T00:00:00Z"}, {"name": "b", "fork": False, "pushed_at": "2026-11-10T00:00:00Z"}]

    def test_distinct_people_bots_left_out_email_when_there_is_no_login(self):
        pages = {
            "a": [com("2026-11-02T08:00:00Z", "alice-the-dev"), com("2026-11-03T08:00:00Z", "Alice-The-Dev"), com("2026-11-04T08:00:00Z", "dependabot[bot]"),
                  com("2026-11-05T08:00:00Z", None, "bob@example.org"), com("2026-11-06T08:00:00Z", None, "BOB@example.org"),
                  com("2026-11-07T08:00:00Z", None, "41898282+github-actions[bot]@users.noreply.github.com")],
            "b": [com("2026-11-08T08:00:00Z", "alice-the-dev"), com("2026-11-09T08:00:00Z", "carol-login")],
        }
        rows = self.run_rows(self.REPOS, pages)
        by = {r["repo"]: r for r in rows}
        self.assertEqual(by["acme/a"]["contributors_repo"], 2)  # alice, bob: the bot, the second spelling of each and the actions bot do not add
        self.assertEqual(by["acme/b"]["contributors_repo"], 2)  # alice, carol
        self.assertEqual({r["contributors_project"] for r in rows}, {3})  # alice, bob, carol: alice is one person in both repos

    def test_nothing_that_identifies_a_person_is_written(self):
        pages = {"a": [com("2026-11-02T08:00:00Z", "alice-the-dev", "alice@example.org"), com("2026-11-05T08:00:00Z", None, "bob@example.org")],
                 "b": [com("2026-11-09T08:00:00Z", "carol-login", "mallory@example.com"), com("2026-11-09T09:00:00Z", "dependabot[bot]")]}
        rows = self.run_rows(self.REPOS, pages)
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=commits.COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
        text = buf.getvalue()
        for s in SECRETS + ["alice@example.org"]:
            self.assertNotIn(s, text)
        self.assertNotIn("@", text)
        self.assertEqual(commits.COLUMNS, ["ticker", "base_mint", "repo", "month", "commits", "last_commit", "contributors_repo", "contributors_project", "read_at"])

    def test_a_repo_with_no_commit_since_the_raise_has_zero_people(self):
        rows = self.run_rows([{"name": "old", "fork": False, "pushed_at": "2026-01-01T00:00:00Z"}], {})
        self.assertEqual({(r["contributors_repo"], r["contributors_project"]) for r in rows}, {(0, 0)})

    def test_shipped_csv_is_utf8_and_has_no_person(self):
        counts = {"acme/app": ("T", "M", 2, 2)}
        with mock.patch.object(shipped, "github", lambda p: ([rel("v1.0.0", "2026-10-01T10:00:00Z")], {})):
            rows = shipped.build_rows(counts, {"M": RAISE}, NOW)
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "shipped.csv")
            shipped.write_csv(path, rows)
            raw = open(path, "rb").read()
        text = raw.decode("utf-8")
        self.assertFalse(raw.startswith(b"\xef\xbb\xbf"))
        self.assertTrue(text.startswith(",".join(shipped.COLUMNS) + "\n"))
        self.assertNotIn("@", text)
        self.assertEqual(shipped.COLUMNS, ["ticker", "base_mint", "repo", "releases_since_raise", "prereleases_since_raise", "latest_release_tag", "latest_release_date",
                                           "latest_release_url", "contributors_since_raise", "contributors_project_since_raise", "read_at"])


if __name__ == "__main__":
    unittest.main()
