"""世界地図の形。Natural Earth の国境（パブリックドメイン）を SVG のパスに変換する。

地図を描くために必要なのは国の形だけであり、Catalyst のデータは一切入らない。
形と数字は別のファイルに置く（`site/data/world.json` と `site/data/geo.json`）。

投影は Miller cylindrical。緯度は ±85 度で切る。南極は落とす（Catalyst の記録が無く、
円筒図法では端が極端に伸びるため）。落としたことは出力に記録する。

外部の描画ライブラリは使わない。site は依存ゼロのままにする。
"""
from __future__ import annotations

import json
import math
import urllib.request
from typing import Any, Callable

SOURCE_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"
SOURCE_CREDIT = "Natural Earth（パブリックドメイン）／ world-atlas 50m"
USER_AGENT = "holders-core/0.1 (Catalyst matome; contact via repo)"

# 円筒図法で端が伸びきる緯度。ここで切る。
LAT_LIMIT = 85.0
# 描かない地物。記録が無く、図法の端で極端に伸びるもの。
DROP = {"Antarctica"}

WIDTH = 2000.0
# 出力座標の丸め（小数1桁）で消える程度の細部は落とす。
EPSILON = 0.6


def fetch_topology(url: str = SOURCE_URL, *, opener: Any = None) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    open_fn = opener or urllib.request.urlopen
    with open_fn(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def harvest(*, fetch: Callable[..., dict] = fetch_topology) -> dict:
    topo = fetch()
    if topo.get("type") != "Topology" or "countries" not in topo.get("objects", {}):
        raise ValueError("topojson の構造が違う。取得元が変わった可能性がある")
    return topo


# --- topojson の展開 --------------------------------------------------------


def decode_arcs(topo: dict) -> list[list[tuple[float, float]]]:
    """デルタ符号化された arc を経緯度の並びに戻す。"""
    tr = topo.get("transform")
    out = []
    for arc in topo["arcs"]:
        pts = []
        x = y = 0
        for dx, dy in arc:
            if tr:
                x += dx
                y += dy
                pts.append(
                    (x * tr["scale"][0] + tr["translate"][0], y * tr["scale"][1] + tr["translate"][1])
                )
            else:
                pts.append((dx, dy))
        out.append(pts)
    return out


def _ring(arc_ids: list[int], arcs: list[list]) -> list[tuple[float, float]]:
    """arc の並びを一つの環に繋ぐ。負の番号は逆向きを指す。"""
    ring: list[tuple[float, float]] = []
    for i in arc_ids:
        pts = arcs[i] if i >= 0 else arcs[~i][::-1]
        ring.extend(pts[1:] if ring else pts)
    return ring


def split_antimeridian(ring: list[tuple[float, float]]) -> list[list[tuple[float, float]]]:
    """経度180度をまたぐ環を切り分ける。

    ロシアやフィジーは環の中で経度が +180 から -180 へ飛ぶ。そのまま平面に置くと、
    地図を横断する帯になる。飛んだところで環を切る。

    ただし切っただけでは、断片が始点と終点を直線で結ばれて閉じるため、
    地図を斜めに走る線が残る。切り口には経度 ±180 上の点を補い、
    それぞれの断片が地図の端（経線）に沿って閉じるようにする。
    補う点の緯度は、またいだ2点の間を経度で内分して求める。位置を作っているのではなく、
    元の線分が経線と交わる場所である。
    """
    closed = bool(ring) and ring[0] == ring[-1]
    pieces: list[list[tuple[float, float]]] = [[]]
    prev = None
    for pt in ring:
        if prev is not None and abs(pt[0] - prev[0]) > 180:
            # またぐ向き。prev が東(+)なら +180 側へ抜ける。
            east = 1.0 if prev[0] > 0 else -1.0
            # 連続になるよう pt を ±360 ずらしてから内分する。
            shifted = pt[0] + 360.0 * east
            span = shifted - prev[0]
            t = (180.0 * east - prev[0]) / span if span else 0.0
            lat = prev[1] + (pt[1] - prev[1]) * t
            pieces[-1].append((180.0 * east, lat))
            pieces.append([(-180.0 * east, lat)])
        pieces[-1].append(pt)
        prev = pt

    # 環はひと回りして始点に戻る。切った場合、最後の断片は最初の断片の続きなので繋ぎ直す。
    # これをしないと、本土が二つの断片に割れ、それぞれを閉じる線が本土を斜めに横断する。
    # 繋ぐのは環が閉じているときだけ（実データの環は必ず閉じている）。
    if closed and len(pieces) > 1:
        tail = pieces.pop()
        head = pieces[0]
        if tail and head and tail[-1] == head[0]:
            pieces[0] = tail + head[1:]
        else:
            pieces[0] = tail + head
    return [p for p in pieces if len(p) >= 3]


def rings_of(geom: dict, arcs: list[list]) -> list[list[tuple[float, float]]]:
    kind = geom.get("type")
    if kind == "Polygon":
        raw = [_ring(r, arcs) for r in geom["arcs"]]
    elif kind == "MultiPolygon":
        raw = [_ring(r, arcs) for poly in geom["arcs"] for r in poly]
    else:
        return []
    return [piece for ring in raw for piece in split_antimeridian(ring)]


# --- 投影と簡略化 -----------------------------------------------------------


def miller(lon: float, lat: float) -> tuple[float, float]:
    lat = max(-LAT_LIMIT, min(LAT_LIMIT, lat))
    x = math.radians(lon)
    y = 1.25 * math.log(math.tan(math.pi / 4 + 0.4 * math.radians(lat)))
    return x, y


def _dp(points: list[tuple[float, float]], eps: float) -> list[tuple[float, float]]:
    """Douglas–Peucker。形の意味が変わらない範囲で点を減らす。"""
    if len(points) < 3:
        return points
    ax, ay = points[0]
    bx, by = points[-1]
    dx, dy = bx - ax, by - ay
    den = math.hypot(dx, dy)
    far, dist = 0, -1.0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        d = (
            abs(dx * (ay - py) - (ax - px) * dy) / den
            if den
            else math.hypot(px - ax, py - ay)
        )
        if d > dist:
            far, dist = i, d
    if dist <= eps:
        return [points[0], points[-1]]
    return _dp(points[: far + 1], eps)[:-1] + _dp(points[far:], eps)


def build(topo: dict, *, width: float = WIDTH, epsilon: float = EPSILON) -> dict:
    """国ごとの SVG パスを作る。名前は Natural Earth の表記のまま使う。"""
    arcs = decode_arcs(topo)
    geoms = [
        g
        for g in topo["objects"]["countries"]["geometries"]
        if g.get("properties", {}).get("name") not in DROP
    ]

    projected = [[miller(*p) for p in ring] for g in geoms for ring in rings_of(g, arcs)]
    if not projected:
        raise ValueError("国が一つも展開できなかった")

    xs = [x for ring in projected for x, _ in ring]
    ys = [y for ring in projected for _, y in ring]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    scale = width / (x1 - x0)
    height = (y1 - y0) * scale

    def to_px(p: tuple[float, float]) -> tuple[float, float]:
        x, y = p
        # SVG の y は下向き。投影の y は上向きなので反転する。
        return ((x - x0) * scale, (y1 - y) * scale)

    countries: dict[str, dict] = {}
    dropped_rings = 0
    for g in geoms:
        name = g["properties"]["name"]
        parts = []
        px_rings = [[to_px(miller(*p)) for p in ring] for ring in rings_of(g, arcs)]
        for ring in px_rings:
            pts = _dp(ring, epsilon)
            if len(pts) < 3:
                dropped_rings += 1
                continue
            head = f"M{pts[0][0]:.1f} {pts[0][1]:.1f}"
            body = "".join(f"L{x:.1f} {y:.1f}" for x, y in pts[1:])
            parts.append(head + body + "Z")

        # 面が消えるほど小さい国も落とさない。点で置けるように重心と大きさを残す。
        flat = [p for ring in px_rings for p in ring]
        if not flat:
            continue
        bx0 = min(x for x, _ in flat)
        bx1 = max(x for x, _ in flat)
        by0 = min(y for _, y in flat)
        by1 = max(y for _, y in flat)
        # 主たる島（点数が最も多い環）の中心。飛び地に引っ張られないようにする。
        main = max(px_rings, key=len)
        cx = (min(x for x, _ in main) + max(x for x, _ in main)) / 2
        cy = (min(y for _, y in main) + max(y for _, y in main)) / 2

        row = {
            "id": g.get("id"),
            "c": [round(cx, 1), round(cy, 1)],
            "size": round(max(bx1 - bx0, by1 - by0), 1),
        }
        if parts:
            row["d"] = "".join(parts)
        countries[name] = row

    return {
        "credit": SOURCE_CREDIT,
        "url": SOURCE_URL,
        "projection": "miller",
        "lat_limit": LAT_LIMIT,
        "dropped": sorted(DROP),
        "dropped_rings": dropped_rings,
        "view_box": f"0 0 {width:.0f} {height:.0f}",
        "countries": countries,
    }
