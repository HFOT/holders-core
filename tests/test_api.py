from catalyst import api


def test_iter_proposal_pages_stops_at_last_page():
    pages = {
        1: {"current_page": 1, "last_page": 3, "total": 5, "data": [{"id": "a"}, {"id": "b"}]},
        2: {"current_page": 2, "last_page": 3, "total": 5, "data": [{"id": "c"}, {"id": "d"}]},
        3: {"current_page": 3, "last_page": 3, "total": 5, "data": [{"id": "e"}]},
    }
    calls = []

    def fake_fetch(url, *, opener=None):
        page = int(url.rsplit("page=", 1)[1])
        calls.append(page)
        return pages[page]

    got = list(api.iter_proposal_pages(fetch=fake_fetch, sleep=0))
    assert calls == [1, 2, 3]
    assert [p["id"] for page in got for p in page["data"]] == ["a", "b", "c", "d", "e"]


def test_fetch_all_proposals_flattens_pages():
    pages = {
        1: {"current_page": 1, "last_page": 2, "total": 3, "data": [{"id": "a"}, {"id": "b"}]},
        2: {"current_page": 2, "last_page": 2, "total": 3, "data": [{"id": "c"}]},
    }

    def fake_fetch(url, *, opener=None):
        return pages[int(url.rsplit("page=", 1)[1])]

    got = api.fetch_all_proposals(fetch=fake_fetch, sleep=0)
    assert [p["id"] for p in got] == ["a", "b", "c"]


def test_max_pages_limits_crawl():
    def fake_fetch(url, *, opener=None):
        page = int(url.rsplit("page=", 1)[1])
        return {"current_page": page, "last_page": 475, "total": 11385, "data": [{"id": str(page)}]}

    got = api.fetch_all_proposals(fetch=fake_fetch, sleep=0, max_pages=2)
    assert [p["id"] for p in got] == ["1", "2"]


def test_fetch_funds_returns_bare_list():
    def fake_fetch(url, *, opener=None):
        assert url == api.FUNDS_URL
        return [{"label": "Fund 15"}, {"label": "Fund 14"}]

    assert api.fetch_funds(fetch=fake_fetch) == [{"label": "Fund 15"}, {"label": "Fund 14"}]


def test_fetch_funds_unwraps_data_envelope():
    def fake_fetch(url, *, opener=None):
        assert url == api.FUNDS_URL
        return {"data": [{"label": "Fund 15"}], "links": {}, "meta": {}}

    assert api.fetch_funds(fetch=fake_fetch) == [{"label": "Fund 15"}]


def test_fetch_funds_missing_data_key_yields_empty_list():
    def fake_fetch(url, *, opener=None):
        return {"links": {}, "meta": {}}

    assert api.fetch_funds(fetch=fake_fetch) == []
