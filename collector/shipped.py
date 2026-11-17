"""What each team has shipped, as numbers: releases since the raise, and how many people committed.

Writes data/shipped.csv, one row per repo of data/commits-monthly.csv:
  - releases: GET /repos/{owner}/{repo}/releases (api.github.com, within rate limits). Only published releases count (a draft never
    does); pre-releases are counted apart. Only releases published on or after the raise count. The newest published release that is
    not a pre-release gives latest_release_tag, latest_release_date and latest_release_url.
  - contributors: how many different people committed to the default branch since the raise, bots left out. These counts were made
    by commits.py while it read the commits (no new calls here) and are only read back from data/commits-monthly.csv.
Only numbers, tags, dates and release URLs are stored: no username and no email, here or in commits-monthly.csv.
Either every repo is read or nothing is written: a failed read never becomes a zero.
"""
import csv
import datetime as dt
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from commits import parse_time, raise_times  # noqa: E402
from net import FetchError, github  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLUMNS = ["ticker", "base_mint", "repo", "releases_since_raise", "prereleases_since_raise", "latest_release_tag", "latest_release_date",
           "latest_release_url", "contributors_since_raise", "contributors_project_since_raise", "read_at"]
MAX_PAGES = 20  # 2,000 releases per repo; more is an error, not a silent cut


def repo_releases(owner, name, since):
    """(published releases, pre-releases, newest published non-pre-release or None) since `since`. Drafts are never counted."""
    stable, pre, newest = 0, 0, None
    for page in range(1, MAX_PAGES + 1):
        batch, _ = github(f"/repos/{owner}/{name}/releases?per_page=100&page={page}")
        for r in batch:
            if r.get("draft"):
                continue
            when = r.get("published_at") or r.get("created_at")
            if not when or parse_time(when) < since:
                continue
            if r.get("prerelease"):
                pre += 1
                continue
            stable += 1
            if newest is None or parse_time(when) > parse_time(newest["published_at"] or newest["created_at"]):
                newest = r
        if len(batch) < 100:
            return stable, pre, newest
    raise FetchError(f"{owner}/{name}: more than {MAX_PAGES * 100} releases, not read in full")


def read_commit_counts(path):
    """repo -> (ticker, base_mint, contributors_repo, contributors_project), read back from commits-monthly.csv."""
    out = {}
    with open(path, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            out[r["repo"]] = (r["ticker"], r["base_mint"], int(r["contributors_repo"]), int(r["contributors_project"]))
    return out


def build_rows(counts, raised_at, now):
    rows = []
    for repo in sorted(counts, key=lambda x: (counts[x][1], x)):
        ticker, mint, people, people_project = counts[repo]
        since = raised_at.get(mint)
        if since is None:
            raise FetchError(f"{ticker}: no raise time in raises.csv for {mint}")
        owner, name = repo.split("/", 1)
        stable, pre, newest = repo_releases(owner, name, since)
        rows.append({
            "ticker": ticker, "base_mint": mint, "repo": repo, "releases_since_raise": stable, "prereleases_since_raise": pre,
            "latest_release_tag": newest["tag_name"] if newest else "",
            "latest_release_date": (newest["published_at"] or newest["created_at"])[:10] if newest else "",
            "latest_release_url": newest["html_url"] if newest else "",
            "contributors_since_raise": people, "contributors_project_since_raise": people_project, "read_at": now.strftime("%Y-%m-%d"),
        })
    return rows


def write_csv(path, rows):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    os.replace(tmp, path)


def main():
    now = dt.datetime.now(dt.timezone.utc)
    rows = build_rows(read_commit_counts(os.path.join(ROOT, "data", "commits-monthly.csv")), raise_times(os.path.join(ROOT, "data", "raises.csv")), now)
    write_csv(os.path.join(ROOT, "data", "shipped.csv"), rows)
    print(f"{len(rows)} repos, read at {now.date()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
