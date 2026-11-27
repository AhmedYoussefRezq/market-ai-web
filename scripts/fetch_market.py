# -*- coding: utf-8 -*-
"""Generate data/market.json for GitHub Pages. Runs inside GitHub Actions."""
import datetime
import json
import os
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "data", "market.json")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

SYMBOLS = {
    "XAUUSD": ("GC=F", "gold price XAUUSD"),
    "XAGUSD": ("SI=F", "silver price XAGUSD"),
    "EURUSD": ("EURUSD=X", "EUR USD forex"),
    "GBPUSD": ("GBPUSD=X", "GBP USD forex"),
    "USDJPY": ("USDJPY=X", "USD JPY forex"),
    "BTCUSD": ("BTC-USD", "Bitcoin BTC price"),
    "ETHUSD": ("ETH-USD", "Ethereum ETH price"),
    "US500": ("^GSPC", "S&P 500 stock market"),
    "US30": ("^DJI", "Dow Jones stock market"),
    "NAS100": ("^IXIC", "Nasdaq stock market"),
    "VIX": ("^VIX", "VIX volatility market"),
    "DXY": ("DX-Y.NYB", "US dollar index DXY"),
    "US10Y": ("^TNX", "US treasury yields"),
    "WTI": ("CL=F", "crude oil price"),
}
MACRO = ["DXY", "US10Y", "VIX", "US500", "BTCUSD", "WTI"]


def get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def candles(yahoo, interval="60m", rng="3mo"):
    q = urllib.parse.quote(yahoo, safe="")
    data = json.loads(get(f"https://query1.finance.yahoo.com/v8/finance/chart/{q}?range={rng}&interval={interval}"))
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
        out.append({"t": ts, "o": o, "h": h, "l": l, "c": c})
    return out


def ema(vals, p):
    if not vals:
        return None
    k = 2 / (p + 1)
    e = vals[0]
    for v in vals[1:]:
        e = v * k + e * (1 - k)
    return e


def ind(cs):
    if not cs:
        return {}
    cl = [c["c"] for c in cs]
    last = cl[-1]
    prev = cl[-2] if len(cl) > 1 else last
    r = None
    if len(cl) > 14:
        g = l = 0.0
        for i in range(-14, 0):
            d = cl[i] - cl[i - 1]
            g += max(d, 0)
            l += max(-d, 0)
        r = 100 if l == 0 else 100 - 100 / (1 + (g / 14) / (l / 14))
    e20, s50 = ema(cl, 20), (sum(cl[-50:]) / 50 if len(cl) >= 50 else None)
    return {
        "last": round(last, 4), "previous": round(prev, 4),
        "change_pct": round((last - prev) / prev * 100, 3) if prev else 0,
        "ema20": round(e20, 4) if e20 else None,
        "ema50": round(ema(cl, 50), 4) if ema(cl, 50) else None,
        "rsi14": round(r, 1) if r is not None else None,
        "high20": round(max(c["h"] for c in cs[-20:]), 4),
        "low20": round(min(c["l"] for c in cs[-20:]), 4),
        "bars": len(cs),
        "trend": ("bullish" if e20 > s50 and last > e20 else "bearish" if e20 < s50 and last < e20 else "mixed") if e20 and s50 else "unknown",
    }


def news(query, limit=8):
    url = "https://news.google.com/rss/search?q=" + urllib.parse.quote(query) + "&hl=en-US&gl=US&ceid=US:en"
    try:
        root = ET.fromstring(get(url, 15))
    except Exception:
        return []
    out = []
    for item in root.findall(".//item")[:limit]:
        source = item.find("source")
        out.append({"title": (item.findtext("title") or "")[:220],
                    "link": item.findtext("link") or "",
                    "published": item.findtext("pubDate") or "",
                    "source": (source.text if source is not None else "") or ""})
    return out


def main():
    result = {"generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
              "symbols": {}, "macro": [], "source": "GitHub Actions scheduled fetch"}
    macro = []
    for sym in MACRO:
        try:
            i = ind(candles(SYMBOLS[sym][0], "1d", "1mo"))
            if i.get("last"):
                macro.append({"symbol": sym, "label": sym, "price": i["last"],
                              "change_pct": i["change_pct"], "trend": i["trend"]})
        except Exception:
            continue
    result["macro"] = macro
    for sym, (yahoo, query) in SYMBOLS.items():
        try:
            cs = candles(yahoo)
        except Exception:
            cs = []
        i = ind(cs)
        recent = [{"t": datetime.datetime.utcfromtimestamp(c["t"]).strftime("%Y-%m-%d %H:%M"),
                   "o": round(c["o"], 4), "h": round(c["h"], 4),
                   "l": round(c["l"], 4), "c": round(c["c"], 4)} for c in cs[-16:]]
        result["symbols"][sym] = {
            "indicators": i, "recent_candles": recent,
            "news": news(query), "interval": "H1",
            "generated_at": result["generated_at"],
        }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    print(f"Wrote {OUT} with {len(result['symbols'])} symbols, {len(macro)} macro, at {result['generated_at']}")


if __name__ == "__main__":
    main()
