from catalyst import prices


PR = {"2024-03-01": 1.00, "2024-03-05": 2.00, "2024-03-20": 5.00}


def test_exact_day_wins():
    assert prices.price_on(PR, "2024-03-01") == 1.00


def test_missing_day_is_interpolated_between_neighbours():
    # 3/1=1.00 と 3/5=2.00 の間。距離で按分する。
    assert prices.price_on(PR, "2024-03-02") == 1.25
    assert prices.price_on(PR, "2024-03-03") == 1.50
    assert prices.price_on(PR, "2024-03-04") == 1.75


def test_only_one_side_available_uses_that_value():
    # 3/5 の後ろは 3/20 で 7日より遠い。前だけを使う。
    assert prices.price_on(PR, "2024-03-08") == 2.00
    # 3/1 より前には何も無い。後ろだけを使う。
    assert prices.price_on(PR, "2024-02-28") == 1.00


def test_too_far_from_any_record_is_not_filled():
    # 3/13 は前が 3/5（8日前）、後ろが 3/20（7日後）。前は範囲外なので後ろだけを使う。
    assert prices.price_on(PR, "2024-03-13") == 5.00
    # 3/12 は前が 3/5（ちょうど7日前）なので、まだ届く。
    assert prices.price_on(PR, "2024-03-12") == 2.00


def test_nothing_within_reach_is_left_unknown():
    # 前も後ろも 7日より遠ければ埋めない。分からないものは分からないままにする。
    pr = {"2024-01-01": 1.0, "2024-12-31": 9.0}
    assert prices.price_on(pr, "2024-06-15") is None


def test_bad_input_is_not_guessed():
    assert prices.price_on(PR, None) is None
    assert prices.price_on(PR, "not-a-date") is None
    assert prices.price_on({}, "2024-03-01") is None


def test_iso_timestamps_are_accepted():
    assert prices.price_on(PR, "2024-03-01T10:00:00+00:00") == 1.00


def test_interpolation_leans_towards_the_nearer_record():
    pr = {"2024-06-01": 0.0, "2024-06-07": 6.0}
    # 6/02 は前に1日・後ろに5日。近い前の側へ寄る。
    assert prices.price_on(pr, "2024-06-02") == 1.0
    # 6/06 は後ろに1日。近い後ろの側へ寄る。
    assert prices.price_on(pr, "2024-06-06") == 5.0


def test_one_sided_when_the_other_side_is_out_of_range():
    # 前が範囲内、後ろが 7日より遠いときは、前だけを使う。
    pr = {"2024-06-01": 0.0, "2024-06-11": 10.0}
    assert prices.price_on(pr, "2024-06-02") == 0.0
