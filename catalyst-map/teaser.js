/* Catalyst Detailed Map — TOP のふるまい。
   地図とは無関係。数字を数え上げるのと、節を立ち上げるだけ。
   地図の実装はここに一行も無い（母体は region.js のみ）。 */
(function () {
  "use strict";

  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fmt = function (n) { return n.toLocaleString("en-US"); };

  /* 節の立ち上がり */
  var rise = document.querySelectorAll(".cm-in");
  if (still || !("IntersectionObserver" in window)) {
    for (var i = 0; i < rise.length; i++) rise[i].classList.add("cm-on");
  } else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("cm-on");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
    for (var j = 0; j < rise.length; j++) io.observe(rise[j]);
  }

  /* 計器を数え上げる */
  var meters = document.querySelectorAll("[data-count]");
  var count = function (el) {
    var to = parseInt(el.getAttribute("data-count"), 10);
    if (!isFinite(to)) return;
    if (still) { el.textContent = fmt(to); return; }
    var ms = 1100, t0 = null;
    var step = function (t) {
      if (t0 === null) t0 = t;
      var p = Math.min((t - t0) / ms, 1);
      var e = 1 - Math.pow(1 - p, 4);          /* 終わりに向かって静まる */
      el.textContent = fmt(Math.round(to * e));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  if (still || !("IntersectionObserver" in window)) {
    for (var k = 0; k < meters.length; k++) count(meters[k]);
  } else {
    var mo = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        count(e.target);
        mo.unobserve(e.target);
      });
    }, { threshold: 0.6 });
    for (var m = 0; m < meters.length; m++) {
      meters[m].textContent = "0";
      mo.observe(meters[m]);
    }
  }
})();
