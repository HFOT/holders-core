import json

import pytest

from catalyst import geo


def _country(name, funded=1, distributed=100, **counts):
    base = {
        "totalProjectsFunded": funded,
        "totalProjectsCompleted": counts.get("completed", 0),
        "totalProjectsInProgress": counts.get("in_progress", 0),
        "totalProjectsCancelled": counts.get("cancelled", 0),
        "totalProjectsOnboarding": counts.get("onboarding", 0),
    }
    return {
        "name": name,
        "slug": name.lower().replace(" ", "-"),
        "counts": base,
        "funding": {
            "totalDistributedToDate": [{"amount": str(distributed), "exp": 2, "code": "USD"}],
            "totalRequested": [{"amount": str(distributed), "exp": 2, "code": "USD"}],
            "totalRemaining": [{"amount": "0", "exp": 2, "code": "USD"}],
        },
    }


def _continent(name, countries, funded=None):
    total = sum(c["counts"]["totalProjectsFunded"] for c in countries) if funded is None else funded
    return {
        "name": name,
        "slug": name.lower().replace(" ", "-"),
        "counts": {
            "totalProjectsFunded": total,
            "totalProjectsCompleted": 0,
            "totalProjectsInProgress": 0,
            "totalProjectsCancelled": 0,
            "totalProjectsOnboarding": 0,
        },
        "funding": {
            "totalDistributedToDate": [{"amount": "0", "exp": 2, "code": "USD"}],
            "totalRequested": [{"amount": "0", "exp": 2, "code": "USD"}],
            "totalRemaining": [{"amount": "0", "exp": 2, "code": "USD"}],
        },
        "countries": countries,
    }


def _html(continents):
    payload = {"props": {"pageProps": {"data": {"continents": continents}}}}
    return (
        '<html><body><script id="__NEXT_DATA__" type="application/json">'
        + json.dumps(payload)
        + "</script></body></html>"
    )


def test_extract_reads_embedded_payload():
    conts = [_continent("Asia", [_country("Japan")])]
    assert geo.extract(_html(conts))[0]["name"] == "Asia"


def test_extract_raises_when_payload_missing():
    # 構造が変わったら推測で補わずに止める。
    with pytest.raises(ValueError):
        geo.extract("<html><body>no data here</body></html>")


def test_extract_raises_when_continents_empty():
    with pytest.raises(ValueError):
        geo.extract(_html([]))


def test_shape_marks_duplicate_across_continents():
    conts = [
        _continent("North America", [_country("USA", funded=5)]),
        _continent("South America", [_country("USA", funded=5)]),
    ]
    out = geo.shape(conts)
    assert all("duplicate" in c["flags"] for c in out["countries"])
    # 値は書き換えない。二重のまま合計に出る。
    assert out["totals"]["country_funded"] == 10
    assert out["totals"]["rows"] == 2
    assert out["totals"]["distinct_names"] == 1


def test_shape_marks_case_variant():
    conts = [_continent("Europe", [_country("Czech Republic"), _country("Czech republic")])]
    flags = [c["flags"] for c in geo.shape(conts)["countries"]]
    assert all("case_variant" in f for f in flags)
    assert all("duplicate" not in f for f in flags)


def test_shape_marks_continent_name_used_as_country():
    conts = [_continent("North America", [_country("North America"), _country("Canada")])]
    by_name = {c["name"]: c for c in geo.shape(conts)["countries"]}
    assert "continent_as_country" in by_name["North America"]["flags"]
    assert by_name["Canada"]["flags"] == []


def test_shape_applies_manual_notes_case_insensitively():
    conts = [_continent("North America", [_country("Texas")])]
    out = geo.shape(conts, {"texas": ["not_a_country"]})
    assert out["countries"][0]["flags"] == ["not_a_country"]


def test_shape_reports_continent_and_country_mismatch():
    conts = [_continent("Europe", [_country("France", funded=3)], funded=1)]
    cont = geo.shape(conts)["continents"][0]
    assert cont["counts"]["funded"] == 1
    assert cont["rows_sum_funded"] == 3
    assert cont["rows_listed"] == 1


def test_shape_keeps_money_in_minor_units():
    conts = [_continent("Asia", [_country("Japan", distributed=250000)])]
    out = geo.shape(conts)
    assert out["countries"][0]["funding"]["distributed"] == 250000
    assert out["totals"]["country_distributed"] == 250000


def test_shape_rejects_non_usd():
    country = _country("Japan")
    country["funding"]["totalDistributedToDate"] = [{"amount": "1", "exp": 2, "code": "JPY"}]
    # 換算はしない。通貨が増えたら止める。
    with pytest.raises(ValueError):
        geo.shape([_continent("Asia", [country])])


def test_shape_keeps_every_row():
    conts = [
        _continent("Europe", [_country("France"), _country("Spain")]),
        _continent("Asia", [_country("Japan")]),
    ]
    out = geo.shape(conts)
    assert [c["name"] for c in out["countries"]] == ["France", "Spain", "Japan"]
    assert [c["continent"] for c in out["countries"]] == ["Europe", "Europe", "Asia"]


def test_shape_labels_continents_in_japanese():
    # 大陸の並べ方は表示側の話なので、ここでは持たない。
    out = geo.shape([_continent("Oceania", [_country("Australia")])])
    assert out["continents"][0]["name_ja"] == "オセアニア"
