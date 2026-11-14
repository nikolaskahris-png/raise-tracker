"""Decoders for MetaDAO futarchy v0.6 accounts (program FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq).

Layout source: github.com/metaDAOproject/programs (develop), programs/futarchy/src/state/{dao,futarchy_amm}.rs.
Borsh: enums and Options are variable length, so offsets are walked, never hard-coded.
Only fields needed for the tracker are returned; the raw base64 is always stored next to them.
"""
import base64
import hashlib
import struct

ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58encode(b: bytes) -> str:
    n = int.from_bytes(b, "big")
    out = ""
    while n > 0:
        n, r = divmod(n, 58)
        out = ALPHABET[r] + out
    pad = len(b) - len(b.lstrip(b"\0"))
    return "1" * pad + out


def discriminator(name: str) -> bytes:
    return hashlib.sha256(f"account:{name}".encode()).digest()[:8]


DAO_DISC = discriminator("Dao")
PROPOSAL_DISC = discriminator("Proposal")


class Reader:
    def __init__(self, data: bytes, pos: int = 0):
        self.d = data
        self.p = pos

    def take(self, n):
        if self.p + n > len(self.d):
            raise ValueError(f"read past end at {self.p}+{n} (len {len(self.d)})")
        v = self.d[self.p:self.p + n]
        self.p += n
        return v

    def u8(self): return self.take(1)[0]
    def u16(self): return struct.unpack("<H", self.take(2))[0]
    def i16(self): return struct.unpack("<h", self.take(2))[0]
    def u32(self): return struct.unpack("<I", self.take(4))[0]
    def u64(self): return struct.unpack("<Q", self.take(8))[0]
    def i64(self): return struct.unpack("<q", self.take(8))[0]
    def u128(self): return int.from_bytes(self.take(16), "little")
    def pubkey(self): return b58encode(self.take(32))

    def option(self, fn):
        tag = self.u8()
        if tag == 0:
            return None
        if tag != 1:
            raise ValueError(f"bad Option tag {tag} at {self.p - 1}")
        return fn()


TWAP_ORACLE_LEN = 16 + 8 + 8 + 16 * 4 + 4  # 100
POOL_LEN = TWAP_ORACLE_LEN + 8 * 4          # 132


def skip_pool_state(r: Reader) -> str:
    tag = r.u8()
    if tag == 0:      # Spot { spot }
        r.take(POOL_LEN)
        return "spot"
    if tag == 1:      # Futarchy { spot, pass, fail }
        r.take(POOL_LEN * 3)
        return "futarchy"
    raise ValueError(f"bad PoolState tag {tag}")


def decode_dao(raw: bytes) -> dict:
    if raw[:8] != DAO_DISC:
        raise ValueError("not a Dao account")
    r = Reader(raw, 8)
    pool_state = skip_pool_state(r)
    r.u128()                      # total_liquidity
    r.pubkey(); r.pubkey()        # amm base/quote mint (same as dao)
    r.pubkey(); r.pubkey()        # amm vaults
    out = {"pool_state": pool_state}
    out["nonce"] = r.u64()
    out["dao_creator"] = r.pubkey()
    r.u8()                        # pda_bump
    out["squads_multisig"] = r.pubkey()
    out["treasury_vault"] = r.pubkey()   # squads_multisig_vault
    out["base_mint"] = r.pubkey()
    out["quote_mint"] = r.pubkey()
    out["proposal_count"] = r.u32()
    out["pass_threshold_bps"] = r.u16()
    out["seconds_per_proposal"] = r.u32()
    r.u128(); r.u128()            # twap initial / max change
    r.u32()                       # twap_start_delay_seconds
    r.u64(); r.u64()              # min quote/base futarchic liquidity
    r.u64()                       # base_to_stake
    r.u64()                       # seq_num

    def spending_limit():
        amount = r.u64()
        n = r.u32()
        members = [r.pubkey() for _ in range(n)]
        return {"amount_per_month": amount, "members": members}

    out["spending_limit"] = r.option(spending_limit)
    out["team_sponsored_pass_threshold_bps"] = r.i16()
    out["team_address"] = r.pubkey()
    # Fields after this point exist only on migrated accounts; read them if present.
    try:
        r.option(lambda: (r.pubkey(), r.i64()))      # optimistic_proposal
        r.u8()                                       # is_optimistic_governance_enabled
        out["liquidator"] = r.option(r.pubkey)
        out["last_failed_takeover_at"] = r.i64()
        out["last_failed_liquidation_at"] = r.i64()
        r.u8()                                       # spending_limit_dirty
        out["last_buyback_finalized_at"] = r.i64()
        out["typed_proposals_enabled"] = bool(r.u8())
        out["migrated"] = True
    except ValueError:
        out["migrated"] = False
    return out


def decode_b64(b64: str) -> bytes:
    return base64.b64decode(b64)
