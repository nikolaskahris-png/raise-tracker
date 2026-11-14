"""HTTP helpers: stdlib only, a timeout on every request, bounded retries with backoff."""
import json
import os
import time
import urllib.error
import urllib.request

TIMEOUT = 30
UA = "raise-tracker/0.1 (+https://github.com/nikolaskahris-png)"


class FetchError(Exception):
    pass


def _request(url, data=None, headers=None, retries=4):
    hdrs = {"User-Agent": UA, "Accept": "application/json"}
    if data is not None:
        hdrs["Content-Type"] = "application/json"
    hdrs.update(headers or {})
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=data, headers=hdrs)
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read().decode()), dict(resp.headers)
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code} {url}"
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(2 ** attempt * 2)
                continue
            raise FetchError(last) from e
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last = f"{type(e).__name__}: {e} {url}"
            time.sleep(2 ** attempt * 2)
    raise FetchError(last or f"failed {url}")


RPC_URL = os.environ.get("RPC_URL") or "https://api.mainnet-beta.solana.com"


def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    j, _ = _request(RPC_URL, data=body)
    if "error" in j:
        raise FetchError(f"RPC {method}: {j['error']}")
    time.sleep(0.25)  # stay well under public RPC limits
    return j["result"]


def github(path):
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    tok = os.environ.get("GITHUB_TOKEN")
    if tok:
        headers["Authorization"] = f"Bearer {tok}"
    return _request("https://api.github.com" + path, headers=headers)
