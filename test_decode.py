"""Offline checks against a real account fetched on 2026-11-14 (Umbra's DAO, BLkBSE96kQys7SrMioKxeMiVbeo4Ckk2Y4n1JphKxYnv).
Expected values are the ones MetaDAO shows publicly for Umbra: token mint, treasury vault, $100K monthly limit."""
import os
import sys

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "collector"))
from decode import b58encode, decode_b64, decode_dao  # noqa: E402


def test_umbra_dao():
    raw = decode_b64(open(os.path.join(HERE, "fixtures", "umbra_dao.b64")).read().strip())
    d = decode_dao(raw)
    assert d["base_mint"] == "PRVT6TB7uss3FrUd2D9xs2zqDBsa3GbMJMwCQsgmeta"
    assert d["quote_mint"] == "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"  # USDC
    assert d["treasury_vault"] == "6VsC8PuKkXm5xo54c2vbrAaSfQipkpGHqNuKTxXFySx6"
    assert d["spending_limit"]["amount_per_month"] == 100_000 * 10**6
    assert d["migrated"] is True


def test_b58_leading_zeros():
    assert b58encode(b"\0\0\x01") == "112"


if __name__ == "__main__":
    test_umbra_dao()
    test_b58_leading_zeros()
    print("PASS")
