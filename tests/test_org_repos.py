"""org_repos follows /orgs/{org}/repos pages until a short page, and refuses to silently truncate."""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "collector"))
import run  # noqa: E402
from net import FetchError  # noqa: E402


class OrgRepos(unittest.TestCase):
    def test_reads_every_page(self):
        calls = []

        def fake(path):
            calls.append(path)
            page = int(path.rsplit("&page=", 1)[1])
            return ([{"name": f"r{page}-{i}"} for i in range(100)] if page < 3 else [{"name": "last"}]), {}

        with mock.patch.object(run, "github", fake):
            repos = run.org_repos("acme")
        self.assertEqual(len(repos), 201)
        self.assertEqual(len(calls), 3)
        self.assertTrue(all(c.startswith("/orgs/acme/repos?") for c in calls))

    def test_exact_multiple_of_page_size_asks_for_one_more_page(self):
        pages = {1: [{"name": str(i)} for i in range(100)], 2: []}
        with mock.patch.object(run, "github", lambda p: (pages[int(p.rsplit("&page=", 1)[1])], {})):
            self.assertEqual(len(run.org_repos("acme")), 100)

    def test_too_many_pages_is_an_error_not_a_truncation(self):
        with mock.patch.object(run, "github", lambda p: ([{"name": "x"}] * 100, {})):
            with self.assertRaises(FetchError):
                run.org_repos("acme", max_pages=3)


if __name__ == "__main__":
    unittest.main()
