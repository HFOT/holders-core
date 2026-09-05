/* 地域の層 — 世界地図から国ごとにプロジェクトを辿る。
   国・状態・金額・投票は projectcatalyst.io の記録のまま。値は直さない。
   提案者名は台帳（Catalyst Explorer）との突き合わせ。一致しなければ名前なしのまま出す。
   外部ライブラリは使わない。地図は SVG の viewBox を動かすだけ。 */

const FLAG_TEXT = {
  duplicate: "同じ名前が二つの地域に置かれている",
  case_variant: "同じ国が表記違いで二行になっている",
  continent_as_country: "地域名が国として記録されている",
  not_a_country: "国ではない",
};

const STATUS_JA = {
  Completed: "完了",
  Active: "進行中",
  Cancelled: "中止",
  Funded: "採択",
  Onboarding: "着手前",
  Native: "ネイティブ",
};

const METRICS = {
  funded: { label: "採択", note: "濃さは採択されたプロジェクトの数。" },
  completed: { label: "完了", note: "濃さは完了と記録されたプロジェクトの数。" },
  cancelled: { label: "中止", note: "濃さは中止と記録されたプロジェクトの数。多い少ないは、それ自体では評価にならない。" },
  dist: { label: "配分額", note: "円の大きさは申請額、色の付いた扇はそのうち配分済みの割合。寄ると国ピンに採択数が出る。" },
};

/* 国名の日本語表記。表示専用であり、記録（英語）は書き換えない。 */
const COUNTRY_JA = {
  Argentina: "アルゼンチン", Australia: "オーストラリア", Austria: "オーストリア",
  Belgium: "ベルギー", Belize: "ベリーズ", Bermuda: "バミューダ", Bolivia: "ボリビア",
  Brazil: "ブラジル", "British Virgin Islands": "英領ヴァージン諸島", Bulgaria: "ブルガリア",
  "Burkina Faso": "ブルキナファソ", Cameroon: "カメルーン", Canada: "カナダ",
  "Cayman Islands": "ケイマン諸島", Chile: "チリ", Colombia: "コロンビア",
  "Costa Rica": "コスタリカ", Croatia: "クロアチア", Cyprus: "キプロス",
  "Czech Republic": "チェコ", "Czech republic": "チェコ",
  "Democratic Republic of Congo": "コンゴ民主共和国", Denmark: "デンマーク",
  Ecuador: "エクアドル", Estonia: "エストニア", Ethiopia: "エチオピア",
  Finland: "フィンランド", France: "フランス", Gabon: "ガボン", Georgia: "ジョージア",
  Germany: "ドイツ", Ghana: "ガーナ", Gibraltar: "ジブラルタル", Greece: "ギリシャ",
  "Hong Kong": "香港", Hungary: "ハンガリー", India: "インド", Indonesia: "インドネシア",
  Ireland: "アイルランド", Israel: "イスラエル", Italy: "イタリア", Jamaica: "ジャマイカ",
  Japan: "日本", Kenya: "ケニア", Latvia: "ラトビア", Liechtenstein: "リヒテンシュタイン",
  Lithuania: "リトアニア", Malaysia: "マレーシア", Malta: "マルタ",
  "Marshall Islands": "マーシャル諸島", Mauritius: "モーリシャス", Mexico: "メキシコ",
  Moldova: "モルドバ", Monaco: "モナコ", Morocco: "モロッコ", Mozambique: "モザンビーク",
  Nepal: "ネパール", Netherlands: "オランダ", "New Zealand": "ニュージーランド",
  Nigeria: "ナイジェリア", "North America": "北アメリカ", Norway: "ノルウェー",
  Peru: "ペルー", Philippines: "フィリピン", Poland: "ポーランド", Portugal: "ポルトガル",
  "Puerto Rico": "プエルトリコ", Romania: "ルーマニア", Russia: "ロシア",
  Rwanda: "ルワンダ", Serbia: "セルビア", Seychelles: "セーシェル",
  Singapore: "シンガポール", Slovakia: "スロバキア", Slovenia: "スロベニア",
  "South Africa": "南アフリカ", "South Korea": "韓国", Spain: "スペイン",
  "Sri Lanka": "スリランカ", "St. Vincent": "セントビンセント", Sweden: "スウェーデン",
  Switzerland: "スイス", Taiwan: "台湾", Tanzania: "タンザニア", Texas: "テキサス",
  Tunisia: "チュニジア", Turkey: "トルコ", Uganda: "ウガンダ", Ukraine: "ウクライナ",
  "United Arab Emirates": "アラブ首長国連邦", "United Kingdom": "イギリス",
  USA: "アメリカ", Uruguay: "ウルグアイ", Venezuela: "ベネズエラ", Vietnam: "ベトナム",
  Zimbabwe: "ジンバブエ",
};

const SVG_NS = "http://www.w3.org/2000/svg";
const BINS = 5;
const PAGE = 60;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
const num = (n) => (n ?? 0).toLocaleString("en-US");
const usdCents = (cents) => "$" + Math.round((cents ?? 0) / 100).toLocaleString("en-US");
const money = (m) => (m ? `${num(m.v)} ${m.code}` : "—");
const $ = (id) => document.getElementById(id);
const cssId = (s) => String(s).replace(/[^A-Za-z0-9]/g, "_");
const cname = (n) => (state.lang === "ja" ? COUNTRY_JA[n] || n : n);

const state = {
  geo: null,
  world: null,
  projects: null,
  projectJa: {},
  metric: "funded",
  lang: "ja",       // 国名と提案タイトルの表示。公式名は英語のまま保持
  shape: null,      // 押されている国（地図側の名前）
  countryOnly: null, // 形を持たない国、または国の記録が無い行の選択
  project: null,    // 開いているプロジェクト（rows の添字）
  mode: "places",  // 国・プロジェクト / 人物
  person: null,     // 人物表示で開いている人物（表記が完全一致する名前）
  q: "",
  sort: "dist",
  stf: "",
  cur: "ADA",
  shown: PAGE,
  view: null,
  home: null,
  dragged: false,
};

const projectTitle = (r) =>
  state.lang === "ja" && state.projectJa[r.url] ? state.projectJa[r.url] : r.n;
const projectOriginal = (r) =>
  state.lang === "ja" && state.projectJa[r.url] && state.projectJa[r.url] !== r.n
    ? `<span class="rg-original" lang="en">${esc(r.n)}</span>`
    : "";

// --- 名前の対応 -------------------------------------------------------------

let SHAPE_OF = null; // 公式の国名 → 地図側の国名
function shapeOf(name) {
  if (!SHAPE_OF) {
    SHAPE_OF = {};
    for (const c of state.geo.countries) SHAPE_OF[c.name] = c.map;
  }
  if (!name) return null;
  const mapped = SHAPE_OF[name] || name;
  return state.world.countries[mapped] ? mapped : null;
}

let ROWS_BY_SHAPE = null;
function rowsByShape() {
  if (ROWS_BY_SHAPE) return ROWS_BY_SHAPE;
  ROWS_BY_SHAPE = {};
  state.projects.rows.forEach((r, i) => {
    const sh = shapeOf(r.c);
    if (!sh) return;
    if (!ROWS_BY_SHAPE[sh]) ROWS_BY_SHAPE[sh] = [];
    ROWS_BY_SHAPE[sh].push(i);
  });
  return ROWS_BY_SHAPE;
}

const sumOf = (indexes, key, cur) => {
  const rows = state.projects.rows;
  let v = 0;
  for (const i of indexes) {
    const m = rows[i][key];
    if (m && m.code === cur) v += m.v;
  }
  return v;
};

const compact = (v) =>
  v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : num(v);

/* 通貨ごとの 申請/配分済み の内訳。円グラフの中身はこれ。 */
function breakdown(indexes) {
  const rows = state.projects.rows;
  const out = {};
  for (const i of indexes) {
    const r = rows[i];
    for (const key of ["req", "dist"]) {
      const m = r[key];
      if (!m || !m.v) continue;
      if (!out[m.code]) out[m.code] = { req: 0, dist: 0 };
      out[m.code][key] += m.v;
    }
  }
  return out;
}

const pct = (dist, req) => (req > 0 ? Math.round((dist / Math.max(req, dist)) * 100) : 0);

const countOf = (indexes, metric) => {
  const rows = state.projects.rows;
  if (metric === "funded") return indexes.length;
  const want = metric === "completed" ? "Completed" : "Cancelled";
  return indexes.reduce((n, i) => n + (rows[i].st === want ? 1 : 0), 0);
};

// --- 一覧（左バー） ---------------------------------------------------------

function inScope() {
  return !!(state.shape || state.countryOnly);
}

function selectedIndexes() {
  const rows = state.projects.rows;
  let idx;
  if (state.shape) {
    idx = (rowsByShape()[state.shape] || []).slice();
  } else if (state.countryOnly === "__none") {
    idx = rows.map((_, i) => i).filter((i) => !rows[i].c);
  } else if (state.countryOnly) {
    idx = rows.map((_, i) => i).filter((i) => rows[i].c === state.countryOnly);
  } else {
    idx = rows.map((_, i) => i);
  }
  if (state.stf) idx = idx.filter((i) => rows[i].st === state.stf);
  if (state.q) {
    const q = state.q.toLowerCase();
    idx = idx.filter((i) => {
      const r = rows[i];
      return (
        r.n.toLowerCase().includes(q) ||
        (state.projectJa[r.url] || "").toLowerCase().includes(q) ||
        (r.who || []).some((w) => w.toLowerCase().includes(q)) ||
        (r.tg || []).some((t) => t.toLowerCase().includes(q)) ||
        (r.c || "").toLowerCase().includes(q)
      );
    });
  }
  if (!inScope()) return idx; // 世界ビューでは国ごとにまとめるので、ここでは並べない
  const byAmount = state.sort === "dist" || state.sort === "req";
  if (byAmount) {
    const key = state.sort;
    idx = idx.filter((i) => (rows[i][key] || {}).code === state.cur);
    idx.sort((a, b) => (rows[b][key] || {}).v - (rows[a][key] || {}).v);
  } else if (state.sort === "done") {
    idx = idx
      .filter((i) => rows[i].done)
      .sort((a, b) => (rows[a].done < rows[b].done ? 1 : -1));
  } else if (state.sort === "yes") {
    idx.sort((a, b) => ((rows[b].yes || {}).v || 0) - ((rows[a].yes || {}).v || 0));
  } else {
    idx.sort(
      (a, b) =>
        Number(rows[b].f) - Number(rows[a].f) ||
        ((rows[b].dist || {}).v || 0) - ((rows[a].dist || {}).v || 0)
    );
  }
  return idx;
}

function personGroups(idx) {
  const rows = state.projects.rows;
  const groups = new Map();
  for (const i of idx) {
    const r = rows[i];
    for (const raw of r.who || []) {
      const name = raw.trim();
      if (!name) continue;
      if (!groups.has(name)) groups.set(name, { name, idx: [] });
      groups.get(name).idx.push(i);
    }
  }
  const list = [...groups.values()];
  for (const g of list) {
    g.funded = g.idx.length;
    g.completed = countOf(g.idx, "completed");
    g.cancelled = countOf(g.idx, "cancelled");
    g.sum = { dist: {}, req: {} };
    g.yes = 0;
    for (const i of g.idx) {
      const r = rows[i];
      for (const key of ["dist", "req"]) {
        const m = r[key];
        if (m && m.v) g.sum[key][m.code] = (g.sum[key][m.code] || 0) + m.v;
      }
      if (r.yes) g.yes += r.yes.v;
    }
  }
  const val = (g) => {
    if (state.sort === "dist" || state.sort === "req") return g.sum[state.sort][state.cur] || 0;
    if (state.sort === "done") return g.completed;
    if (state.sort === "yes") return g.yes;
    return g.funded;
  };
  list.sort((a, b) => val(b) - val(a) || b.funded - a.funded || a.name.localeCompare(b.name));
  return list;
}

function personAmount(g) {
  if (state.sort === "dist" || state.sort === "req")
    return `${num(g.sum[state.sort][state.cur] || 0)} ${state.cur}`;
  if (state.sort === "done") return `完了 ${num(g.completed)}`;
  if (state.sort === "yes") return `Yes ${num(Math.round(g.yes / 1e6))}M`;
  return `${num(g.funded)} 件`;
}

function amountLabel(r) {
  if (state.sort === "req") return money(r.req);
  if (state.sort === "yes" && r.yes) return `Yes ${num(Math.round(r.yes.v / 1e6))}M`;
  if (state.sort === "done" && r.done) return r.done;
  return money(r.dist);
}

function sortProjectIndexes(idx) {
  const rows = state.projects.rows;
  if (state.sort === "dist" || state.sort === "req") {
    const key = state.sort;
    return idx
      .filter((i) => (rows[i][key] || {}).code === state.cur)
      .sort((a, b) => (rows[b][key] || {}).v - (rows[a][key] || {}).v);
  }
  if (state.sort === "done")
    return idx.filter((i) => rows[i].done).sort((a, b) => (rows[a].done < rows[b].done ? 1 : -1));
  if (state.sort === "yes")
    return idx.sort((a, b) => ((rows[b].yes || {}).v || 0) - ((rows[a].yes || {}).v || 0));
  return idx.sort(
    (a, b) =>
      Number(rows[b].f) - Number(rows[a].f) ||
      ((rows[b].dist || {}).v || 0) - ((rows[a].dist || {}).v || 0)
  );
}

function renderSummary(idx) {
  const rows = state.projects.rows;
  const by = {};
  for (const i of idx) {
    const r = rows[i];
    by[r.st] = (by[r.st] || 0) + 1;
  }
  const stText = ["Completed", "Active", "Cancelled"]
    .filter((k) => by[k])
    .map((k) => `${STATUS_JA[k]} ${num(by[k])}`)
    .join("・");
  const rest = Object.keys(by)
    .filter((k) => !["Completed", "Active", "Cancelled"].includes(k))
    .map((k) => `${STATUS_JA[k] || k} ${num(by[k])}`)
    .join("・");
  // 円グラフの内訳と同じもの。申請に対して、いくら配分済みかを通貨ごとに出す。
  const money_lines = Object.entries(breakdown(idx))
    .map(([code, m]) => {
      const req = Math.max(m.req, m.dist);
      return `<span>申請 ${esc(num(req))} ${esc(code)} ／ 配分済み ${esc(num(m.dist))}` +
        `（${esc(pct(m.dist, m.req))}%）・未配分 ${esc(num(req - m.dist))}</span>`;
    })
    .join("");
  $("summary").innerHTML =
    `<span>${esc([stText, rest].filter(Boolean).join("・"))}</span>` +
    money_lines +
    (Object.keys(breakdown(idx)).length > 1 ? `<span>通貨は混ぜず並記</span>` : "");
}

/* 世界ビュー: 国ごとにまとめて、調達金額などで並べる。押すとその国のプロジェクトへ。 */
function worldGroups(idx) {
  const rows = state.projects.rows;
  const groups = new Map();
  for (const i of idx) {
    const r = rows[i];
    const sh = r.c ? shapeOf(r.c) : null;
    const key = r.c ? (sh ? `S:${sh}` : `C:${r.c}`) : "C:__none";
    if (!groups.has(key)) {
      groups.set(key, { shape: sh, country: r.c || "__none", names: new Set(), idx: [] });
    }
    const g = groups.get(key);
    if (r.c) g.names.add(r.c);
    g.idx.push(i);
  }
  const list = [...groups.values()];
  for (const g of list) {
    g.funded = g.idx.length;
    g.completed = countOf(g.idx, "completed");
    g.cancelled = countOf(g.idx, "cancelled");
    g.sum = { dist: {}, req: {} };
    g.yes = 0;
    for (const i of g.idx) {
      const r = rows[i];
      for (const key of ["dist", "req"]) {
        const m = r[key];
        if (m && m.v) g.sum[key][m.code] = (g.sum[key][m.code] || 0) + m.v;
      }
      if (r.yes) g.yes += r.yes.v;
    }
  }
  const val = (g) => {
    if (state.sort === "dist" || state.sort === "req") return g.sum[state.sort][state.cur] || 0;
    if (state.sort === "done") return g.completed;
    if (state.sort === "yes") return g.yes;
    return g.funded;
  };
  list.sort((a, b) => val(b) - val(a) || b.funded - a.funded);
  return list;
}

function groupLabel(g) {
  if (g.country === "__none") return "国の記録なし";
  return [...g.names].map(cname).join(" / ");
}

function groupAmount(g) {
  if (state.sort === "dist" || state.sort === "req")
    return `${num(g.sum[state.sort][state.cur] || 0)} ${state.cur}`;
  if (state.sort === "done") return `完了 ${num(g.completed)}`;
  if (state.sort === "yes") return `Yes ${num(Math.round(g.yes / 1e6))}M`;
  return `${num(g.funded)} 件`;
}

function renderPlist() {
  const rows = state.projects.rows;
  let idx = selectedIndexes();

  if (state.person) idx = sortProjectIndexes(idx.filter((i) => (rows[i].who || []).includes(state.person)));

  const placeName = state.shape
    ? [...new Set((rowsByShape()[state.shape] || []).map((i) => rows[i].c))].map(cname).join(" / ")
    : state.countryOnly === "__none"
    ? "国の記録なし"
    : state.countryOnly
    ? cname(state.countryOnly)
    : "世界";
  $("place").textContent = state.person || placeName;
  $("back").textContent = state.person
    ? "← 人物一覧"
    : state.mode === "people" && !inScope()
    ? "← 国一覧"
    : "← 世界";
  $("back").hidden = !state.person && !inScope() && state.mode !== "people";
  $("curwrap").hidden = !(state.sort === "dist" || state.sort === "req");
  renderSummary(idx);

  if (state.mode === "people" && !state.person) {
    const groups = personGroups(idx);
    $("place-count").textContent = `${num(groups.length)} 人・${num(idx.length)} 件`;
    $("summary").insertAdjacentHTML(
      "beforeend",
      `<span class="rg-person-note">人物名の完全一致で集計。共同提案は各人物にプロジェクト全額を計上。</span>`
    );
    $("plist").innerHTML = groups
      .slice(0, state.shown)
      .map(
        (g, rank) => `<li class="rg-person" data-person="${esc(g.name)}" tabindex="0" role="button">
          <span class="rg-rank">#${num(rank + 1)}</span>
          <span class="rg-person-n">${esc(g.name)}</span>
          <span class="rg-pi-a">${esc(personAmount(g))}</span>
          <span class="rg-pi-s">採択 ${num(g.funded)}・完了 ${num(g.completed)}・中止 ${num(g.cancelled)}</span>
        </li>`
      )
      .join("");
    $("pempty").hidden = groups.length !== 0;
    $("pmore").hidden = groups.length <= state.shown;
    return;
  }

  if (!inScope() && !state.person) {
    const groups = worldGroups(idx);
    $("place-count").textContent = `${num(groups.length)} の国・${num(idx.length)} 件`;
    $("plist").innerHTML =
      `<li class="rg-all-ranking">
        <button type="button" class="rg-all-ranking-btn">
          <span class="rg-all-ranking-n">全提案の調達ランキング</span>
          <span class="rg-all-ranking-s">人物・projectを横断して集計 →</span>
        </button>
      </li>` + groups
      .slice(0, state.shown)
      .map(
        (g, rank) => `<li class="rg-ci" data-shape="${esc(g.shape || "")}" data-country="${esc(
          g.country
        )}" tabindex="0" role="button">
          <span class="rg-rank">#${num(rank + 1)}</span>
          <span class="rg-ci-n">${esc(groupLabel(g))}</span>
          <span class="rg-pi-a">${esc(groupAmount(g))}</span>
          <span class="rg-pi-s">採択 ${num(g.funded)}・完了 ${num(g.completed)}・中止 ${num(
          g.cancelled
        )}</span>
          <span class="rg-ci-actions">
            <button type="button" class="rg-ci-action" data-country-view="people">調達額順で見る</button>
            <button type="button" class="rg-ci-action" data-country-view="projects">projectを見る</button>
          </span>
        </li>`
      )
      .join("");
    $("pempty").hidden = groups.length !== 0;
    $("pmore").hidden = groups.length <= state.shown;
    return;
  }

  $("place-count").textContent = state.person ? `${num(idx.length)} 件のプロジェクト` : `${num(idx.length)} 件`;
  const shown = idx.slice(0, state.shown);
  $("plist").innerHTML = shown
    .map((i) => {
      const r = rows[i];
      const who = (r.who || []).slice(0, 2).join(", ");
      return `<li class="rg-pi" data-i="${i}" tabindex="0" role="button">
        <span class="rg-pi-dot st-${esc(r.st)}" title="${esc(STATUS_JA[r.st] || r.st)}"></span>
        <span class="rg-pi-n">${esc(projectTitle(r))}${projectOriginal(r)}</span>
        <span class="rg-pi-a">${esc(amountLabel(r))}</span>
        <span class="rg-pi-s">${esc([r.fund, r.g, who].filter(Boolean).join(" ・ "))}</span>
      </li>`;
    })
    .join("");
  $("pempty").hidden = idx.length !== 0;
  $("pmore").hidden = idx.length <= state.shown;
}

// --- プロジェクト詳細 -------------------------------------------------------

function renderProject() {
  const view = $("pview");
  if (state.project == null) {
    view.hidden = true;
    return;
  }
  const r = state.projects.rows[state.project];
  const line = (k, v) =>
    v
      ? `<div class="rg-pv-row"><span class="rg-pv-k">${esc(k)}</span><span class="rg-pv-v">${v}</span></div>`
      : "";
  const who = (r.who || []).map((w) => `<span class="rg-pv-who">${esc(w)}</span>`).join("");
  view.innerHTML =
    `<button type="button" class="rg-back" id="pv-back">閉じる ×</button>
     <p class="rg-pv-n">${esc(projectTitle(r))}${projectOriginal(r)}</p>
     <p class="rg-pv-sub">${esc([r.fund, r.cat].filter(Boolean).join(" ・ "))}</p>
     <div class="rg-pv-grid">
       ${line("国", esc(r.c ? cname(r.c) : "記録なし"))}
       ${line("状態", esc(STATUS_JA[r.st] || r.st) + (r.done ? `（${esc(r.done)}）` : ""))}
       ${line("分野", esc(r.g || "—"))}
       ${line("申請", esc(money(r.req)))}
       ${line("配分済み", esc(money(r.dist)))}
       ${line("投票", r.yes ? `Yes ${esc(num(r.yes.v))} ${esc(r.yes.code)}・投票数 ${esc(num(r.votes))}` : "")}
     </div>
     ${
       who
         ? `<p class="rg-pv-k">関わった人</p><div class="rg-pv-whos">${who}</div>`
         : `<p class="rg-pv-miss">台帳と突き合わせできず、人の名前を出せない。</p>`
     }
     ${(r.tg || []).length ? `<p class="rg-pv-tags">${r.tg.map((t) => `<span class="tag">${esc(t)}</span>`).join(" ")}</p>` : ""}
     <p class="rg-pv-links">
       <a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">projectcatalyst.io で見る</a>
       ${r.x ? `<a href="${esc(r.x)}" target="_blank" rel="noopener noreferrer">Catalyst Explorer で見る</a>` : ""}
     </p>`;
  view.hidden = false;
  $("pv-back").onclick = () => {
    state.project = null;
    renderProject();
  };
  view.scrollTop = 0;
}

// --- 地図 -------------------------------------------------------------------

function scaleFor(metric) {
  const vals = Object.values(rowsByShape())
    .map((idx) => countOf(idx, metric))
    .filter((v) => v > 0);
  if (!vals.length) return { cuts: [], max: 0, at: () => 0 };
  const max = Math.max(...vals);
  const span = Math.log10(Math.max(max, 10)) / BINS;
  const cuts = [];
  for (let i = 1; i < BINS; i++) cuts.push(Math.ceil(Math.pow(10, span * i)));
  return {
    cuts,
    max,
    at(v) {
      if (v <= 0) return 0;
      let b = 1;
      for (const cut of cuts) if (v >= cut) b++;
      return Math.min(b, BINS);
    },
  };
}

function setView(v) {
  const home = state.home;
  if (home) {
    const slackX = Math.min(v.w, home.w) * 0.15;
    const slackY = Math.min(v.h, home.h) * 0.15;
    v = {
      w: v.w,
      h: v.h,
      x: Math.max(-slackX, Math.min(v.x, home.w - v.w + slackX)),
      y: Math.max(-slackY, Math.min(v.y, home.h - v.h + slackY)),
    };
  }
  state.view = v;
  $("map").setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
  $("map").style.setProperty("--k", (v.w / state.home.w).toFixed(4));
  updateBadges();
}

/* 滑らかに寄る。ドラッグとホイールは即時、ボタンとクリックはこれを通す。 */
let viewAnim = null;
function animateView(target, ms = 420) {
  if (viewAnim) cancelAnimationFrame(viewAnim);
  // 描画が止まっている（タブ非表示等）か、動きを減らす設定なら、即時に置く。
  if (document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setView(target);
    return;
  }
  const from = { ...state.view };
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    const e = ease(t);
    setView({
      x: from.x + (target.x - from.x) * e,
      y: from.y + (target.y - from.y) * e,
      w: from.w + (target.w - from.w) * e,
      h: from.h + (target.h - from.h) * e,
    });
    if (t < 1) viewAnim = requestAnimationFrame(step);
    else viewAnim = null;
  };
  viewAnim = requestAnimationFrame(step);
}

function zoomBy(f) {
  const v = state.view;
  const w = Math.min(state.home.w, Math.max(state.home.w / 40, v.w * f));
  const h = w * (state.home.h / state.home.w);
  setView({ x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h });
}

function zoomHome() {
  animateView({ x: 0, y: 0, w: state.home.w, h: state.home.h });
}

function zoomTo(box, pad) {
  const home = state.home;
  const ratio = home.h / home.w;
  const m = Math.max(box.w, box.h) * (pad || 0.15);
  let w = box.w + m * 2;
  let h = w * ratio;
  if (h < box.h + m * 2) {
    h = box.h + m * 2;
    w = h / ratio;
  }
  w = Math.min(home.w, Math.max(home.w / 40, w));
  h = w * ratio;
  animateView({ x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h });
}

function boxOfCentroids(names) {
  const pts = names.map((n) => (state.world.countries[n] || {}).c).filter(Boolean);
  if (!pts.length) return null;
  const span = (vals) => {
    const v = vals.slice().sort((a, b) => a - b);
    if (v.length < 8) return [v[0], v[v.length - 1]];
    return [v[Math.floor(v.length * 0.1)], v[Math.ceil(v.length * 0.9) - 1]];
  };
  const [x0, x1] = span(pts.map((p) => p[0]));
  const [y0, y1] = span(pts.map((p) => p[1]));
  const pad = Math.max((x1 - x0) * 0.18, (y1 - y0) * 0.18, 45);
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

function buildMap() {
  const svg = $("map");
  const w = state.world;
  const vb = w.view_box.split(" ").map(Number);
  state.home = { x: 0, y: 0, w: vb[2], h: vb[3] };
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const shapes = document.createElementNS(SVG_NS, "g");
  const marks = document.createElementNS(SVG_NS, "g");
  const rows = rowsByShape();

  for (const name of Object.keys(w.countries)) {
    const geom = w.countries[name];
    const has = !!rows[name];
    const node = document.createElementNS(SVG_NS, geom.d ? "path" : "circle");
    if (geom.d) node.setAttribute("d", geom.d);
    else {
      node.setAttribute("cx", geom.c[0]);
      node.setAttribute("cy", geom.c[1]);
      node.setAttribute("r", 2);
    }
    node.setAttribute("id", `sh-${cssId(name)}`);
    node.setAttribute("class", has ? "rg-sh" : "rg-sh rg-nodata");
    node.dataset.name = name;
    if (has) node.setAttribute("tabindex", "0");
    shapes.appendChild(node);

    // 小さすぎて押せない国は、記録があるときだけ点を重ねる。
    if (has && (!geom.d || geom.size < 12)) {
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", geom.c[0]);
      dot.setAttribute("cy", geom.c[1]);
      dot.setAttribute("class", "rg-dot");
      dot.dataset.name = name;
      marks.appendChild(dot);
    }
  }

  const bubbles = document.createElementNS(SVG_NS, "g");
  bubbles.setAttribute("id", "bubbles");

  const labels = document.createElementNS(SVG_NS, "g");
  labels.setAttribute("id", "labels");

  const clabels = document.createElementNS(SVG_NS, "g");
  clabels.setAttribute("id", "clabels");

  svg.replaceChildren(shapes, bubbles, marks, clabels, labels);
  buildBadges(labels);
  buildCountryBadges(clabels);
  setView({ x: 0, y: 0, w: state.home.w, h: state.home.h });
  wireMap();
}

/* 大陸のカウントピン。公式マップのピンは装飾だが、ここでは数字が計器と一致する。 */
function continentShapes(contName) {
  return [
    ...new Set(
      state.geo.countries
        .filter((c) => c.continent === contName)
        .map((c) => shapeOf(c.name))
        .filter(Boolean)
    ),
  ];
}

function buildBadges(layer) {
  state.badges = [];
  for (const cont of state.geo.continents) {
    const shapes = continentShapes(cont.name);
    const pts = shapes.map((n) => state.world.countries[n].c);
    if (!pts.length) continue;
    const mid = (vals) => {
      const v = vals.slice().sort((a, b) => a - b);
      return v[Math.floor(v.length / 2)];
    };
    const x = Math.max(70, Math.min(state.home.w - 70, mid(pts.map((p) => p[0]))));
    const y = Math.max(50, Math.min(state.home.h - 60, mid(pts.map((p) => p[1]))));

    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "rg-cb");
    g.dataset.cont = cont.name;

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("r", 16);

    const count = document.createElementNS(SVG_NS, "text");
    count.setAttribute("class", "rg-cb-count");

    const nameText = state.lang === "ja" ? cont.name_ja : cont.name;
    const nw = nameText.length * 10 + 14;
    const nameBg = document.createElementNS(SVG_NS, "rect");
    nameBg.setAttribute("class", "rg-cb-namebg");
    nameBg.setAttribute("x", -nw / 2);
    nameBg.setAttribute("y", 21);
    nameBg.setAttribute("width", nw);
    nameBg.setAttribute("height", 16);
    nameBg.setAttribute("rx", 4);

    const name = document.createElementNS(SVG_NS, "text");
    name.setAttribute("class", "rg-cb-name");
    name.setAttribute("y", 29.5);
    name.textContent = nameText;

    g.append(circle, count, nameBg, name);
    layer.appendChild(g);
    state.badges.push({ el: g, x, y, count, cont: cont.name });
  }
}

/* 国ごとの数字ピン。寄ったときだけ、画面上で読める大きさの国に出す。 */
function buildCountryBadges(layer) {
  state.cbadges = [];
  for (const name of Object.keys(rowsByShape())) {
    const geom = state.world.countries[name];
    if (!geom) continue;
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "rg-kb");
    g.dataset.name = name;
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("r", 12);
    const count = document.createElementNS(SVG_NS, "text");
    count.setAttribute("class", "rg-kb-count");
    g.append(circle, count);
    layer.appendChild(g);
    state.cbadges.push({ el: g, x: geom.c[0], y: geom.c[1], size: geom.size, count, name });
  }
}

function paintCountryBadges() {
  if (!state.cbadges) return;
  const shapeRows = rowsByShape();
  for (const b of state.cbadges) {
    const idx = shapeRows[b.name] || [];
    if (state.metric === "dist") {
      // 円が額を語るので、ピンの数字は採択数を語る。
      b.value = Math.max(sumOf(idx, "req", state.cur), sumOf(idx, "dist", state.cur));
      b.count.textContent = num(idx.length);
    } else {
      b.value = countOf(idx, state.metric);
      b.count.textContent = num(b.value);
    }
  }
  updateBadges();
}

function updateBadges() {
  if (!state.badges || !state.home) return;
  const k = state.view.w / state.home.w;
  const show = k > 0.55;
  // 画面上の大きさを一定にする。viewBox 単位 ÷ 表示ピクセルが縮尺。
  const px = $("map").getBoundingClientRect().width || 1;
  const sc = (state.view.w / px) * 1.15;
  for (const b of state.badges) {
    b.el.style.display = show ? "" : "none";
    if (show) b.el.setAttribute("transform", `translate(${b.x} ${b.y}) scale(${sc.toFixed(4)})`);
  }

  // 国ピン。世界表示では出さず、寄ったら読める大きさの国にだけ出す。
  if (state.cbadges) {
    const v = state.view;
    for (const b of state.cbadges) {
      let on = !show && b.value > 0;
      if (on) {
        const screenSize = (b.size / v.w) * px;
        on =
          screenSize >= 26 &&
          b.x > v.x - 40 &&
          b.x < v.x + v.w + 40 &&
          b.y > v.y - 40 &&
          b.y < v.y + v.h + 40;
      }
      b.el.style.display = on ? "" : "none";
      if (on) b.el.setAttribute("transform", `translate(${b.x} ${b.y}) scale(${sc.toFixed(4)})`);
    }
  }
}

function paintBadges() {
  if (!state.badges) return;
  const rows = state.projects.rows;
  for (const b of state.badges) {
    const idx = [];
    rows.forEach((r, i) => {
      if (r.ct === b.cont) idx.push(i);
    });
    b.count.textContent =
      state.metric === "dist" ? compact(sumOf(idx, "dist", state.cur)) : num(countOf(idx, state.metric));
  }
}

/* 配分額モード。国の重心に、面積が配分済み額に比例する円を置く。
   ADA と USD は混ぜられないので、選ばれている通貨の円だけを描く。 */
/* 円グラフの扇。12時から時計回りに ratio ぶんを塗る。 */
function pieWedge(cx, cy, r, ratio) {
  const a = Math.min(0.9999, Math.max(0, ratio)) * Math.PI * 2;
  const x = (cx + r * Math.sin(a)).toFixed(1);
  const y = (cy - r * Math.cos(a)).toFixed(1);
  const large = a > Math.PI ? 1 : 0;
  return `M${cx} ${cy}L${cx} ${cy - r}A${r} ${r} 0 ${large} 1 ${x} ${y}Z`;
}

/* 円の面積＝申請額、色の付いた扇＝そのうち配分済みの割合。 */
function paintBubbles() {
  const layer = document.getElementById("bubbles");
  const shapeRows = rowsByShape();
  const items = [];
  for (const [name, idx] of Object.entries(shapeRows)) {
    const dist = sumOf(idx, "dist", state.cur);
    const req = Math.max(sumOf(idx, "req", state.cur), dist);
    if (req > 0) items.push({ name, req, dist });
  }
  const max = Math.max(1, ...items.map((b) => b.req));
  const R = 64;
  layer.replaceChildren();
  items.sort((a, b) => b.req - a.req);
  for (const b of items) {
    const c = state.world.countries[b.name];
    if (!c) continue;
    const r = Math.max(2.5, Math.sqrt(b.req / max) * R);
    const base = document.createElementNS(SVG_NS, "circle");
    base.setAttribute("cx", c.c[0]);
    base.setAttribute("cy", c.c[1]);
    base.setAttribute("r", r.toFixed(1));
    base.setAttribute("class", "rg-bub-base");
    layer.appendChild(base);

    const ratio = b.req ? b.dist / b.req : 0;
    if (ratio <= 0) continue;
    if (ratio >= 0.9999) {
      const full = document.createElementNS(SVG_NS, "circle");
      full.setAttribute("cx", c.c[0]);
      full.setAttribute("cy", c.c[1]);
      full.setAttribute("r", r.toFixed(1));
      full.setAttribute("class", "rg-bub-fill");
      layer.appendChild(full);
    } else {
      const wedge = document.createElementNS(SVG_NS, "path");
      wedge.setAttribute("d", pieWedge(c.c[0], c.c[1], r, ratio));
      wedge.setAttribute("class", "rg-bub-fill");
      layer.appendChild(wedge);
    }
  }
  return { max, top: items[0] || null };
}

function paintMap() {
  const rows = rowsByShape();
  if (state.metric === "dist") {
    for (const name of Object.keys(rows)) {
      const el = document.getElementById(`sh-${cssId(name)}`);
      if (el) el.removeAttribute("data-bin");
    }
    paintBadges();
    paintCountryBadges();
    return paintBubbles();
  }
  document.getElementById("bubbles").replaceChildren();
  const scale = scaleFor(state.metric);
  for (const name of Object.keys(rows)) {
    const el = document.getElementById(`sh-${cssId(name)}`);
    if (el) el.setAttribute("data-bin", scale.at(countOf(rows[name], state.metric)));
  }
  paintBadges();
  paintCountryBadges();
  return scale;
}

function tipHtml(name) {
  const rows = state.projects.rows;
  const idx = rowsByShape()[name] || [];
  const official = [...new Set(idx.map((i) => rows[i].c))].map(cname).join(" / ");
  const done = countOf(idx, "completed");
  const cancel = countOf(idx, "cancelled");
  const line = (k, v) => `<span class="rg-tk">${esc(k)}</span><span class="rg-tv2">${esc(v)}</span>`;
  const bd = breakdown(idx);
  const money_lines = Object.entries(bd)
    .map(([code, m]) => {
      const req = Math.max(m.req, m.dist);
      return (
        line(`申請 (${code})`, num(req)) +
        line(`配分済み`, `${num(m.dist)}（${pct(m.dist, m.req)}%）`)
      );
    })
    .join("");
  return (
    `<span class="rg-tn2">${esc(official || name)}</span>` +
    line("採択", num(idx.length)) +
    line("完了", num(done)) +
    line("中止", num(cancel)) +
    money_lines +
    `<span class="rg-tf">押すと一覧が出る</span>`
  );
}

function showTip(name, ev) {
  const tip = $("tip");
  tip.innerHTML = tipHtml(name);
  tip.hidden = false;
  const wrap = $("mapwrap").getBoundingClientRect();
  const box = tip.getBoundingClientRect();
  const x = ev.clientX - wrap.left + 14;
  const y = ev.clientY - wrap.top + 14;
  tip.style.left = `${Math.max(0, Math.min(x, wrap.width - box.width - 4))}px`;
  tip.style.top = `${Math.max(0, Math.min(y, wrap.height - box.height - 4))}px`;
}

function pickShape(name) {
  state.shape = name;
  state.countryOnly = null;
  state.person = null;
  state.project = null;
  state.shown = PAGE;
  for (const el of document.querySelectorAll(".rg-sh.on")) el.classList.remove("on");
  if (name) {
    const el = document.getElementById(`sh-${cssId(name)}`);
    if (el) {
      el.classList.add("on");
      const geom = state.world.countries[name];
      if (geom && geom.size) {
        // 国が見える大きさまで寄る。すでに寄っているときはそのまま。
        const size = Math.max(geom.size * 3, 220);
        if (state.view.w > size * 1.4) {
          zoomTo(
            { x: geom.c[0] - geom.size / 2, y: geom.c[1] - geom.size / 2, w: geom.size, h: geom.size },
            1.2
          );
        }
      }
    }
  }
  renderProject();
  renderPlist();
}

function wireMap() {
  const svg = $("map");
  const wrap = $("mapwrap");
  const nameAt = (t) => (t && t.dataset ? t.dataset.name : null);
  const known = (n) => !!(n && rowsByShape()[n]);

  svg.addEventListener("mousemove", (ev) => {
    const name = nameAt(ev.target);
    if (known(name)) showTip(name, ev);
    else $("tip").hidden = true;
  });
  wrap.addEventListener("mouseleave", () => {
    $("tip").hidden = true;
  });

  svg.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const name = nameAt(ev.target);
    if (known(name)) {
      ev.preventDefault();
      pickShape(name);
    }
  });

  svg.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      const v = state.view;
      const r = svg.getBoundingClientRect();
      const px = v.x + ((ev.clientX - r.left) / r.width) * v.w;
      const py = v.y + ((ev.clientY - r.top) / r.height) * v.h;
      const f = ev.deltaY > 0 ? 1.18 : 1 / 1.18;
      const w = Math.min(state.home.w, Math.max(state.home.w / 40, v.w * f));
      const h = w * (state.home.h / state.home.w);
      setView({ x: px - ((px - v.x) / v.w) * w, y: py - ((py - v.y) / v.h) * h, w, h });
    },
    { passive: false }
  );

  // setPointerCapture を使うと click の行き先が svg 本体に付け替わり、
  // どの国を押したか分からなくなる。押した相手は pointerdown の時点で覚えておき、
  // 動かさずに離したときだけタップとして扱う。
  let drag = null;
  svg.addEventListener("pointerdown", (ev) => {
    drag = { x: ev.clientX, y: ev.clientY, v: { ...state.view }, target: ev.target };
    state.dragged = false;
    try {
      svg.setPointerCapture(ev.pointerId);
    } catch (_) {
      /* 合成イベント等でポインタが無いときは掴まない */
    }
  });
  svg.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const r = svg.getBoundingClientRect();
    const dx = ((ev.clientX - drag.x) / r.width) * drag.v.w;
    const dy = ((ev.clientY - drag.y) / r.height) * drag.v.h;
    if (Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > 3) state.dragged = true;
    setView({ ...drag.v, x: drag.v.x - dx, y: drag.v.y - dy });
  });
  svg.addEventListener("pointerup", () => {
    const tapped = drag && !state.dragged ? drag.target : null;
    drag = null;
    state.dragged = false;
    if (!tapped) return;
    const badge = tapped.closest ? tapped.closest(".rg-cb") : null;
    if (badge) {
      const box = boxOfCentroids(continentShapes(badge.dataset.cont));
      if (box) zoomTo(box);
      return;
    }
    const kb = tapped.closest ? tapped.closest(".rg-kb") : null;
    if (kb) {
      pickShape(kb.dataset.name);
      return;
    }
    const name = nameAt(tapped);
    pickShape(known(name) ? name : null);
  });
  svg.addEventListener("pointercancel", () => {
    drag = null;
    state.dragged = false;
  });

  $("z-in").onclick = () => zoomBy(1 / 1.6);
  $("z-out").onclick = () => zoomBy(1.6);
  $("z-all").onclick = () => zoomHome();
}

// 全画面。基本は縮小してページに埋め、押したときだけ画面いっぱいに切り替える。
function wireFullscreen() {
  const frame = $("appframe");
  const btn = $("z-full");
  const set = (on) => {
    frame.classList.toggle("rg-full", on);
    document.body.classList.toggle("rg-noscroll", on);
    btn.textContent = on ? "戻す" : "全画面";
  };
  btn.onclick = () => set(!frame.classList.contains("rg-full"));
  if (new URLSearchParams(window.location.search).get("view") === "neo") set(true);
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && frame.classList.contains("rg-full")) set(false);
  });
}

function renderJump() {
  const conts = state.geo.continents;
  $("jump").innerHTML =
    `<button type="button" class="rg-jb" data-cont="">全体</button>` +
    conts
      .map(
        (c) => `<button type="button" class="rg-jb" data-cont="${esc(c.name)}">${esc(c.name_ja)}</button>`
      )
      .join("");
  for (const b of $("jump").querySelectorAll(".rg-jb")) {
    b.onclick = () => {
      if (!b.dataset.cont) return zoomHome();
      const names = state.geo.countries
        .filter((c) => c.continent === b.dataset.cont)
        .map((c) => shapeOf(c.name))
        .filter(Boolean);
      const box = boxOfCentroids([...new Set(names)]);
      if (box) zoomTo(box);
    };
  }
}

function renderLegend(scale) {
  if (state.metric === "dist") {
    const top = scale && scale.top;
    const topName = top
      ? [...new Set((rowsByShape()[top.name] || []).map((i) => state.projects.rows[i].c))]
          .map(cname)
          .join(" / ")
      : "";
    $("legend").innerHTML =
      `<li><span class="rg-swc rg-swc-base"></span>円の面積は<strong>申請額</strong>（${esc(
        state.cur
      )}）に比例する。</li>` +
      `<li><span class="rg-swc"></span>色の付いた扇は、そのうち<strong>実際に配分済み</strong>の割合。` +
      (top
        ? `いちばん大きい円は ${esc(topName)}（申請 ${esc(num(top.req))} ／ 配分済み ${esc(
            num(top.dist)
          )} ${esc(state.cur)}）。`
        : "") +
      `</li>` +
      `<li>寄ると国ピンが出る。ピンの数字は採択数。円が額を、数字が件数を語る。</li>` +
      `<li>ADA と USD は換算せず、選んだ通貨の円だけを描く。F9 以前は USD、F10 以降は ADA。</li>` +
      `<li>円は国の位置を示すだけで、国の中のどこかまでは記録に無い。</li>`;
    return;
  }
  const steps = [`<li>${esc(METRICS[state.metric].note)}</li>`];
  for (let b = 1; b <= BINS; b++) {
    const lo = b === 1 ? 1 : scale.cuts[b - 2];
    const hi = b === BINS ? scale.max : Math.max(lo, scale.cuts[b - 1] - 1);
    const text = b === BINS ? `${num(lo)} 以上` : lo === hi ? num(lo) : `${num(lo)} 〜 ${num(hi)}`;
    steps.push(`<li><span class="rg-sw" data-bin="${b}"></span>${esc(text)}</li>`);
  }
  $("legend").innerHTML =
    steps.join("") +
    `<li><span class="rg-sw rg-sw-none"></span>国の記録が無いところ。<strong>活動が無いという意味ではない。</strong></li>` +
    `<li>濃さは量であって、良し悪しではない。段は1から最大値までを対数で5つに切っている。</li>`;
}

function renderOffmap() {
  const rows = state.projects.rows;
  const noCountry = rows.filter((r) => !r.c).length;
  const noShape = [...new Set(rows.filter((r) => r.c && !shapeOf(r.c)).map((r) => r.c))];
  const parts = [];
  if (noCountry)
    parts.push(`国の記録が無いプロジェクト ${num(noCountry)} 件（「世界」の一覧にだけ出る）`);
  if (noShape.length)
    parts.push(
      `この縮尺の国境データに面が無い国 — ${noShape
        .map((n) => `${n}（${num(rows.filter((r) => r.c === n).length)} 件）`)
        .join(" ／ ")}。同じく一覧にだけ出る`
    );
  $("offmap").textContent = parts.length ? `地図に置けないもの — ${parts.join(" ／ ")}` : "";
}

// --- 数が合わない -----------------------------------------------------------

function renderGap() {
  const { totals, ledger } = state.geo;
  const rows = [
    {
      n: num(ledger.funded_or_beyond),
      k: "台帳（②採択以上）",
      s: `Catalyst Explorer API。全 ${num(ledger.total_proposals)} 件のうち段階②以上。`,
    },
    {
      n: num(state.projects.counts.rows),
      k: "公式のプロジェクト行",
      s: "projectcatalyst.io の全 Fund × カテゴリを数え直したもの。この頁の地図と一覧はこれ。",
    },
    {
      n: num(totals.continent_funded),
      k: "公式マップ・大陸の値",
      s: "六つの大陸に書かれている採択数の合計。公式マップが画面に出している数。",
    },
    {
      n: num(totals.country_funded),
      k: "公式マップ・国の合計",
      s: "同じ配信データの国の行を全部足したもの。大陸の値と一致しない。",
    },
  ];
  $("gap").innerHTML =
    '<thead><tr><th scope="col" class="num">件数</th><th scope="col">どこの数か</th><th scope="col">由来</th></tr></thead>' +
    `<tbody>${rows
      .map(
        (r) =>
          `<tr><td class="num rg-big">${r.n}</td><td class="chain">${esc(r.k)}</td><td>${esc(r.s)}</td></tr>`
      )
      .join("")}</tbody>`;
}

function renderDefects() {
  const { continents, countries, totals } = state.geo;
  const items = [];
  const off = continents.filter((c) => c.rows_sum_funded !== c.counts.funded);
  if (off.length) {
    items.push({
      h: `大陸の値と国の合計が合わない — ${off.length} 地域`,
      d: off
        .map((c) => {
          const diff = c.rows_sum_funded - c.counts.funded;
          return `${c.name_ja} 大陸の値 ${num(c.counts.funded)} ／ 国の合計 ${num(
            c.rows_sum_funded
          )}（差 ${diff > 0 ? "+" : ""}${num(diff)}）`;
        })
        .join(" ・ "),
    });
  }
  const byFlag = {};
  for (const c of countries) {
    for (const f of c.flags || []) {
      if (!byFlag[f]) byFlag[f] = [];
      byFlag[f].push(c);
    }
  }
  for (const [flag, list] of Object.entries(byFlag)) {
    const names = [...new Set(list.map((c) => c.name))];
    items.push({
      h:
        names.length === list.length
          ? `${FLAG_TEXT[flag] || flag} — ${names.length} 行`
          : `${FLAG_TEXT[flag] || flag} — ${names.length} 名・${list.length} 行`,
      d: list.map((c) => `${c.name}（${c.continent}・採択 ${num(c.counts.funded)}）`).join(" ・ "),
    });
  }
  items.push({
    h: `行数 ${num(totals.rows)} ／ 異なる名前 ${num(totals.distinct_names)}`,
    d: "配信データにある行の数と、そこに現れる名前の種類の数。差は同じ名前が二度置かれていることを意味する。",
  });
  $("defects").innerHTML = items
    .map(
      (i) =>
        `<li class="rg-defect"><span class="rg-dh">${esc(i.h)}</span><span class="rg-dd">${esc(
          i.d
        )}</span></li>`
    )
    .join("");
}

// --- 国の一覧（公式の全行） -------------------------------------------------

function renderCountryTable() {
  const rows = state.geo.countries;
  $("n-rows").textContent = num(rows.length);
  document.querySelector("#countries tbody").innerHTML = rows
    .map((c) => {
      const marks = (c.flags || [])
        .map((f) => `<span class="badge oc">${esc(FLAG_TEXT[f] || f)}</span>`)
        .join("");
      return `<tr>
        <td class="name">${esc(c.name)}</td>
        <td class="pattern">${esc(c.continent)}</td>
        <td class="num">${num(c.counts.funded)}</td>
        <td class="num">${num(c.counts.completed)}</td>
        <td class="num">${num(c.counts.in_progress)}</td>
        <td class="num">${num(c.counts.cancelled)}</td>
        <td class="num">${esc(usdCents(c.funding.distributed))}</td>
        <td class="badges rg-marks">${marks}</td>
      </tr>`;
    })
    .join("");
}

// --- 組み立て ---------------------------------------------------------------

function setSeg(seg, i) {
  seg.style.setProperty("--i", i);
  seg.querySelectorAll(".seg-btn").forEach((b, k) => b.classList.toggle("on", k === i));
}

function wireControls() {
  const seg = $("metricseg");
  [...seg.querySelectorAll(".seg-btn")].forEach((b, i) => {
    b.onclick = () => {
      setSeg(seg, i);
      state.metric = b.dataset.metric;

      // 地図と一覧は同じものを見る。完了の地図なら一覧も完了だけ、中止なら中止だけ。
      if (state.metric === "completed") {
        state.stf = "Completed";
        if (state.sort === "dist" || state.sort === "req") state.sort = "done";
      } else if (state.metric === "cancelled") {
        state.stf = "Cancelled";
        // 金額順は通貨で行が絞られ、地図の数字と件数が合わなくなるので外す
        if (state.sort === "dist" || state.sort === "req") state.sort = "fund";
      } else {
        state.stf = "";
      }
      $("stf").value = state.stf;
      $("sort").value = state.sort;
      state.shown = PAGE;
      state.project = null;

      renderLegend(paintMap());
      renderProject();
      renderPlist();
    };
  });

  $("back").onclick = () => {
    if (state.person) {
      state.person = null;
      state.project = null;
      state.shown = PAGE;
      renderProject();
      renderPlist();
    } else if (state.mode === "people" && !inScope()) {
      state.mode = "places";
      pickShape(null);
    } else {
      pickShape(null);
    }
  };
  for (const b of document.querySelectorAll(".rg-langb")) {
    b.onclick = () => {
      document.querySelectorAll(".rg-langb").forEach((x) => x.classList.toggle("on", x === b));
      state.lang = b.dataset.lang;
      for (const bd of state.badges || []) {
        const cont = state.geo.continents.find((c) => c.name === bd.cont);
        if (cont) bd.el.querySelector(".rg-cb-name").textContent =
          state.lang === "ja" ? cont.name_ja : cont.name;
      }
      renderPlist();
      renderProject();
    };
  }
  $("pq").addEventListener("input", () => {
    state.q = $("pq").value.trim();
    state.shown = PAGE;
    state.project = null;
    renderProject();
    renderPlist();
  });
  $("sort").onchange = () => {
    state.sort = $("sort").value;
    state.shown = PAGE;
    renderPlist();
  };
  $("stf").onchange = () => {
    state.stf = $("stf").value;
    state.shown = PAGE;
    renderPlist();
  };
  for (const b of document.querySelectorAll(".rg-curb")) {
    b.onclick = () => {
      document.querySelectorAll(".rg-curb").forEach((x) => x.classList.toggle("on", x === b));
      state.cur = b.dataset.cur;
      state.shown = PAGE;
      renderPlist();
      if (state.metric === "dist") renderLegend(paintMap());
    };
  }
  $("pmore").onclick = () => {
    state.shown += PAGE;
    renderPlist();
  };
  const activate = (li) => {
    if (li.classList.contains("rg-person")) {
      state.person = li.dataset.person;
      state.project = null;
      state.shown = PAGE;
      renderProject();
      renderPlist();
      return;
    }
    if (li.classList.contains("rg-ci")) {
      if (li.dataset.shape) {
        pickShape(li.dataset.shape);
      } else {
        state.shape = null;
        state.countryOnly = li.dataset.country;
        state.project = null;
        state.shown = PAGE;
        for (const el of document.querySelectorAll(".rg-sh.on")) el.classList.remove("on");
        renderProject();
        renderPlist();
      }
      return;
    }
    state.project = Number(li.dataset.i);
    for (const el of document.querySelectorAll(".rg-pi.on")) el.classList.remove("on");
    li.classList.add("on");
    renderProject();
  };
  $("plist").addEventListener("click", (ev) => {
    if (ev.target.closest(".rg-all-ranking-btn")) {
      state.mode = "people";
      state.shape = null;
      state.countryOnly = null;
      state.person = null;
      state.project = null;
      state.sort = "dist";
      state.shown = PAGE;
      $("sort").value = "dist";
      for (const el of document.querySelectorAll(".rg-sh.on")) el.classList.remove("on");
      renderProject();
      renderPlist();
      return;
    }
    const countryAction = ev.target.closest(".rg-ci-action");
    if (countryAction) {
      const li = countryAction.closest(".rg-ci");
      const people = countryAction.dataset.countryView === "people";
      state.mode = people ? "people" : "places";
      state.person = null;
      state.project = null;
      state.shown = PAGE;
      if (people) {
        state.sort = "dist";
        $("sort").value = "dist";
      }
      if (li.dataset.shape) {
        pickShape(li.dataset.shape);
      } else {
        state.shape = null;
        state.countryOnly = li.dataset.country;
        for (const el of document.querySelectorAll(".rg-sh.on")) el.classList.remove("on");
        renderProject();
        renderPlist();
      }
      return;
    }
    const li = ev.target.closest(".rg-pi, .rg-ci, .rg-person");
    if (li) activate(li);
  });
  $("plist").addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const li = ev.target.closest(".rg-pi, .rg-ci, .rg-person");
    if (!li) return;
    ev.preventDefault();
    activate(li);
  });
  wireFullscreen();
}

function renderHead() {
  const { ledger } = state.geo;
  const counts = state.projects.counts;
  const countries = new Set(state.projects.rows.map((r) => r.c).filter(Boolean));
  $("fig-rows").textContent = num(counts.rows);
  $("fig-countries").textContent = num(countries.size);
  $("fig-unplaced").textContent = num(ledger.total_proposals - counts.rows);
  $("n-total").textContent = num(ledger.total_proposals);
  $("hero-foot").textContent =
    `プロジェクト取得 ${state.projects.source.fetched_at}` +
    ` ／ 台帳生成 ${ledger.generated_at}` +
    ` ／ 名前まで辿れたもの ${num(counts.with_names)} 件`;
}

(async () => {
  try {
    wireControls();
    // 生成物が変わったときに確実に読み直させる。build のたびに手で上げる。
    const V = "2026-09-05c";
    const [geoRes, worldRes, projRes, jaRes] = await Promise.all([
      fetch(`data/geo.json?v=${V}`),
      fetch(`data/world.json?v=${V}`),
      fetch(`data/projects.json?v=${V}`),
      fetch(`data/projects-ja.json?v=${V}`),
    ]);
    for (const [r, p] of [
      [geoRes, "geo"],
      [worldRes, "world"],
      [projRes, "projects"],
      [jaRes, "projects-ja"],
    ]) {
      if (!r.ok) throw new Error(`data/${p}.json: ${r.status}`);
    }
    state.geo = await geoRes.json();
    state.world = await worldRes.json();
    state.projects = await projRes.json();
    state.projectJa = await jaRes.json();

    renderHead();
    buildMap();
    renderLegend(paintMap());
    renderJump();
    renderPlist();
    renderProject();
    renderOffmap();
    renderGap();
    renderDefects();
    renderCountryTable();
  } catch (e) {
    console.error(e);
    $("hero-foot").textContent = `読み込み失敗: ${e.message}`;
  }
})();
