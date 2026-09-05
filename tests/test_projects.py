import json

import pytest

from catalyst import projects


def _nav_html(nav):
    payload = {"props": {"pageProps": {"data": {"navData": nav}}}}
    return (
        '<html><script id="__NEXT_DATA__" type="application/json">'
        + json.dumps(payload)
        + "</script></html>"
    )


NAV = [
    {"_id": "2", "fundName": "Fund2", "challenges": [{"_id": "1", "slug": "challenge"}]},
    {
        "_id": "14",
        "fundName": "Fund14",
        "challenges": [
            {"_id": "3", "slug": "cardano-open-developers"},
            {"_id": "4", "slug": "cardano-open-ecosystem"},
        ],
    },
]


def _challenge(fund_id, slug, n_projects=1):
    return {
        "_id": "x",
        "fundId": fund_id,
        "name": slug,
        "slug": slug,
        "projects": [
            {
                "_fundingId": f"{fund_id}0000{i}",
                "fundId": fund_id,
                "projectName": f"P{i}",
                "projectSlug": f"p{i}",
                "country": "Japan",
            }
            for i in range(n_projects)
        ],
    }


def _fake_fetch_factory(fail_slugs=()):
    def fake(url, data=None, **kw):
        if data is None:
            return _nav_html(NAV)
        query = json.loads(data.decode("utf-8"))["query"]
        # クエリから slug と fundId を取り出す
        slug = query.split('slug: "')[1].split('"')[0]
        fund_id = query.split('fundId: "')[1].split('"')[0]
        if slug in fail_slugs:
            return json.dumps({"errors": [{"message": "boom"}]})
        return json.dumps({"data": {"challenge": _challenge(fund_id, slug, 2)}})

    return fake


def test_fetch_nav_reads_embedded_payload():
    nav = projects.fetch_nav(fetch=lambda url, **kw: _nav_html(NAV))
    assert [f["_id"] for f in nav] == ["2", "14"]


def test_fetch_nav_raises_without_payload():
    with pytest.raises(ValueError):
        projects.fetch_nav(fetch=lambda url, **kw: "<html>nothing</html>")


def test_fetch_challenge_interpolates_slug_and_fund():
    seen = {}

    def fake(url, data=None, **kw):
        seen["query"] = json.loads(data.decode("utf-8"))["query"]
        return json.dumps({"data": {"challenge": _challenge("14", "abc")}})

    got = projects.fetch_challenge("14", "abc", fetch=fake)
    assert got["fundId"] == "14"
    assert 'slug: "abc"' in seen["query"]
    assert 'fundId: "14"' in seen["query"]


def test_fetch_challenge_raises_on_graphql_error():
    def fake(url, data=None, **kw):
        return json.dumps({"errors": [{"message": "no"}], "data": None})

    with pytest.raises(ValueError):
        projects.fetch_challenge("14", "abc", fetch=fake)


def test_harvest_walks_every_challenge():
    out = projects.harvest(fetch=_fake_fetch_factory(), sleep=0)
    assert len(out["challenges"]) == 3
    assert out["failures"] == []
    total = sum(len(c["projects"]) for c in out["challenges"])
    assert total == 6


def test_harvest_records_failures_and_continues():
    # 1つの失敗で全体を捨てない。ただし黙って落とさない。
    out = projects.harvest(fetch=_fake_fetch_factory(fail_slugs={"cardano-open-developers"}), sleep=0)
    assert len(out["challenges"]) == 2
    assert len(out["failures"]) == 1
    assert out["failures"][0]["slug"] == "cardano-open-developers"


def test_harvest_raises_when_nothing_is_fetched():
    with pytest.raises(ValueError):
        projects.harvest(fetch=_fake_fetch_factory(fail_slugs={"challenge", "cardano-open-developers", "cardano-open-ecosystem"}), sleep=0)
