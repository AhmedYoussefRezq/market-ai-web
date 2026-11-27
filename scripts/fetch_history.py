# -*- coding: utf-8 -*-
"""Build data/history/<SYMBOL>.json: compact historical candles for the rule-based backtest.

Run locally (or manually from Actions later):
    python scripts/fetch_history.py
"""
import datetime
import json
import os
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_DIR = os.path.join(ROOT, "data", "history")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

SYMBOLS = {
    "XAUUSD": "GC=F", "XAGUSD": "SI=F", "EURUSD": "EURUSD=X", "GBPUSD": "GBPUSD=X",
    "USDJPY": "USDJPY=X", "BTCUSD": "BTC-USD", "ETHUSD": "ETH-USD",
    "US500": "^GSPC", "US30": "^DJI", "NAS100": "^IXIC", "VIX": "^VIX",
    "DXY": "DX-Y.NYB", "US10Y": "^TNX", "WTI": "CL=F",
}
H1_SYMBOLS = {"XAUUSD", "EURUSD", "BTCUSD", "US500"}


def get(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def fetch(yahoo, interval, rng):
    q = urllib.parse.quote(yahoo, safe="")
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{q}"
           f"?range={rng}&interval={interval}&includePrePost=false")
    data = json.loads(get(url))
    res = ((data.get("chart") or {}).get("result") or [None])[0]
    if not res:
        return []
    quote = ((res.get("indicators") or {}).get("quote") or [{}])[0]
    out = []
    for i, ts in enumerate(res.get("timestamp") or []):
        try:
            c = float(quote["close"][i])
            o = float(quote["open"][i] if quote["open"][i] is not None else c)
            h = float(quote["high"][i] if quote["high"][i] is not None else max(o, c))
            l = float(quote["low"][i] if quote["low"][i] is not None else min(o, c))
        except (TypeError, ValueError, IndexError, KeyError):
            continue
        out.append([int(ts), round(o, 4), round(h, 4), round(l, 4), round(c, 4)])
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    generated = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    total = 0
    for sym, yahoo in SYMBOLS.items():
        entry = {"generated_at": generated, "symbol": sym,
                 "source": "Yahoo Finance historical snapshot",
                 "format": "[timestamp, open, high, low, close]"}
        try:
            entry["D1"] = fetch(yahoo, "1d", "5y")
        except Exception as exc:
            print(f"{sym} D1 failed: {exc}")
            entry["D1"] = []
        if sym in H1_SYMBOLS:
            try:
                entry["H1"] = fetch(yahoo, "60m", "6mo")
            except Exception as exc:
                print(f"{sym} H1 failed: {exc}")
                entry["H1"] = []
        path = os.path.join(OUT_DIR, sym + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(entry, f, ensure_ascii=False, separators=(",", ":"))
        size = os.path.getsize(path) / 1024
        total += size
        print(f"{sym}: D1={len(entry['D1'])}" + (f" H1={len(entry.get('H1', []))}" if sym in H1_SYMBOLS else "") + f" ({size:.0f} KB)")
        time.sleep(0.4)
    print(f"Wrote {len(SYMBOLS)} files to {OUT_DIR} ({total:.0f} KB)")


if __name__ == "__main__":
    main()
