/* MAP — 読み方の層。TIDE（潮位・外因）と FUEL（六燃料）。
   外部 fetch はしない。データはこのファイルの定数だけ。
   年〜季節でしか動かさない。月次で触り始めたら設計が壊れている。 */

const LAST_REVIEWED = "2026-09-04";

/* ------------------------------------------------------------------ *
 * TIDE — 起きたことだけ。各行に日付と、取得して内容を確認した情報源。
 * ------------------------------------------------------------------ */

const TIDE = [
  {
    id: "clarity",
    name: "CLARITY法案",
    note: "米国 デジタル資産市場構造法案（H.R.3633 / Digital Asset Market Clarity Act of 2025）",
    events: [
      {
        date: "2025-07-17",
        what:
          "下院が可決した。賛成294・反対134（Roll no. 199）。賛成のうち民主党は78名。",
        src: [
          { label: "下院書記官 投票記録 roll199", url: "https://clerk.house.gov/evs/2025/roll199.xml" },
        ],
      },
      {
        date: "2026-05-14",
        what:
          "上院銀行住宅都市委員会が、修正案を付して報告することを議決した。賛成15・反対9。",
        src: [
          { label: "GovInfo 法案経過（公式記録）", url: "https://www.govinfo.gov/bulkdata/BILLSTATUS/119/hr/BILLSTATUS-119hr3633.xml" },
          { label: "Latham & Watkins 立法追跡（票数）", url: "https://www.lw.com/en/us-crypto-policy-tracker/legislative-developments" },
        ],
      },
      {
        date: "2026-08-08",
        what:
          "上院で本法案の審議に入る動議が提出され、あわせて討論終結（cloture）動議が提出された。議事録 CR S4557。",
        src: [
          { label: "GovInfo 法案経過（公式記録）", url: "https://www.govinfo.gov/bulkdata/BILLSTATUS/119/hr/BILLSTATUS-119hr3633.xml" },
        ],
      },
    ],
    notyet: {
      head: "まだ起きていないこと",
      lines: [
        "上院本会議での採決は行われていない。法案は成立していない。",
        "公式記録上の最新の動きは 2026-08-08 の動議提出であり、それ以降の議決は記録されていない。",
        "成立までに残っているのは、上院農業委員会版との調整、上院本会議での60票、下院可決版との調整、大統領署名。",
      ],
      src: [
        { label: "法案本文と正式名称（下院可決版）", url: "https://www.govinfo.gov/content/pkg/BILLS-119hr3633eh/html/BILLS-119hr3633eh.htm" },
      ],
    },
  },
  {
    id: "ada-etf",
    name: "ADA スポットETF",
    note: "米国の現物 ADA 上場投資商品",
    events: [
      {
        date: "2026-02-09",
        what:
          "CME で ADA 先物の取引が始まった。最初の約定は Cumberland DRW と Wintermute の間。",
        src: [
          { label: "CME Group 発表（2026-02-11）", url: "https://www.prnewswire.com/news-releases/cme-group-announces-first-trades-for-new-cardano-chainlink-and-stellar-cryptocurrency-futures-302685736.html" },
        ],
      },
      {
        date: "2026-08-07",
        what:
          "Grayscale が Grayscale Cardano Trust ETF の登録届出書（File No. 333-289948）の取り下げを SEC に申請した（Form RW）。理由は「届け出た分売を進める意思がない」。",
        src: [
          { label: "SEC EDGAR Form RW 原本", url: "https://www.sec.gov/Archives/edgar/data/2083106/000119312526340377/ada_rw_08072026.htm" },
        ],
      },
      {
        date: "2026-08-09",
        what:
          "CME 上場から6か月が経過した。SEC が2025-09-17に承認した一般上場基準は、指定契約市場で6か月以上取引されている先物を持つ商品を、個別承認なしに上場できる経路のひとつとして挙げている。",
        src: [
          { label: "SEC 承認命令 34-103974（6か月要件の条文）", url: "https://www.sec.gov/files/rules/sro/nysearca/2025/34-103974.pdf" },
          { label: "SEC 報道発表 2025-121", url: "https://www.sec.gov/newsroom/press-releases/2025-121-sec-approves-generic-listing-standards-commodity-based-trust-shares" },
        ],
      },
    ],
    notyet: {
      head: "まだ起きていないこと",
      lines: [
        "米国のスポット ADA ETF は上場していない。",
        "Grayscale の登録届出書は効力が発生しておらず、証券は発行も売却もされていない（取り下げ書にそう書かれている）。",
        "要件を満たした日の2日前に、唯一の単独スポット ADA 申請者が降りた。他に有効な単独スポット ADA 申請は確認されていない（報道による。EDGAR 上での網羅確認はしていない）。",
      ],
      src: [
        { label: "CryptoSlate（申請者が残っていないことの報道）", url: "https://cryptoslate.com/cardano-finally-cleared-the-sec-shortcut-for-a-spot-etf-but-its-last-remaining-sponsor-quit-two-days-too-early/" },
      ],
    },
  },
];

const TIDE_PAIR =
  "どちらも「要件は前に進んだが、成立も申請もしていない」状態にある。" +
  "前進と成立は別のことであり、このサイトは起きたことだけを記録する。";

/* ------------------------------------------------------------------ *
 * FUEL — 性格の地図。計測ではない。年単位でしか動かさない。
 * ------------------------------------------------------------------ */

const FUELS = [
  { key: "制度",       body: "ETF、法案、規制",                    who: "信念型・相場型" },
  { key: "ファンダ",   body: "実利用、採用、稼働数字",              who: "調査型・信念型", full: "ファンダメンタル" },
  { key: "提携",       body: "誰と組んだか",                        who: "調査型・発見型" },
  { key: "資金調達",   body: "VC、Treasury配分、資金の流れ",        who: "調査型・発見型" },
  { key: "実装",       body: "実際に動き出したもの",                who: "参加型・運用型" },
  { key: "物語",       body: "ミーム、ナラティブ、勢い",            who: "相場型・発見型", full: "物語／投機" },
];

const CHAINS = [
  { name: "BTC",     marks: ["●", "○", "·", "·", "·", "○"] },
  { name: "ETH",     marks: ["●", "●", "○", "○", "○", "·"] },
  { name: "SOL",     marks: ["○", "○", "○", "●", "○", "●"] },
  { name: "Base",    marks: ["·", "○", "○", "○", "●", "●"] },
  { name: "Cardano", marks: ["○", "○", "·", "○", "●", "·"] },
];

const SPREAD = [
  { n: "点灯 1/6", t: "一点集中。他が見えていない" },
  { n: "点灯 3/6", t: "健全" },
  { n: "点灯 5/6", t: "過熱" },
];

/* ------------------------------------------------------------------ */

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const $ = (id) => document.getElementById(id);

const lit = (marks) => marks.filter((m) => m === "●" || m === "○").length;

function srcLinks(list) {
  if (!list || !list.length) return "";
  return (
    '<p class="tide-src">' +
    list
      .map(
        (s) =>
          `<a href="${esc(s.url)}" rel="noreferrer noopener" target="_blank">${esc(s.label)}</a>`
      )
      .join('<span class="sep">/</span>') +
    "</p>"
  );
}

function renderTide() {
  const html = TIDE.map((series) => {
    const rows = series.events
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map(
        (e) => `
        <li class="tide-e">
          <time class="tide-d" datetime="${esc(e.date)}">${esc(e.date)}</time>
          <div class="tide-b">
            <p class="tide-w">${esc(e.what)}</p>
            ${srcLinks(e.src)}
          </div>
        </li>`
      )
      .join("");

    const notyet = `
      <div class="tide-state">
        <p class="tide-state-h">${esc(series.notyet.head)}</p>
        <ul class="tide-state-l">
          ${series.notyet.lines.map((l) => `<li>${esc(l)}</li>`).join("")}
        </ul>
        ${srcLinks(series.notyet.src)}
      </div>`;

    return `
      <section class="tide-s">
        <h3 class="tide-n">${esc(series.name)}</h3>
        <p class="tide-note">${esc(series.note)}</p>
        <ol class="tide-l">${rows}</ol>
        ${notyet}
      </section>`;
  }).join("");

  $("tide").innerHTML = html;
}

function renderFuels() {
  $("fuels").innerHTML = FUELS.map(
    (f) => `
    <li class="fuel-i">
      <span class="fuel-k">${esc(f.full || f.key)}</span>
      <span class="fuel-b">${esc(f.body)}</span>
      <span class="fuel-w">${esc(f.who)}</span>
    </li>`
  ).join("");
}

function renderMatrix() {
  const head =
    "<tr><th scope=\"col\">チェーン</th>" +
    FUELS.map((f) => `<th scope="col" class="mk">${esc(f.key)}</th>`).join("") +
    '<th scope="col" class="num">点灯</th></tr>';

  const body = CHAINS.map(
    (c) =>
      `<tr><th scope="row" class="chain">${esc(c.name)}</th>` +
      c.marks.map((m) => `<td class="mk">${esc(m)}</td>`).join("") +
      `<td class="num">${esc(lit(c.marks))} / 6</td></tr>`
  ).join("");

  $("matrix").innerHTML =
    `<thead>${head}</thead><tbody>${body}</tbody>`;
}

function renderSpread() {
  $("spread").innerHTML = SPREAD.map(
    (s) =>
      `<li class="spread-i"><span class="spread-n">${esc(s.n)}</span><span class="spread-t">${esc(s.t)}</span></li>`
  ).join("");
}

function init() {
  $("reviewed").textContent = LAST_REVIEWED;
  $("pairline").textContent = TIDE_PAIR;
  renderTide();
  renderFuels();
  renderMatrix();
  renderSpread();
}

init();
