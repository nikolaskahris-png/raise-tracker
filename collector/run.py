"""Daily snapshot. Append-only: every run writes a new dated folder and never edits old ones.

Sources (all checked against their terms, see DECISIONS.md):
  - Solana mainnet RPC: MetaDAO futarchy v0.6 Dao + Proposal accounts, launchpad Launch accounts,
    treasury balances of each DAO's Squads vault.
  - GitHub REST API: public repos of the orgs listed in registry/projects.json.
Not collected on purpose: investor FundingRecords, StakeAccounts, AmmPositions (private individuals' wallets).
"""
import base64
import datetime as dt
import gzip
import json
import os
import sys
import time
import traceback

sys.path.insert(0, os.path.dirname(__file__))
from decode import DAO_DISC, PROPOSAL_DISC, b58encode, decode_dao, discriminator  # noqa: E402
from net import FetchError, github, rpc  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUTARCHY = "FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq"
LAUNCHPADS = {
    "v0.8": "moonDJUoHteKkGATejA5bdJVwJ6V6Dg74gyqyJTx73n",
    "v0.7": "moontUzsdepotRGe5xsfip7vLPTJnVuafqdUWexVnPM",
    "v0.6": "MooNyh4CBUYEKyXVnjGYQ8mEiJDpGvJMdvrZx1iGeHV",
    "v0.5": "mooNhciQJi1LqHDmse2JPic2NqG2PXCanbE3ZYzP3qA",
}
LAUNCH_DISC = discriminator("Launch")
TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCnbJwhtjnTaE"]


def program_accounts(program, disc):
    return rpc("getProgramAccounts", [program, {
        "encoding": "base64",
        "filters": [{"memcmp": {"offset": 0, "bytes": b58encode(disc)}}],
    }])


def write_jsonl_gz(path, rows):
    with gzip.open(path, "wt", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, sort_keys=True) + "\n")


def main():
    started_wall = dt.datetime.now(dt.timezone.utc)
    t0 = time.monotonic()
    day = started_wall.strftime("%Y-%m-%d")
    trigger = os.environ.get("RUN_TRIGGER", "manual")  # 'schedule' in the cron job
    out = os.path.join(ROOT, "data", day[:4], day[5:7], day)
    if os.path.exists(os.path.join(out, "health.json")):
        out = out + "-" + started_wall.strftime("%H%M%S")  # second run the same day: never overwrite
    os.makedirs(out, exist_ok=True)
    health = {"started_utc": started_wall.isoformat(), "trigger": trigger, "steps": {}}

    def step(name, fn):
        s = time.monotonic()
        try:
            info = fn()
            health["steps"][name] = {"status": "ok", **(info or {})}
        except Exception as e:  # recorded as a failed look, never as 'empty'
            health["steps"][name] = {"status": "failed", "error": f"{type(e).__name__}: {e}",
                                     "trace": traceback.format_exc()[-1500:]}
        health["steps"][name]["seconds"] = round(time.monotonic() - s, 1)

    daos = []

    def futarchy():
        accts = program_accounts(FUTARCHY, DAO_DISC)
        rows, bad = [], 0
        for a in accts:
            raw_b64 = a["account"]["data"][0]
            row = {"address": a["pubkey"], "raw_b64": raw_b64}
            try:
                row["decoded"] = decode_dao(base64.b64decode(raw_b64))
            except Exception as e:
                row["decode_error"] = str(e)
                bad += 1
            rows.append(row)
        write_jsonl_gz(os.path.join(out, "futarchy_daos.jsonl.gz"), rows)
        daos.extend(r for r in rows if "decoded" in r)
        props = program_accounts(FUTARCHY, PROPOSAL_DISC)
        write_jsonl_gz(os.path.join(out, "futarchy_proposals_raw.jsonl.gz"),
                       [{"address": p["pubkey"], "raw_b64": p["account"]["data"][0]} for p in props])
        return {"daos": len(rows), "decode_errors": bad, "proposals_raw": len(props)}

    def launches():
        rows, counts = [], {}
        for ver, prog in LAUNCHPADS.items():
            accts = program_accounts(prog, LAUNCH_DISC)
            counts[ver] = len(accts)
            rows += [{"program_version": ver, "address": a["pubkey"], "raw_b64": a["account"]["data"][0]} for a in accts]
        write_jsonl_gz(os.path.join(out, "launches_raw.jsonl.gz"), rows)
        return {"launches_raw": len(rows), "by_version": counts}

    def treasuries():
        if health["steps"].get("futarchy", {}).get("status") != "ok":
            raise RuntimeError("skipped: no DAO list this run (futarchy step failed) - unverified, not zero")
        rows, failed = [], 0
        for d in daos:
            vault = d["decoded"]["treasury_vault"]
            row = {"dao": d["address"], "vault": vault}
            try:
                row["sol_lamports"] = rpc("getBalance", [vault])["value"]
                toks = []
                for tp in TOKEN_PROGRAMS:
                    res = rpc("getTokenAccountsByOwner", [vault, {"programId": tp}, {"encoding": "jsonParsed"}])
                    for t in res["value"]:
                        info = t["account"]["data"]["parsed"]["info"]
                        toks.append({"mint": info["mint"], "amount": info["tokenAmount"]["amount"],
                                     "decimals": info["tokenAmount"]["decimals"]})
                row["tokens"] = toks
            except FetchError as e:
                row["error"] = str(e)  # unverified, not zero
                failed += 1
            rows.append(row)
        with open(os.path.join(out, "treasuries.jsonl"), "w") as f:
            for r in rows:
                f.write(json.dumps(r, sort_keys=True) + "\n")
        return {"vaults": len(rows), "unverified": failed}

    def github_activity():
        with open(os.path.join(ROOT, "registry", "projects.json")) as f:
            projects = json.load(f)["projects"]
        since = (started_wall - dt.timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
        rows, failed = [], 0
        for p in projects:
            for owner in p.get("github", []):
                row = {"project": p["name"], "owner": owner}
                try:
                    repos, _ = github(f"/users/{owner}/repos?per_page=100&sort=pushed")
                    row["repos"] = []
                    for r in repos[:30]:
                        commits, pages = 0, 0
                        while pages < 5:
                            page, _ = github(f"/repos/{owner}/{r['name']}/commits?since={since}&per_page=100&page={pages + 1}")
                            commits += len(page)
                            pages += 1
                            if len(page) < 100:
                                break
                        row["repos"].append({"name": r["name"], "fork": r["fork"], "archived": r["archived"],
                                             "pushed_at": r["pushed_at"], "stars": r["stargazers_count"],
                                             "commits_30d": commits, "commits_capped": pages == 5})
                except FetchError as e:
                    if "HTTP 409" in str(e):  # empty repo
                        row.setdefault("notes", []).append(str(e))
                    else:
                        row["error"] = str(e)
                        failed += 1
                rows.append(row)
        with open(os.path.join(out, "github.jsonl"), "w") as f:
            for r in rows:
                f.write(json.dumps(r, sort_keys=True) + "\n")
        return {"owners": len(rows), "unverified": failed}

    step("futarchy", futarchy)
    step("launches", launches)
    step("treasuries", treasuries)
    step("github", github_activity)

    health["seconds_total"] = round(time.monotonic() - t0, 1)
    health["all_ok"] = all(s["status"] == "ok" and not s.get("unverified") and not s.get("decode_errors")
                           for s in health["steps"].values())
    with open(os.path.join(out, "health.json"), "w") as f:
        json.dump(health, f, indent=1, sort_keys=True)
    print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk != "trace"} for k, v in health["steps"].items()}, indent=1))
    print("ALL OK" if health["all_ok"] else "SOME STEPS FAILED OR UNVERIFIED")
    return 0 if all(s["status"] == "ok" for s in health["steps"].values()) else 1


if __name__ == "__main__":
    sys.exit(main())
