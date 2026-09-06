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
/* 分野の日本語。Catalyst Japan の表記を引き継ぐ。記録（英語）は書き換えない。 */
const FIELD_JA = {
  "Community & Outreach": "コミュニティ & アウトリーチ",
  "Development & Tools": "開発 & ツール",
  "Events & Marketing": "イベント & マーケティング",
  "Identity & Security": "アイデンティティ & セキュリティ",
  "Real World Applications": "リアルワールド応用",
  "Smart Contracts": "スマートコントラクト",
  "Interoperability": "相互運用性",
  "Sustainability": "サステナビリティ",
  "Governance": "ガバナンス",
  "Education": "教育",
  "DeFi": "DeFi",
  "GameFi": "GameFi",
  "NFT": "NFT",
};

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

/* 状態フラグの表示。意味の定義は catalyst/flags.py にあり、projects.json が運んでくる。
   ここは絵柄と短い呼び名だけを持つ。判定はしない。 */
const FLAG_FACE = {
  stopped:    { mark: "■", name: "停止" },
  unfunded:   { mark: "◇", name: "不発" },
  overdue:    { mark: "▲", name: "期限超過" },
  active_gap: { mark: "◷", name: "進行中ギャップ" },
  past_gap:   { mark: "◠", name: "過去ギャップ" },
  late_done:  { mark: "◔", name: "遅れて完了" },
  long:       { mark: "◆", name: "長期化" },
};

/* 完了報告の動画。記録は全件 youtu.be/{id} の形。その形以外は埋め込まず、
   リンクとして出す。組み立てた ID を再生しない。 */
const YT_RE = new RegExp('^https?://youtu\.be/([A-Za-z0-9_-]{6,20})');
const videoId = (u) => {
  const m = YT_RE.exec(String(u || ""));
  return m ? m[1] : null;
};

/* 地球儀（正射図法）。平面と同じ国境データを、経緯度から球面に投影して描く。
   外部ライブラリは使わない。回転は角度を持つだけで、データは触らない。 */
const GLOBE = { on: false, lon: 10, lat: 20, r: 470 };
const RAD = Math.PI / 180;

/* 経緯度を球面上の位置へ。裏側（視点から見えない側）は null を返す。 */
function orthographic(lon, lat) {
  const l = (lon - GLOBE.lon) * RAD;
  const p = lat * RAD;
  const p0 = GLOBE.lat * RAD;
  const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
  if (cosc < 0) return null; // 地球の裏側
  return [
    GLOBE.r * Math.cos(p) * Math.sin(l),
    -GLOBE.r * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l)),
  ];
}

/* 環を球面に写す。裏側へ回った点で切り、見えている部分だけを描く。
   切れ端をつながないのは、見えないところを想像で埋めないため。 */
function globePath(rings) {
  let d = "";
  for (const ring of rings) {
    let open = false;
    for (const [lon, lat] of ring) {
      const p = orthographic(lon, lat);
      if (!p) {
        open = false;
        continue;
      }
      d += (open ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1);
      open = true;
    }
  }
  return d;
}

/* 生成データの版。build し直したら上げる。 */
const DATA_V = "2026-09-06-timeline";

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

/* 桁を丸めて読めるようにする。大きい額を生の数字で出すと比べられない。
   丸めた値は概数であり、正確な額は詳細の行に出す。 */
function compactAmt(v, code) {
  const n = Math.abs(v);
  if (n >= 1e6) return `${(v / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M ${code}`;
  if (n >= 1e3) return `${(v / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K ${code}`;
  return `${num(Math.round(v))} ${code}`;
}

/* 主表示と副表示を組にする。ADA と USD は換算しないので、
   副に置くのは同じ通貨の正確な額（丸める前の値）。 */
function dualAmt(v, code) {
  return (
    `<span class="rg-amt-main">${esc(compactAmt(v, code))}</span>` +
    `<span class="rg-amt-sub" title="${esc(num(Math.round(v)) + " " + code)}">${esc(
      num(Math.round(v))
    )}</span>`
  );
}
const $ = (id) => document.getElementById(id);
const cssId = (s) => String(s).replace(/[^A-Za-z0-9]/g, "_");
const cname = (n) => (state.lang === "ja" ? COUNTRY_JA[n] || n : n);
const fname = (n) => (state.lang === "ja" ? FIELD_JA[n] || n : n);

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
  soloOnly: false, // 人物ランキングを単独提案だけで並べるか
  sort: "dist",
  stf: "",
  cur: "ADA",
  shown: PAGE,
  view: null,
  home: null,
  dragged: false,
};

// 主題は必ず原文にする。訳は機械が付けたもので、意味が反転することがある
// （Vitality を「死亡率」と訳すなど）。誤訳が記録に見えてはいけないので、
// 太字の主題は原文、訳はその下に「機械訳」と断って小さく添える。
const projectTitle = (r) => r.n;
const projectOriginal = (r) =>
  state.lang === "ja" && state.projectJa[r.url] && state.projectJa[r.url] !== r.n
    ? `<span class="rg-original" lang="ja">${esc(state.projectJa[r.url])}</span>`
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
    // 共同提案の件数。その額は他の人にも同じだけ計上されるので、足し合わせられない。
    g.shared = g.idx.filter((i) => (rows[i].who || []).length > 1).length;
    // 単独提案だけの件数。共著の額は他の人にも計上されるので、分けて数える。
    g.solo = g.idx.filter((i) => (rows[i].who || []).length === 1).length;
    g.sum = { dist: {}, req: {} };
    g.soloSum = { dist: {}, req: {} };
    g.yes = 0;
    for (const i of g.idx) {
      const r = rows[i];
      const isSolo = (r.who || []).length === 1;
      for (const key of ["dist", "req"]) {
        const m = r[key];
        if (!m || !m.v) continue;
        g.sum[key][m.code] = (g.sum[key][m.code] || 0) + m.v;
        if (isSolo) g.soloSum[key][m.code] = (g.soloSum[key][m.code] || 0) + m.v;
      }
      if (r.yes) g.yes += r.yes.v;
    }
  }
  const val = (g) => {
    // 単独のみで並べるときは、共著を含まない額を基準にする。
    if (state.soloOnly && (state.sort === "dist" || state.sort === "req"))
      return g.soloSum[state.sort][state.cur] || 0;
    if (state.sort === "dist" || state.sort === "req") return g.sum[state.sort][state.cur] || 0;
    if (state.sort === "done") return g.completed;
    if (state.sort === "yes") return g.yes;
    return state.soloOnly ? g.solo : g.funded;
  };
  list.sort((a, b) => val(b) - val(a) || b.funded - a.funded || a.name.localeCompare(b.name));
  return list;
}

/* 人物の額は二本立てにする。
   1本目は関わったすべて（共同提案を含む。他の人にも同じ額が計上される）
   2本目は単独提案だけ（その人だけの額。足し合わせられる） */
function personAmount(g) {
  const key = state.sort === "req" ? "req" : "dist";
  if (state.sort === "dist" || state.sort === "req") {
    const all = g.sum[key][state.cur] || 0;
    const solo = g.soloSum[key][state.cur] || 0;
    return (
      `<span class="rg-amt-main">${esc(compactAmt(all, state.cur))}</span>` +
      `<span class="rg-amt-sub" title="${esc(
        "関わったすべて " + num(all) + " ／ 単独提案だけ " + num(solo) + " " + state.cur
      )}">単独 ${esc(compactAmt(solo, state.cur))}</span>`
    );
  }
  if (state.sort === "done") return `完了 ${num(g.completed)}`;
  if (state.sort === "yes") return `Yes ${num(Math.round(g.yes / 1e6))}M`;
  return (
    `<span class="rg-amt-all">${num(g.funded)} 件</span>` +
    `<span class="rg-amt-solo" title="単独提案だけの件数">単独 ${num(g.solo)}</span>`
  );
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
  /* 狭い画面では内訳が選択肢を押し下げるので畳む。広い画面では開いたまま。 */
  const sw = $("sumwrap");
  if (sw) sw.open = !(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);
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
    return dualAmt(g.sum[state.sort][state.cur] || 0, state.cur);
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
    // 二重計上は読み違えの元なので、要約に埋めずランキングの直前に置く。
    /* 断りと選択肢を同じ塊に置くと、狭い画面では説明が選択肢を押し下げてしまう。
       断りの一行目だけ残し、理由はたたむ。広い画面では開いたまま出す。 */
    const wide = !(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);
    const caution =
      `<li class="rg-caution">` +
      `<span class="rg-solo-sw">` +
      `<button type="button" class="rg-solo-b${state.soloOnly ? "" : " on"}" data-solo="0">関わったすべて</button>` +
      `<button type="button" class="rg-solo-b${state.soloOnly ? " on" : ""}" data-solo="1">単独提案だけ</button>` +
      `</span>` +
      `<details class="rg-why"${wide ? " open" : ""}>` +
      `<summary><strong>この順位は足し合わせられない。</strong></summary>` +
      `<span class="rg-why-b">` +
      `共同提案は関わった各人にプロジェクトの全額を計上している。` +
      `${num(groups.length)} 人の額を合計すると、${num(idx.length)} 件の総額を超える。` +
      `人物は名前の完全一致でまとめている。同姓同名は分けられない。` +
      `</span></details>` +
      `</li>`;
    $("plist").innerHTML = caution + groups
      .slice(0, state.shown)
      .map(
        (g, rank) => `<li class="rg-person" data-person="${esc(g.name)}" tabindex="0" role="button">
          <span class="rg-rank">#${num(rank + 1)}</span>
          <span class="rg-person-n">${esc(g.name)}${
            g.shared
              ? `<span class="rg-dup" title="${esc(
                  num(g.shared) + " 件が共同提案。その額は他の人にも同じだけ計上されている"
                )}">※${num(g.shared)}</span>`
              : ""
          }</span>
          <span class="rg-pi-a rg-pi-a2">${personAmount(g)}</span>
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
          <span class="rg-pi-a rg-pi-a2">${groupAmount(g)}</span>
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
        <span class="rg-pi-n">${esc(projectTitle(r))}${dupMark(r)}${projectOriginal(r)}</span>
        <span class="rg-pi-a">${esc(amountLabel(r))}</span>
        <span class="rg-pi-s">${esc([r.fund, fname(r.g), who].filter(Boolean).join(" ・ "))}${miniFlags(r)}</span>
      </li>`;
    })
    .join("");
  $("pempty").hidden = idx.length !== 0;
  $("pmore").hidden = idx.length <= state.shown;
}

// --- プロジェクト詳細 -------------------------------------------------------

/* 資金が重なっている印。共同提案の額は、人物別に見ると各人に計上される。
   足し合わせられないことを、行そのものに書く。 */
function dupMark(r) {
  const n = (r.who || []).length;
  if (n <= 1) return "";
  return (
    '<span class="rg-dup" title="' +
    esc(n + " 人の共同提案。人物別に見ると、この額は各人に計上されている") +
    '">\u203b</span>'
  );
}

/* 一覧の行に添える小さな印。名前は出さず、絵柄だけ。 */
function miniFlags(r) {
  const list = r.fl || [];
  const vid = r.vid ? '<span class="rg-mini rg-mini-v" title="完了報告の動画あり">▶</span>' : "";
  if (!list.length && !vid) return "";
  const meta = (state.projects.flags || {}).labels || {};
  return (
    vid +
    list
      .map((f) => {
        const face = FLAG_FACE[f] || { mark: "・", name: f };
        return '<span class="rg-mini" title="' + esc(meta[f] || f) + '">' + face.mark + "</span>";
      })
      .join("")
  );
}

/* 状態フラグ。旗そのものより、何日・何年かのほうが情報である。 */
function flagsHtml(r) {
  const list = r.fl || [];
  if (!list.length && r.yr == null) return "";
  const meta = (state.projects.flags || {}).labels || {};
  const chips = list
    .map((f) => {
      const face = FLAG_FACE[f] || { mark: "・", name: f };
      let extra = "";
      if (f === "long" && r.ly) extra = " " + r.ly + "年+";
      if ((f === "active_gap" || f === "past_gap") && r.gap) extra = " " + num(r.gap) + "日";
      return (
        '<span class="rg-flag" title="' + esc(meta[f] || f) + '">' +
        '<span class="rg-flag-m">' + face.mark + "</span>" +
        esc(face.name + extra) + "</span>"
      );
    })
    .join("");

  const facts = [];
  if (r.val) {
    const usd0 = (n) => "$" + Math.round(n).toLocaleString("en-US");
    const d = Math.round((r.val[2] - 1) * 100);
    facts.push(
      `約束 ${usd0(r.val[0])} → 受取 ${usd0(r.val[1])}（${d >= 0 ? "+" : ""}${d}%）`
    );
  }
  if (r.yr != null) facts.push("採択から " + r.yr + " 年");
  if (r.ovr != null) facts.push("計画の " + r.ovr + " 倍");
  if (r.chg) facts.push("計画変更 " + num(r.chg) + " 回");

  return (
    (chips ? '<div class="rg-flags">' + chips + "</div>" : "") +
    (facts.length ? '<p class="rg-pv-facts">' + esc(facts.join(" ／ ")) + "</p>" : "")
  );
}

/* 完了報告。動画があれば埋め込み、報告書があれば現物への口を置く。
   この層でいちばん価値のある出口である。 */
function reportHtml(r) {
  const vid = videoId(r.vid);
  const parts = [];
  if (vid) {
    parts.push(
      '<div class="rg-video"><iframe src="https://www.youtube-nocookie.com/embed/' + esc(vid) +
      '" title="完了報告の動画" loading="lazy" allowfullscreen' +
      ' referrerpolicy="strict-origin-when-cross-origin"' +
      ' allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"></iframe></div>'
    );
  } else if (r.vid) {
    parts.push(
      '<p class="rg-pv-links"><a href="' + esc(r.vid) +
      '" target="_blank" rel="noopener noreferrer">完了報告の動画を見る</a></p>'
    );
  }
  if (r.rep) {
    parts.push(
      '<p class="rg-pv-links"><a href="' + esc(r.rep) +
      '" target="_blank" rel="noopener noreferrer">完了報告書を読む</a></p>'
    );
  }
  if (!parts.length) {
    return r.st === "Completed"
      ? '<p class="rg-pv-miss">完了と記録されているが、報告が見つからない。</p>'
      : "";
  }
  return '<p class="rg-pv-k">完了報告</p>' + parts.join("");
}

/* 約束と報告。マイルストーンごとに、提案で何をやろうとしていたのかと、
   完了報告で何が報告されたのかを、そろえて並べる。判断はしない。 */
const EV_CACHE = {};
const EV_JA_CACHE = {};

async function loadEvidence(pid) {
  if (EV_CACHE[pid] !== undefined) return EV_CACHE[pid];
  try {
    const res = await fetch(`data/evidence/${encodeURIComponent(pid)}.json`);
    EV_CACHE[pid] = res.ok ? await res.json() : null;
  } catch (e) {
    EV_CACHE[pid] = null;
  }
  return EV_CACHE[pid];
}

/* 日本語訳。原文とは別のファイルに置いてある。機械翻訳なので原文も必ず読めるようにする。
   訳がまだ無いプロジェクトもある。その場合は黙って原文を出す。 */
let EV_JA_OK = null; // 訳の置き場があるかどうか。一度確かめたら覚える。

async function loadEvidenceJa(pid) {
  if (EV_JA_CACHE[pid] !== undefined) return EV_JA_CACHE[pid];
  if (EV_JA_OK === false) return null;
  try {
    const res = await fetch(`data/evidence-ja/${encodeURIComponent(pid)}.json`);
    if (res.ok) {
      EV_JA_OK = true;
      EV_JA_CACHE[pid] = await res.json();
    } else {
      // 一件も見つからないうちは、置き場そのものが無いとみなして以後は探さない。
      if (EV_JA_OK === null) EV_JA_OK = false;
      EV_JA_CACHE[pid] = null;
    }
  } catch (e) {
    EV_JA_CACHE[pid] = null;
  }
  return EV_JA_CACHE[pid];
}

function evidenceHtml(ev, r, ja) {
  if (!ev || !(ev.ms || []).length) return "";
  const labels = (state.projects.evidence || {}).labels || {};
  const cur = (r.dist || {}).code || (r.req || {}).code || "";
  const jaBy = {};
  for (const m of (ja && ja.ms) || []) jaBy[m.no] = m;

  /* 訳があれば訳を主にし、原文はたたんで下に置く。原文を消さない。 */
  const text = (m, field) => {
    const src = m[field] || "";
    const tr = state.lang === "ja" ? (jaBy[m.no] || {})[field] : null;
    if (!tr) return `<p class="rg-ev-t">${esc(src || "記録なし")}</p>`;
    return (
      `<p class="rg-ev-t">${esc(tr)}</p>` +
      `<details class="rg-ev-src"><summary>原文</summary>` +
      `<p class="rg-ev-t rg-ev-en" lang="en">${esc(src)}</p></details>`
    );
  };

  const rows = ev.ms
    .map((m) => {
      const marks = (m.kinds || [])
        .map((k) => `<span class="rg-ev-kind">${esc(labels[k] || k)}</span>`)
        .join("");
      const head = [
        `MS${esc(m.no)}`,
        m.month ? `${esc(m.month)}ヶ月目` : "",
        m.cost ? `${num(m.cost)} ${esc(cur)}` : "",
      ]
        .filter(Boolean)
        .join(" ・ ");

      return `<li class="rg-ev">
        <div class="rg-ev-h">
          <span class="rg-ev-no">${esc(head)}</span>
          <span class="rg-ev-marks">${marks}${
        m.links ? `<span class="rg-ev-links">リンク ${num(m.links)}</span>` : ""
      }</span>
        </div>
        <div class="rg-ev-pair">
          <div class="rg-ev-col">
            <span class="rg-ev-k">提案で約束したこと</span>
            ${text(m, "promise")}
            ${m.criteria ? `<span class="rg-ev-k rg-ev-k2">成功の基準</span>${text(m, "criteria")}` : ""}
          </div>
          <div class="rg-ev-col">
            <span class="rg-ev-k">完了報告で報告されたこと</span>
            ${text(m, "report")}
          </div>
        </div>
        ${m.cut ? `<p class="rg-ev-cut">長いので途中まで。全文は完了報告書にある。</p>` : ""}
        ${
          m.promise && m.report
            ? `<details class="rg-ask" data-ms="${esc(m.no)}">
                 <summary>この2つについて質問する</summary>
                 <div class="rg-ask-body"></div>
               </details>`
            : ""
        }
      </li>`;
    })
    .join("");

  return (
    `<div class="rg-ev-head">` +
    `<p class="rg-pv-k">約束と報告</p>` +
    `<button type="button" class="rg-copyall" id="ev-copy">` +
    `提案・マイルストーン・完了報告をまとめてコピー</button>` +
    `</div>` +
    `<p class="rg-ev-note">提案で何をやろうとしていたのかと、完了報告で何が報告されたのか。` +
    `どちらも記録のまま並べている。<strong>達成・未達の判断はしていない。</strong>` +
    (state.lang === "ja"
      ? `<br>日本語は機械翻訳。誤りうるので、原文を開いて確かめられるようにしてある。`
      : "") +
    `</p>` +
    `<ul class="rg-evs">${rows}</ul>`
  );
}

/* 全部まとめてコピーする。外のAIに自分で貼るための道具。
   要約しない。並べ替えない。原文のまま、項目に分けて出す。
   訳は入れない。誤訳のまま外へ持ち出されないようにする。 */

const RULE = "════════════════════════════════════════";

function copyText(r, ev) {
  const L = [];
  /* AI が読む前提なので「ラベル: 値」で固定する。桁揃えは幅の違う文字で崩れるし、
     元データに紛れ込んだ空白やタブはそのまま渡さない。 */
  const clean = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  /* 約束・条件・報告の本文は改行が意味を持つ（箇条書き）。行はそのまま残し、
     行末の空白と、空行の続きすぎだけを整える。 */
  const body = (v) =>
    String(v == null ? "" : v)
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((ln) => ln.replace(/[ \t　]+$/, "").replace(/^[ \t]+/, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  const put = (k, v) => { const t = clean(v); if (t) L.push(k ? `${k}: ${t}` : `  ${t}`); };
  const head = (n, title) => { L.push("", RULE, `${n}. ${title}`, RULE, ""); };
  const usd0 = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const ms = (ev && ev.ms) || [];

  L.push("Catalyst プロジェクト一括（原文・公開情報のみ）");
  L.push(`取得: ${clean((state.projects.source || {}).fetched_at) || "—"}`);
  L.push("");
  L.push("このテキストは、ひとつの提案について公開記録を原文のまま並べたものです。");
  L.push("要約も並べ替えも判断もしていません。事実として読み取れるのは次の5点です。");
  L.push("  1. いくら受け取ったのか");
  L.push("  2. 何をやろうとしたのか（提案）");
  L.push("  3. 何を行うと約束したのか（マイルストーン）");
  L.push("  4. 何ができたと報告されたのか（完了報告）");
  L.push("  5. どれくらいの期間の予定で、実際はどうだったのか");

  /* ---- 1. 金 ---- */
  head(1, "いくら受け取ったのか");
  put("申請", money(r.req));
  put("配分済み（受け取った額）", money(r.dist));
  if (r.req && r.dist && r.req.code === r.dist.code && r.req.v >= r.dist.v) {
    const rest = r.req.v - r.dist.v;
    if (rest > 0) put("未配分", `${num(rest)} ${r.dist.code}`);
  }
  if (r.val) {
    const d = Math.round((r.val[2] - 1) * 100);
    put("ドルに直すと", `約束された時点 ${usd0(r.val[0])} → 受け取った時点 ${usd0(r.val[1])}（${d >= 0 ? "+" : ""}${d}%）`);
    L.push("  ※ 額は ADA で決まる。ADA の価格は日々動くので、ドルは各時点の価格で換算している。");
  }
  if (ms.length) {
    const planned = ms.reduce((a, m) => a + (Number(m.cost) || 0), 0);
    if (planned) put("マイルストーンの合計（提案時の内訳）", usd0(planned));
  }

  /* ---- 2. 提案 ---- */
  head(2, "何をやろうとしたのか（提案）");
  put("名称", r.n);
  put("Fund", r.fund);
  put("チャレンジ", r.cat);
  put("分野", r.g);
  put("国", r.c || "記録なし");
  put("提案者", (r.who || []).join(" / ") || "台帳と突き合わせできず");
  if ((r.who || []).length > 1) put("", `※ ${r.who.length} 人の共同提案。額はこの提案に対して一度だけ配分されている`);
  put("タグ", (r.tg || []).join(", "));
  put("提案ページ", r.url);

  /* ---- 3. 約束 ---- */
  head(3, "何を行うと約束したのか（マイルストーン）");
  if (!ms.length) {
    L.push("記録なし");
  } else {
    put("マイルストーン数", `${ms.length} 件`);
    L.push("");
    for (const m of ms) {
      const h = [`マイルストーン ${m.no}`, m.month ? `${m.month} か月目` : "", m.cost ? usd0(m.cost) : ""]
        .filter(Boolean).join(" ／ ");
      L.push(`── ${h} ──`);
      L.push("[やると約束したこと]");
      L.push(body(m.promise) || "記録なし");
      L.push("");
      L.push("[達成したと言える条件]");
      L.push(body(m.criteria) || "記録なし");
      L.push("");
    }
  }

  /* ---- 4. 報告 ---- */
  head(4, "何ができたと報告されたのか（完了報告）");
  put("状態", (STATUS_JA[r.st] || r.st || "") + (r.done ? `（${r.done}）` : ""));
  put("完了報告書", r.rep && r.rep !== "n/a" ? r.rep : "");
  L.push("");
  if (!ms.length) {
    L.push("記録なし");
  } else {
    for (const m of ms) {
      L.push(`── マイルストーン ${m.no} ──`);
      L.push(body(m.report) || "報告の記録なし");
      if (m.cut) L.push("（長いので途中まで。全文は完了報告書にある）");
      L.push("");
    }
  }

  /* ---- 5. 期間 ---- */
  head(5, "どれくらいの期間の予定で、実際はどうだったのか");
  const lastMonth = ms.reduce((a, m) => Math.max(a, Number(m.month) || 0), 0);
  if (lastMonth) put("予定", `最後のマイルストーンが ${lastMonth} か月目。提案時点の計画`);
  if (r.yr != null) put("実際", `採択が決まってから ${r.yr} 年（約 ${Math.round(r.yr * 12)} か月）`);
  if (r.ovr != null) put("予定に対して", `${r.ovr} 倍（1.0 が計画どおり。下回れば早い、上回れば長い）`);
  if (r.chg) put("計画変更", `${num(r.chg)} 回`);
  if (r.gap) put("いちばん長い空白", `${num(r.gap)} 日（承認と承認のあいだ）`);
  const meta = (state.projects.flags || {}).labels || {};
  const fl = (r.fl || []).map((k) => {
    const face = FLAG_FACE[k] || { name: k };
    let ex = "";
    if (k === "long" && r.ly) ex = ` ${r.ly}年+`;
    if ((k === "active_gap" || k === "past_gap") && r.gap) ex = ` ${num(r.gap)}日`;
    /* 旗の名前と説明が二重にならないようにする（「過去ギャップ（過去ギャップ（…））」を避ける） */
    let note = clean(meta[k] || "");
    if (note.startsWith(face.name)) note = note.slice(face.name.length).replace(/^[（(]|[）)]$/g, "");
    return `${face.name}${ex}${note ? ` — ${note}` : ""}`;
  });
  if (fl.length) {
    L.push("");
    L.push("状態フラグ:");
    for (const f of fl) L.push(`  ・${f}`);
  }
  L.push("");
  L.push("  ※ 「実際」と「予定に対して」は、公開されている日付から計算したもの。");
  L.push("     起点は採択が決まった日、終点は最後の承認日（無ければ完了報告の日）。");
  L.push("     遅い・早いを評価したものではない。");

  /* ---- 末尾 ---- */
  L.push("", RULE, "このテキストについて", RULE, "");
  L.push("すべて公開情報。提案・マイルストーン・完了報告を原文のまま項目に分けて並べただけで、");
  L.push("要約も並べ替えもしていない。達成・未達の判断はどこにも書かれていない。");
  L.push("日本語訳は含めていない（機械翻訳で誤りうるため）。読んで決めるのはあなた。");
  L.push("出典: projectcatalyst.io ／ milestones.projectcatalyst.io");

  return L.join("\n");
}

async function toClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    /* クリップボードが使えない場面（安全でない接続など）の逃げ道 */
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
    ta.remove();
    return ok;
  }
}

function wireCopyAll(ev) {
  const btn = document.getElementById("ev-copy");
  if (!btn) return;
  btn.onclick = async () => {
    const r = state.projects.rows[state.project];
    const text = copyText(r, ev);
    const ok = await toClipboard(text);
    const before = btn.textContent;
    btn.textContent = ok
      ? `コピーしました（${num(text.length)} 文字）`
      : "コピーできなかった。選んで手で写してください";
    btn.classList.toggle("on", ok);
    setTimeout(() => { btn.textContent = before; btn.classList.remove("on"); }, 2600);
  };
}

/* 質問する。こちらからは何も指示しない。何を聞くかは読む人が決める。
   答えは保存しない。これは読む人の道具であって、サイトの記録ではない。 */
function wireAsk(ev) {
  const slot = document.getElementById("ev-slot");
  if (!slot) return;
  wireCopyAll(ev);
  const byNo = {};
  for (const m of ev.ms || []) byNo[String(m.no)] = m;

  for (const box of slot.querySelectorAll(".rg-ask")) {
    box.addEventListener(
      "toggle",
      () => {
        if (!box.open) return;
        const body = box.querySelector(".rg-ask-body");
        if (body.dataset.ready) return;
        body.dataset.ready = "1";
        renderAskBody(body, byNo[box.dataset.ms]);
      },
      { once: false }
    );
  }
}

function renderAskBody(body, ms) {
  if (!ms) return;
  const saved = askStore.read();
  body.innerHTML =
    `<p class="rg-ask-note">上の A（提案で約束したこと）と B（完了報告で報告されたこと）を` +
    `そのまま AI に渡します。<strong>こちらからは何も指示しません。</strong>` +
    `何を聞くかは、あなたが決めてください。` +
    `<br>無料の API キー（Groq）を取っていれば使えます。</p>` +
    `<textarea class="rg-ask-q" rows="2" placeholder="例：この2つに誤差はありますか／Aにあって Bに無いものは何ですか"></textarea>` +
    `<div class="rg-ask-row">` +
    (saved.key
      ? `<button type="button" class="rg-ask-send">聞く</button>` +
        `<span class="rg-ask-who">${esc(
          (ASK_PROVIDERS[saved.provider] || {}).label || saved.provider
        )}</span>` +
        `<button type="button" class="rg-ask-forget">鍵を消す</button>`
      : `<button type="button" class="rg-ask-setup">鍵を入れる</button>`) +
    `</div>` +
    `<div class="rg-ask-out"></div>`;

  const out = body.querySelector(".rg-ask-out");
  const setup = () => {
    out.innerHTML = askKeyFormHtml();
    wireAskKeyForm(out, () => renderAskBody(body, ms));
  };

  const setupBtn = body.querySelector(".rg-ask-setup");
  if (setupBtn) setupBtn.onclick = setup;

  const forget = body.querySelector(".rg-ask-forget");
  if (forget)
    forget.onclick = () => {
      askStore.clear();
      renderAskBody(body, ms);
    };

  const send = body.querySelector(".rg-ask-send");
  if (send)
    send.onclick = async () => {
      const q = body.querySelector(".rg-ask-q").value.trim();
      if (!q) {
        out.innerHTML = `<p class="rg-ask-err">質問を書いてください。</p>`;
        return;
      }
      const key = askStore.read();
      send.disabled = true;
      out.innerHTML = `<p class="rg-ask-wait">聞いています…</p>`;
      try {
        const answer = await askProvider(key.provider, key.key, askBuildText(ms, q));
        out.innerHTML =
          `<div class="rg-ask-a">` +
          `<p class="rg-ask-note">${esc(
            (ASK_PROVIDERS[key.provider] || {}).label || key.provider
          )} の答え。holders CORE の記録ではない。保存していない。</p>` +
          `<p class="rg-ask-t">${esc(answer)}</p></div>`;
      } catch (e) {
        out.innerHTML = `<p class="rg-ask-err">聞けなかった: ${esc(e.message)}</p>`;
      }
      send.disabled = false;
    };
}

function askKeyFormHtml() {
  const opts = Object.entries(ASK_PROVIDERS)
    .map(([k, v]) => `<option value="${esc(k)}">${esc(v.label)}</option>`)
    .join("");
  return (
    `<div class="rg-ask-key">` +
    `<p class="rg-ask-note">鍵はこの端末にだけ置きます。聞く先以外のどこにも送りません。` +
    `<br>Groq は無料で鍵が取れます（クレジットカード不要）。</p>` +
    `<div class="rg-ask-row"><select class="rg-ask-p">${opts}</select>` +
    `<input type="password" class="rg-ask-i" placeholder="API キー" autocomplete="off">` +
    `<button type="button" class="rg-ask-save">使う</button></div>` +
    `<p class="rg-ask-hint"></p></div>`
  );
}

function wireAskKeyForm(out, done) {
  const sel = out.querySelector(".rg-ask-p");
  const input = out.querySelector(".rg-ask-i");
  const hint = out.querySelector(".rg-ask-hint");
  const show = () => {
    const p = ASK_PROVIDERS[sel.value] || {};
    hint.innerHTML = p.site
      ? `<a href="${esc(p.site)}" target="_blank" rel="noopener noreferrer">${esc(p.hint)}</a>`
      : esc(p.hint || "");
  };
  sel.onchange = show;
  show();
  out.querySelector(".rg-ask-save").onclick = () => {
    const key = input.value.trim();
    if (!key) return;
    askStore.write({ provider: sel.value, key });
    done();
  };
}

async function fillEvidence(pid, token) {
  const slot = document.getElementById("ev-slot");
  if (!slot) return;
  const [ev, ja] = await Promise.all([
    loadEvidence(pid),
    state.lang === "ja" ? loadEvidenceJa(pid) : Promise.resolve(null),
  ]);
  // 読んでいる間に別のプロジェクトへ移っていたら捨てる。
  if (state.project !== token) return;
  const row = state.projects.rows[token];
  slot.innerHTML = ev ? evidenceHtml(ev, row, ja) : "";
  if (ev) wireAsk(ev);
}

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
       ${line("分野", esc(fname(r.g) || "—"))}
       ${line("申請", esc(money(r.req)))}
       ${line("配分済み", esc(money(r.dist)))}
       ${line("投票", r.yes ? `Yes ${esc(num(r.yes.v))} ${esc(r.yes.code)}・投票数 ${esc(num(r.votes))}` : "")}
     </div>
     ${flagsHtml(r)}
     ${reportHtml(r)}
     <div id="ev-slot">${r.ev ? `<p class="rg-ev-load">約束と報告を読み込んでいる…（${num(r.evn)} マイルストーン）</p>` : ""}</div>
     ${
       who
         ? `<p class="rg-pv-k">関わった人${
             (r.who || []).length > 1
               ? `<span class="rg-dup-note">\u203b ${num(
                   (r.who || []).length
                 )} 人の共同提案。人物別の集計では、この額が各人に計上される</span>`
               : ""
           }</p><div class="rg-pv-whos">${who}</div>`
         : `<p class="rg-pv-miss">台帳と突き合わせできず、人の名前を出せない。</p>`
     }
     ${(r.tg || []).length ? `<p class="rg-pv-tags">${r.tg.map((t) => `<span class="tag">${esc(t)}</span>`).join(" ")}</p>` : ""}
     <p class="rg-pv-links">
       <a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">projectcatalyst.io で見る</a>
       ${r.x ? `<a href="${esc(r.x)}" target="_blank" rel="noopener noreferrer">Catalyst Explorer で見る</a>` : ""}
     </p>`;
  view.hidden = false;
  if (r.ev) fillEvidence(r.ev, state.project);
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
  // 平面は端から流れ出さないように収める。
  // 地球儀は球が原点にあるので、この制限をかけると中心がずれる。
  const home = state.home;
  if (home && !GLOBE.on) {
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
  // 地球儀では viewBox を動かさない。向きだけ初期へ戻す。
  if (GLOBE.on) {
    spinToward(10, 20);
    return;
  }
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

  // 球の海。地球儀のときだけ出す。
  const ocean = document.createElementNS(SVG_NS, "circle");
  ocean.setAttribute("id", "ocean");
  ocean.setAttribute("cx", "0");
  ocean.setAttribute("cy", "0");
  ocean.setAttribute("r", String(GLOBE.r));
  ocean.setAttribute("class", "rg-ocean");
  ocean.style.display = "none";

  // 星空。地球儀のときだけ出す。データではないので、うんと控えめに。
  // 位置は固定の数列から作る。読み込むたびに星が動くと落ち着かない。
  const stars = document.createElementNS(SVG_NS, "g");
  stars.setAttribute("id", "stars");
  stars.style.display = "none";
  let seed = 20260905;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const R2 = GLOBE.r;
  for (let i = 0; i < 260; i++) {
    const x = (rnd() - 0.5) * R2 * 4.2;
    const y = (rnd() - 0.5) * R2 * 3.4;
    // 球にかかる星は描かない。地球の向こうは見えない。
    if (Math.hypot(x, y) < R2 * 1.06) continue;
    const st = document.createElementNS(SVG_NS, "circle");
    st.setAttribute("cx", x.toFixed(1));
    st.setAttribute("cy", y.toFixed(1));
    st.setAttribute("r", (0.7 + rnd() * 1.9).toFixed(2));
    st.setAttribute("class", "rg-star");
    st.style.opacity = (0.25 + rnd() * 0.6).toFixed(2);
    stars.appendChild(st);
  }

  // 大気。球のふちにうっすら青い光を置く。
  const halo = document.createElementNS(SVG_NS, "circle");
  halo.setAttribute("id", "halo");
  halo.setAttribute("cx", "0");
  halo.setAttribute("cy", "0");
  halo.setAttribute("r", String(Math.round(GLOBE.r * 1.055)));
  halo.setAttribute("class", "rg-halo");
  halo.style.display = "none";

  // 陰影。球の左上から光が当たっているように見せる。データではない。
  const defs = document.createElementNS(SVG_NS, "defs");
  defs.innerHTML =
    '<radialGradient id="globeHalo" cx="50%" cy="50%" r="50%">' +
    '<stop offset="86%" stop-color="#7fc4ff" stop-opacity="0"/>' +
    '<stop offset="95%" stop-color="#7fc4ff" stop-opacity=".38"/>' +
    '<stop offset="100%" stop-color="#7fc4ff" stop-opacity="0"/>' +
    "</radialGradient>" +
    '<radialGradient id="globeShade" cx="32%" cy="28%" r="78%">' +
    '<stop offset="0%" stop-color="#ffffff" stop-opacity=".85"/>' +
    '<stop offset="55%" stop-color="#ffffff" stop-opacity="0"/>' +
    '<stop offset="100%" stop-color="#0b2a3a" stop-opacity=".30"/>' +
    "</radialGradient>";

  const shade = document.createElementNS(SVG_NS, "circle");
  shade.setAttribute("id", "shade");
  shade.setAttribute("cx", "0");
  shade.setAttribute("cy", "0");
  shade.setAttribute("r", String(GLOBE.r));
  shade.setAttribute("class", "rg-shade");
  shade.style.display = "none";

  const grid = document.createElementNS(SVG_NS, "path");
  grid.setAttribute("id", "grid");
  grid.setAttribute("class", "rg-grid");
  grid.style.display = "none";

  const equator = document.createElementNS(SVG_NS, "path");
  equator.setAttribute("id", "equator");
  equator.setAttribute("class", "rg-equator");
  equator.style.display = "none";

  svg.replaceChildren(defs, stars, halo, ocean, grid, equator, shapes, bubbles, marks, shade, clabels, labels);
  buildBadges(labels);
  buildCountryBadges(clabels);
  setView({ x: 0, y: 0, w: state.home.w, h: state.home.h });
  wireMap();
}

/* 経緯線。球であることを示すためだけの線で、データではない。
   経線は 30 度ごと、緯線は 30 度ごと。赤道だけ少し濃くする。 */
function graticulePath() {
  const seg = [];
  for (let lon = -180; lon < 180; lon += 30) {
    const pts = [];
    for (let lat = -80; lat <= 80; lat += 4) pts.push([lon, lat]);
    seg.push(pts);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 4) pts.push([lon, lat]);
    seg.push(pts);
  }
  return globePath(seg);
}

function equatorPath() {
  const pts = [];
  for (let lon = -180; lon <= 180; lon += 3) pts.push([lon, 0]);
  return globePath([pts]);
}

/* 地球儀の形を描き直す。回転のたびに呼ぶ。国の色や選択状態は触らない。 */
function drawGlobe() {
  const w = state.world;
  for (const name of Object.keys(w.countries)) {
    const geom = w.countries[name];
    const el = document.getElementById(`sh-${cssId(name)}`);
    if (!el) continue;
    if (geom.r) {
      el.setAttribute("d", globePath(geom.r));
    } else if (geom.ll) {
      // 面を持たない小国は点で置く。裏側なら消す。
      const pt = orthographic(geom.ll[0], geom.ll[1]);
      el.setAttribute("d", pt ? `M${pt[0].toFixed(1)} ${pt[1].toFixed(1)}m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0` : "");
    }
  }
  // 重ねる点も同じ球面へ
  for (const dot of document.querySelectorAll(".rg-dot")) {
    const geom = w.countries[dot.dataset.name];
    const pt = geom && geom.ll ? orthographic(geom.ll[0], geom.ll[1]) : null;
    dot.style.display = pt ? "" : "none";
    if (pt) {
      dot.setAttribute("cx", pt[0].toFixed(1));
      dot.setAttribute("cy", pt[1].toFixed(1));
    }
  }
  const g = document.getElementById("grid");
  if (g) g.setAttribute("d", graticulePath());
  const eq = document.getElementById("equator");
  if (eq) eq.setAttribute("d", equatorPath());

  paintMap();
  updateBadges();
}

/* 自動回転。触っていないときだけ、ゆっくり東へ回す。
   操作したら止め、しばらく置いてから再開する。動きを減らす設定なら回さない。 */
const SPIN = { id: null, idle: null, wait: 2500, speed: 0.045 };

function spinStop(resume) {
  if (SPIN.id) cancelAnimationFrame(SPIN.id);
  SPIN.id = null;
  clearTimeout(SPIN.idle);
  if (resume && GLOBE.on) SPIN.idle = setTimeout(spinStart, SPIN.wait);
}

function spinStart() {
  if (!GLOBE.on || SPIN.id) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // タブが裏にあるときは描画が止まる。戻ってきたら回し直す。
  if (document.hidden) {
    document.addEventListener("visibilitychange", () => spinStop(true), { once: true });
    return;
  }
  let prev = performance.now();
  const step = (now) => {
    const dt = Math.min(64, now - prev);
    prev = now;
    GLOBE.lon = ((GLOBE.lon - SPIN.speed * dt + 540) % 360) - 180;
    drawGlobe();
    SPIN.id = requestAnimationFrame(step);
  };
  SPIN.id = requestAnimationFrame(step);
}

/* 平面 ⇄ 地球儀。データは同じ。投影だけを替える。 */
function setGlobe(on) {
  GLOBE.on = on;
  const svg = $("map");
  const ocean = document.getElementById("ocean");
  document.getElementById("mapwrap").classList.toggle("rg-is-globe", on);
  for (const id of ["stars", "halo", "ocean", "grid", "equator", "shade"]) {
    const el = document.getElementById(id);
    if (el) el.style.display = on ? "" : "none";
  }

  if (on) {
    // 球を枠の中心に置く。preserveAspectRatio="xMidYMid meet" は viewBox の
    // 縦横比を保って収めるので、viewBox 自体を枠と同じ比率にしないと
    // 余白が片側に寄り、球が中心から外れる。
    const R = GLOBE.r;
    const box = $("map").getBoundingClientRect();
    const ratio = box.width && box.height ? box.width / box.height : 2;
    // 球の直径を、枠の短い辺に合わせる。上下には操作の帯が重なるので、
    // その分だけ余白を多めに取る。
    const d = R * 2.62;
    const w = ratio >= 1 ? d * ratio : d;
    const h = ratio >= 1 ? d : d / ratio;
    state.home = { x: -w / 2, y: -h / 2, w, h };
    setView({ ...state.home });
    drawGlobe();
    spinStop(true);
  } else {
    spinStop(false);
    const vb = state.world.view_box.split(" ").map(Number);
    state.home = { x: 0, y: 0, w: vb[2], h: vb[3] };
    // 平面の形に戻す
    for (const name of Object.keys(state.world.countries)) {
      const geom = state.world.countries[name];
      const el = document.getElementById(`sh-${cssId(name)}`);
      if (!el) continue;
      if (geom.d) el.setAttribute("d", geom.d);
      else el.setAttribute("d", "");
    }
    for (const dot of document.querySelectorAll(".rg-dot")) {
      const geom = state.world.countries[dot.dataset.name];
      dot.style.display = "";
      if (geom) {
        dot.setAttribute("cx", geom.c[0]);
        dot.setAttribute("cy", geom.c[1]);
      }
    }
    setView({ ...state.home });
    paintMap();
  }
  const btn = $("g-toggle");
  if (btn) {
    btn.textContent = on ? "平面" : "地球";
    btn.setAttribute("aria-pressed", String(on));
  }
}

/* 大陸を正面に回す。地球儀では viewBox を動かさない。回すだけ。 */
function spinToContinent(contName) {
  const pts = continentShapes(contName)
    .map((n) => (state.world.countries[n] || {}).ll)
    .filter(Boolean);
  if (!pts.length) return;

  const mid = (vals) => {
    const v = vals.slice().sort((a, b) => a - b);
    if (v.length < 8) return (v[0] + v[v.length - 1]) / 2;
    return (v[Math.floor(v.length * 0.1)] + v[Math.ceil(v.length * 0.9) - 1]) / 2;
  };

  // 経度は円環なので、単純な平均では日付変更線をまたぐ大陸がずれる。
  // 単位ベクトルの平均から向きを出す。
  const sx = pts.reduce((a, p) => a + Math.cos(p[0] * RAD), 0);
  const sy = pts.reduce((a, p) => a + Math.sin(p[0] * RAD), 0);
  const lon = ((Math.atan2(sy, sx) / RAD + 540) % 360) - 180;
  const lat = Math.max(-70, Math.min(70, mid(pts.map((p) => p[1]))));
  spinToward(lon, lat);
}

/* 指定の向きへなめらかに回す。 */
function spinToward(lon, lat, ms = 620) {
  spinStop(false);
  // 描画が止まっている（タブが裏など）か、動きを減らす設定なら、すぐ着地させる。
  if (document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    GLOBE.lon = lon;
    GLOBE.lat = lat;
    drawGlobe();
    spinStop(true);
    return;
  }
  const from = { lon: GLOBE.lon, lat: GLOBE.lat };
  const dLon = ((lon - from.lon + 540) % 360) - 180;
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    const e = ease(t);
    GLOBE.lon = from.lon + dLon * e;
    GLOBE.lat = from.lat + (lat - from.lat) * e;
    drawGlobe();
    if (t < 1) requestAnimationFrame(step);
    else spinStop(true);
  };
  requestAnimationFrame(step);
}

/* 選んだ国を正面に回す。 */
function spinTo(name) {
  const geom = state.world.countries[name];
  if (!GLOBE.on || !geom || !geom.ll) return;
  spinToward(geom.ll[0], Math.max(-75, Math.min(75, geom.ll[1])), 520);
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

/* 地球儀では、国ピンだけを球面に置く。大陸ピンは球を覆うので出さない。 */
function updateBadgesOnGlobe() {
  for (const b of state.badges || []) b.el.style.display = "none";
  const px = $("map").getBoundingClientRect().width || 1;
  const sc = (state.view.w / px) * 1.15;
  for (const b of state.cbadges || []) {
    const geom = state.world.countries[b.name];
    const pt = geom && geom.ll && b.value > 0 ? orthographic(geom.ll[0], geom.ll[1]) : null;
    b.el.style.display = pt ? "" : "none";
    if (pt) {
      b.el.setAttribute("transform", `translate(${pt[0].toFixed(1)} ${pt[1].toFixed(1)}) scale(${sc.toFixed(4)})`);
    }
  }
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
  if (GLOBE.on) return updateBadgesOnGlobe();
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
    // 地球儀では球面へ投影する。裏側に回った国の円は描かない。
    let cx = c.c[0];
    let cy = c.c[1];
    if (GLOBE.on) {
      const pt = c.ll ? orthographic(c.ll[0], c.ll[1]) : null;
      if (!pt) continue;
      cx = pt[0];
      cy = pt[1];
    }
    const r = Math.max(2.5, Math.sqrt(b.req / max) * R);
    const base = document.createElementNS(SVG_NS, "circle");
    base.setAttribute("cx", cx);
    base.setAttribute("cy", cy);
    base.setAttribute("r", r.toFixed(1));
    base.setAttribute("class", "rg-bub-base");
    layer.appendChild(base);

    const ratio = b.req ? b.dist / b.req : 0;
    if (ratio <= 0) continue;
    if (ratio >= 0.9999) {
      const full = document.createElementNS(SVG_NS, "circle");
      full.setAttribute("cx", cx);
      full.setAttribute("cy", cy);
      full.setAttribute("r", r.toFixed(1));
      full.setAttribute("class", "rg-bub-fill");
      layer.appendChild(full);
    } else {
      const wedge = document.createElementNS(SVG_NS, "path");
      wedge.setAttribute("d", pieWedge(cx, cy, r, ratio));
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
  if (name && GLOBE.on) spinTo(name);
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
    drag = {
      x: ev.clientX, y: ev.clientY, v: { ...state.view }, target: ev.target,
      lon: GLOBE.lon, lat: GLOBE.lat,
    };
    state.dragged = false;
    try {
      svg.setPointerCapture(ev.pointerId);
    } catch (_) {
      /* 合成イベント等でポインタが無いときは掴まない */
    }
  });
  svg.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    if (GLOBE.on) {
      spinStop(false);
      // 地球儀は動かすのではなく回す。1px あたり約 0.35 度。
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) state.dragged = true;
      GLOBE.lon = drag.lon - dx * 0.35;
      GLOBE.lat = Math.max(-85, Math.min(85, drag.lat + dy * 0.35));
      drawGlobe();
      return;
    }
    const r = svg.getBoundingClientRect();
    const dx = ((ev.clientX - drag.x) / r.width) * drag.v.w;
    const dy = ((ev.clientY - drag.y) / r.height) * drag.v.h;
    if (Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > 3) state.dragged = true;
    setView({ ...drag.v, x: drag.v.x - dx, y: drag.v.y - dy });
  });
  svg.addEventListener("pointerup", () => {
    if (GLOBE.on) spinStop(true);
    const tapped = drag && !state.dragged ? drag.target : null;
    drag = null;
    state.dragged = false;
    if (!tapped) return;
    const badge = tapped.closest ? tapped.closest(".rg-cb") : null;
    if (badge) {
      if (GLOBE.on) {
        spinToContinent(badge.dataset.cont);
        return;
      }
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
  $("g-toggle").onclick = () => setGlobe(!GLOBE.on);
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
      if (GLOBE.on) return spinToContinent(b.dataset.cont);
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

/* 約束された価値と、受け取った価値。Fund ごとに出す。
   全体の平均だけでは、逆向きの動きが打ち消し合って消えるため。 */
function renderValue() {
  const v = state.projects.value;
  if (!v || !v.funds) return;

  const usd0 = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const pct = (r) => `${r >= 1 ? "+" : ""}${Math.round((r - 1) * 100)}%`;

  const head =
    '<thead><tr><th scope="col">Fund</th><th scope="col" class="num">件数</th>' +
    '<th scope="col" class="num">約束（採択時）</th><th scope="col" class="num">受取（承認日）</th>' +
    '<th scope="col" class="num">差</th></tr></thead>';

  const body = v.funds
    .map(
      (f) =>
        `<tr><th scope="row" class="chain">Fund ${esc(f.fund)}</th>` +
        `<td class="num">${num(f.n)}</td>` +
        `<td class="num">${esc(usd0(f.promised))}</td>` +
        `<td class="num">${esc(usd0(f.received))}</td>` +
        `<td class="num rg-val-d" data-up="${f.ratio >= 1}">${esc(pct(f.ratio))}</td></tr>`
    )
    .join("");

  const foot =
    `<tr class="rg-val-total"><th scope="row" class="chain">合計</th>` +
    `<td class="num">${num(v.n)}</td>` +
    `<td class="num">${esc(usd0(v.promised))}</td>` +
    `<td class="num">${esc(usd0(v.received))}</td>` +
    `<td class="num rg-val-d" data-up="${v.ratio >= 1}">${esc(pct(v.ratio))}</td></tr>`;

  $("value").innerHTML = head + `<tbody>${body}${foot}</tbody>`;

  const up = v.funds.filter((f) => f.ratio >= 1);
  const down = v.funds.filter((f) => f.ratio < 1);
  $("value-note").innerHTML =
    `<span>全体では ${esc(pct(v.ratio))}。だがこれは` +
    `<strong>逆向きの動きが打ち消し合った結果</strong>である。` +
    (up.length && down.length
      ? `上がった Fund は ${up.map((f) => "F" + f.fund).join("・")}、` +
        `下がった Fund は ${down.map((f) => "F" + f.fund).join("・")}。` +
        `最も上がった Fund と最も下がった Fund の間には ` +
        `<strong>${Math.round(
          (Math.max(...v.funds.map((f) => f.ratio)) -
            Math.min(...v.funds.map((f) => f.ratio))) * 100
        )} 点の開き</strong>がある。`
      : "") +
    `</span>` +
    `<span>${esc(v.scope)}</span>` +
    `<span class="rg-score-caveat">${esc(v.note)}価格は ${esc(v.source)}。</span>`;
}

/* Fund の時系列。募集から着手までを横一本の帯にする。
   6年ぶんを同じ物差しに並べると、規模がいつ膨らみ、いつ止まったかが形で見える。
   日付は公式を優先し、無いところだけ手動記録で補っている（薄い線で区別する）。 */

const TL_STAGE_MARK = {
  submit: "○",
  review: "◇",
  vote: "□",
  result: "●",
  onboard: "▷",
};

const TL_LABEL = {
  submit: "募集",
  review: "レビュー",
  vote: "投票",
  result: "結果発表",
  onboard: "着手",
};

let TL = null;

async function loadTimeline() {
  if (TL !== undefined && TL !== null) return TL;
  try {
    const res = await fetch(`data/timeline.json?v=${DATA_V}`);
    TL = res.ok ? await res.json() : null;
  } catch (e) {
    TL = null;
  }
  return TL;
}

/* 日付を 0〜1 の位置へ。全体の幅で割るだけ。 */
function tlPos(day, from, to) {
  const a = Date.parse(from);
  const b = Date.parse(to);
  const d = Date.parse(day);
  if (!isFinite(a) || !isFinite(b) || !isFinite(d) || b <= a) return null;
  return Math.max(0, Math.min(1, (d - a) / (b - a)));
}

function tlAmount(list) {
  if (!list || !list.length) return "";
  return list
    .map((m) => compactAmt(m.v / Math.pow(10, m.exp || 0), m.code))
    .join(" + ");
}

async function renderTimeline() {
  const host = $("timeline");
  if (!host) return;
  const tl = await loadTimeline();
  if (!tl || !tl.funds) return;

  const from = tl.from;
  const to = tl.to;

  // 年の目盛り。何年の話かが分からないと帯は読めない。
  const y0 = new Date(from).getUTCFullYear();
  const y1 = new Date(to).getUTCFullYear();
  const ticks = [];
  for (let y = y0; y <= y1; y++) {
    const p = tlPos(`${y}-01-01`, from, to);
    if (p !== null) ticks.push(`<span class="tl-tick" style="left:${(p * 100).toFixed(2)}%">${y}</span>`);
  }

  const rows = tl.funds
    .map((f) => {
      const marks = [];
      // 期間のあるものは帯、時点のものは印。
      for (const [key, m] of Object.entries(f.marks || {})) {
        const start = m.from || m.at;
        const p = tlPos(start, from, to);
        if (p === null) continue;
        const manual = m.src === "manual" ? " tl-manual" : "";
        if (m.from && m.to) {
          const q = tlPos(m.to, from, to);
          const w = Math.max(0.4, ((q ?? p) - p) * 100);
          marks.push(
            `<span class="tl-span tl-${key}${manual}" style="left:${(p * 100).toFixed(2)}%;width:${w.toFixed(2)}%"
              title="${esc(`${TL_LABEL[key]} ${m.from} → ${m.to}`)}"></span>`
          );
        } else {
          marks.push(
            `<span class="tl-dot tl-${key}${manual}" style="left:${(p * 100).toFixed(2)}%"
              title="${esc(`${TL_LABEL[key]} ${start}`)}">${TL_STAGE_MARK[key] || "・"}</span>`
          );
        }
      }

      const rate =
        f.proposals && f.funded ? Math.round((f.funded / f.proposals) * 100) : null;

      return `<li class="tl-row${f.active ? " tl-active" : ""}">
        <span class="tl-name">F${esc(f.id)}</span>
        <span class="tl-track">${marks.join("")}</span>
        <span class="tl-nums">
          <span class="tl-amt">${esc(tlAmount(f.available) || "—")}</span>
          <span class="tl-cnt">${
            f.proposals ? `応募 ${num(f.proposals)}` : "応募 —"
          }${f.funded ? ` → 採択 ${num(f.funded)}` : ""}${
        rate !== null ? `（${rate}%）` : ""
      }</span>
        </span>
      </li>`;
    })
    .join("");

  host.innerHTML =
    `<div class="tl-scale">${ticks.join("")}</div>` +
    `<ul class="tl-rows">${rows}</ul>`;

  const legend = $("timeline-legend");
  if (legend) {
    legend.innerHTML =
      tl.stages
        .map(
          (s) =>
            `<li><span class="tl-key tl-${s.key}">${TL_STAGE_MARK[s.key] || ""}</span>${esc(
              s.label
            )}</li>`
        )
        .join("") +
      `<li><span class="tl-key tl-manual-key"></span>薄い印は手動記録で補った日（公式ページに無いもの）</li>` +
      `<li>${esc(tl.note)}</li>`;
  }
}

/* 事前スコアと、その後の結末を並べる。判断はしない。 */
function renderScores() {
  const sc = state.projects.scores;
  if (!sc || !sc.outcomes) return;

  const head =
    '<thead><tr><th scope="col">その後</th><th scope="col" class="num">件数</th>' +
    '<th scope="col" class="num">事前スコアの平均</th><th scope="col" class="num">中央値</th></tr></thead>';
  const body = sc.outcomes
    .map(
      (o) =>
        `<tr><th scope="row" class="chain">${esc(STATUS_JA[o.status] || o.status)}</th>` +
        `<td class="num">${num(o.n)}</td>` +
        `<td class="num">${esc(o.mean)}</td>` +
        `<td class="num rg-score-mid">${esc(o.median)}</td></tr>`
    )
    .join("");
  $("scores").innerHTML = head + `<tbody>${body}</tbody>`;

  const medians = [...new Set(sc.outcomes.filter((o) => o.n >= 20).map((o) => o.median))];
  const same = medians.length === 1;

  $("score-note").innerHTML =
    `<span>${num(sc.matched)} 件で突き合わせた（タイトルが一意に一致したもの）。` +
    (same
      ? `完了も中止も、<strong>中央値は同じ ${esc(medians[0])}</strong>。`
      : "") +
    `</span>` +
    `<span>点数そのものの散らばりも小さい。${num(sc.n)} 件のうち ` +
    `<strong>${esc(sc.band.pct)}% が ${esc(sc.band.lo)}〜${esc(sc.band.hi)}</strong> に収まる` +
    `（標準偏差 ${esc(sc.sd)}、下は ${esc(sc.min)}、上は ${esc(sc.max)}）。</span>` +
    `<span>採択された ${num(sc.funded.n)} 件の平均 ${esc(sc.funded.mean)}、` +
    `されなかった ${num(sc.unfunded.n)} 件の平均 ${esc(sc.unfunded.mean)}。</span>` +
    `<span class="rg-score-caveat">この欄は点数の当否を論じない。` +
    `評価の労力がどこに置かれているかを、数字のまま示している。</span>`;
}

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
  // ボタンは描き直すたびに作られるので、親で受ける。
  $("plist").addEventListener("click", (ev) => {
    const b = ev.target.closest(".rg-solo-b");
    if (!b) return;
    ev.stopPropagation();
    state.soloOnly = b.dataset.solo === "1";
    state.shown = PAGE;
    renderPlist();
  });

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
    const V = DATA_V;
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
    renderTimeline();
    renderValue();
    renderScores();
  } catch (e) {
    console.error(e);
    $("hero-foot").textContent = `読み込み失敗: ${e.message}`;
  }
})();
