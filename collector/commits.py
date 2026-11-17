"""Commits per month for every repo in registry/projects.json, from the date of the raise to today.

Writes data/commits-monthly.csv: one row per repo and month (zero months included, so a chart has no gaps).
Source: GitHub REST API (api.github.com, within rate limits), public repos only.
Counted: commits on each repo's DEFAULT branch, by committer date, UTC. Other branches are not read, and forks are left out.
Either every repo is read or nothing is written: a failed read never becomes a zero.
"""
import csv
import datetime as dt
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from net import FetchError, github  # noqa: E402
from run import org_repos  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLUMNS = ["ticker", "base_mint", "repo", "month", "commits", "last_commit", "read_at"]
MAX_PAGES = 100  # 10,000 commits per repo; more is an error, not a silent cut


def parse_time(s):
    return dt.datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)


def months_between(start, end):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield f"{y:04d}-{m:02d}"
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def raise_times(raises_csv_path):
    """base_mint -> time of the raise: when it completed, else when it closed, else when it started."""
    out = {}
    with open(raises_csv_path, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            t = r.get("completed_utc") or r.get("closed_utc") or r.get("started_utc")
            if r.get("decoded") == "yes" and t:
                out[r["base_mint"]] = parse_time(t[:19] + "Z")
    return out


def repo_commits(owner, name, since):
    """Commit times (UTC) on the default branch since `since`. An empty repo (HTTP 409) has none."""
    times = []
    for page in range(1, MAX_PAGES + 1):
        try:
            batch, _ = github(f"/repos/{owner}/{name}/commits?since={since.strftime('%Y-%m-%dT%H:%M:%SZ')}&per_page=100&page={page}")
        except FetchError as e:
            if "HTTP 409" in str(e):
                return []
            raise
        times += [parse_time(c["commit"]["committer"]["date"]) for c in batch]
        if len(batch) < 100:
            return times
    raise FetchError(f"{owner}/{name}: more than {MAX_PAGES * 100} commits since {since.date()}, not read in full")


def build_rows(projects, raised_at, now):
    rows = []
    for p in sorted(projects, key=lambda x: x["base_mint"]):
        if p.get("status") != "found":
            continue
        since = raised_at.get(p["base_mint"])
        if since is None:  # no launch of its own in raises.csv (Sanctum, MetaDAO, Flash.Trade): not a company on the site
            print(f"skipped {p['ticker']}: no raise time in raises.csv", file=sys.stderr)
            continue
        months = list(months_between(since, now))
        for owner in p["github"]:
            for r in sorted(org_repos(owner), key=lambda x: x["name"]):
                if r.get("fork"):
                    continue
                pushed = parse_time(r["pushed_at"]) if r.get("pushed_at") else None
                times = [] if pushed is not None and pushed < since else repo_commits(owner, r["name"], since)
                per = {m: 0 for m in months}
                for t in times:
                    per[f"{t.year:04d}-{t.month:02d}"] += 1  # a commit is never in a month outside [raise, now]
                last = max(times).strftime("%Y-%m-%dT%H:%M:%SZ") if times else ""
                for m in months:
                    rows.append({"ticker": p["ticker"], "base_mint": p["base_mint"], "repo": f"{owner}/{r['name']}", "month": m,
                                 "commits": per[m], "last_commit": last, "read_at": now.strftime("%Y-%m-%d")})
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
    with open(os.path.join(ROOT, "registry", "projects.json"), encoding="utf-8") as f:
        projects = json.load(f)["projects"]
    rows = build_rows(projects, raise_times(os.path.join(ROOT, "data", "raises.csv")), now)
    write_csv(os.path.join(ROOT, "data", "commits-monthly.csv"), rows)
    print(f"{len(rows)} rows, {len({r['repo'] for r in rows})} repos, read at {now.date()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
