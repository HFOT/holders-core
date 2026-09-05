import math

import pytest

from catalyst import world


def _topo(geometries, arcs):
    return {
        "type": "Topology",
        "transform": None,
        "arcs": arcs,
        "objects": {"countries": {"type": "GeometryCollection", "geometries": geometries}},
    }


def _square(lon0, lat0, size):
    return [
        [lon0, lat0],
        [lon0 + size, lat0],
        [lon0 + size, lat0 + size],
        [lon0, lat0 + size],
        [lon0, lat0],
    ]


def test_decode_arcs_undoes_delta_encoding():
    topo = {
        "arcs": [[[0, 0], [10, 20], [10, -10]]],
        "transform": {"scale": [0.5, 0.25], "translate": [-100, -50]},
    }
    assert world.decode_arcs(topo) == [[(-100.0, -50.0), (-95.0, -45.0), (-90.0, -47.5)]]


def test_ring_follows_reversed_arcs():
    arcs = [[(0, 0), (1, 1)], [(1, 1), (2, 2)]]
    # ~1 は 1 番の arc を逆向きに辿るという意味。
    assert world._ring([0, 1], arcs) == [(0, 0), (1, 1), (2, 2)]
    assert world._ring([1, ~0], arcs) == [(1, 1), (2, 2), (0, 0)]


def test_miller_clamps_at_the_pole():
    # 極を含めると円筒図法では無限に伸びる。切っていることを確かめる。
    assert world.miller(0, 90) == world.miller(0, world.LAT_LIMIT)
    assert world.miller(0, -90) == world.miller(0, -world.LAT_LIMIT)


def test_miller_keeps_longitude_order_and_flips_nothing():
    x_west, _ = world.miller(-100, 0)
    x_east, _ = world.miller(100, 0)
    assert x_west < x_east
    _, y_north = world.miller(0, 60)
    _, y_south = world.miller(0, -60)
    assert y_north > y_south
    x0, y0 = world.miller(0, 0)
    assert x0 == pytest.approx(0.0, abs=1e-12)
    assert y0 == pytest.approx(0.0, abs=1e-12)


def test_split_antimeridian_cuts_the_jump():
    # 経度が +180 を越えて -180 へ飛ぶ環。そのままだと地図を横断する帯になる。
    east = [(170, 60), (178, 62), (179, 61), (176, 58)]
    west = [(-179, 61), (-176, 62), (-172, 60), (-178, 58)]
    pieces = world.split_antimeridian(east + west + [east[0]])
    assert len(pieces) == 2
    for piece in pieces:
        assert max(p[0] for p in piece) - min(p[0] for p in piece) <= 180
    assert all(p[0] > 0 for p in pieces[0])
    assert all(p[0] < 0 for p in pieces[1])


def test_split_antimeridian_drops_slivers_left_by_the_cut():
    # 切った結果2点以下になった断片は面にならないので落とす。
    ring = [(179, 10), (-179, 10), (-178, 11), (-177, 12), (-176, 10), (-179, 9)]
    pieces = world.split_antimeridian(ring)
    assert len(pieces) == 1
    assert all(p[0] < 0 for p in pieces[0])


def test_split_antimeridian_rejoins_the_wrapped_mainland():
    # 閉じた環の始点が本土の途中にある場合、切ると本土が前半と後半に割れる。
    # 二つは続きなので、ひと回りぶんを繋ぎ直して一つの断片に戻す。
    ring = [
        (100, 50), (170, 55), (179, 56),   # 本土・東へ
        (-179, 56), (-170, 57), (-179, 58),  # 飛び地側
        (179, 58), (120, 60), (100, 50),   # 本土へ戻る
    ]
    pieces = world.split_antimeridian(ring)
    assert len(pieces) == 2
    east = next(p for p in pieces if any(x == 100 for x, _ in p))
    west = next(p for p in pieces if p is not east)
    # 本土は一つの断片に戻り、切り口は経度180の点で終わる
    assert all(x > 0 for x, _ in east)
    assert east[0][0] == 180 and east[-1][0] == 180
    assert all(x < 0 for x, _ in west)


def test_split_antimeridian_leaves_ordinary_rings_alone():
    ring = [tuple(p) for p in _square(10, 10, 5)]
    assert world.split_antimeridian(ring) == [ring]


def test_dp_keeps_the_corners_of_a_square():
    pts = [(0, 0), (5, 0.1), (10, 0), (10, 10), (0, 10), (0, 0)]
    kept = world._dp(pts, 0.6)
    assert (5, 0.1) not in kept
    assert (10, 10) in kept and (0, 10) in kept


def test_build_emits_paths_and_centres():
    arcs = [[tuple(p) for p in _square(0, 0, 20)]]
    topo = _topo(
        [{"type": "Polygon", "id": "1", "arcs": [[0]], "properties": {"name": "Boxland"}}], arcs
    )
    out = world.build(topo, width=1000, epsilon=0.1)
    row = out["countries"]["Boxland"]
    assert row["d"].startswith("M") and row["d"].endswith("Z")
    assert row["id"] == "1"
    assert len(row["c"]) == 2
    assert row["size"] > 0
    assert out["view_box"].startswith("0 0 1000 ")


def test_build_drops_antarctica_but_records_it():
    arcs = [[tuple(p) for p in _square(0, 0, 20)], [tuple(p) for p in _square(0, -80, 5)]]
    topo = _topo(
        [
            {"type": "Polygon", "arcs": [[0]], "properties": {"name": "Boxland"}},
            {"type": "Polygon", "arcs": [[1]], "properties": {"name": "Antarctica"}},
        ],
        arcs,
    )
    out = world.build(topo, width=1000, epsilon=0.1)
    assert "Antarctica" not in out["countries"]
    assert out["dropped"] == ["Antarctica"]


def test_build_keeps_a_country_too_small_to_draw():
    # 面が消えるほど小さい国も落とさない。点で置けるように重心だけ残す。
    arcs = [[tuple(p) for p in _square(0, 0, 40)], [tuple(p) for p in _square(10, 10, 0.001)]]
    topo = _topo(
        [
            {"type": "Polygon", "arcs": [[0]], "properties": {"name": "Boxland"}},
            {"type": "Polygon", "arcs": [[1]], "properties": {"name": "Tinyland"}},
        ],
        arcs,
    )
    out = world.build(topo, width=200, epsilon=1.0)
    tiny = out["countries"]["Tinyland"]
    assert "d" not in tiny
    assert tiny["size"] < 1
    assert len(tiny["c"]) == 2


def test_build_raises_when_nothing_can_be_drawn():
    with pytest.raises(ValueError):
        world.build(_topo([], []), width=100)


def test_harvest_rejects_a_payload_that_is_not_a_topology():
    with pytest.raises(ValueError):
        world.harvest(fetch=lambda: {"type": "FeatureCollection"})


def test_harvest_passes_a_valid_topology_through():
    topo = _topo([], [])
    assert world.harvest(fetch=lambda: topo) is topo


def test_projection_matches_the_published_miller_formula():
    lon, lat = 45.0, 30.0
    x, y = world.miller(lon, lat)
    assert x == pytest.approx(math.radians(lon))
    assert y == pytest.approx(1.25 * math.log(math.tan(math.pi / 4 + 0.4 * math.radians(lat))))
