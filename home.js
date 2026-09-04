/* holders CORE 入口 — 数字を差し込むだけ。推測では埋めない。 */

// 計器の一覧。計器が増えたらここに足す。接続済みの数はここから数える。
const INSTRUMENTS = [
  { key: "money",  label: "Catalyst まとめ", status: "connected" },
  { key: "spo",    label: "SPO health",      status: "unpublished" },
  { key: "drep",   label: "DRep terminal",   status: "unpublished" },
];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
const num = (n) => (n ?? 0).toLocaleString("en-US");
const $ = (id) => document.getElementById(id);

const FAIL = "読み込み失敗";

function renderInstruments() {
  const total = INSTRUMENTS.length;
  const connected = INSTRUMENTS.filter((i) => i.status === "connected").length;
  $("fig-connected").textContent = `${connected} / ${total}`;
  $("here-n").textContent = String(connected);
}

function renderMeta(meta) {
  $("fig-proposals").textContent = num(meta.total_proposals);
  $("fig-pending").textContent = num(meta.pending_used);
  $("i-proposals").textContent = num(meta.total_proposals);
  $("i-proposers").textContent = num(meta.proposers);
  $("i-pending").textContent = num(meta.pending_used);
  $("hero-foot").innerHTML =
    `生成 <time datetime="${esc(meta.generated_at)}">${esc(meta.generated_at)}</time>`;
}

function renderFailure() {
  for (const id of ["fig-proposals", "fig-pending", "i-proposals", "i-proposers", "i-pending"]) {
    $(id).textContent = FAIL;
  }
  $("hero-foot").textContent = `生成 ${FAIL}`;
}

async function init() {
  renderInstruments();
  try {
    const res = await fetch("data/meta.json");
    if (!res.ok) throw new Error(`data/meta.json: ${res.status}`);
    renderMeta(await res.json());
  } catch (e) {
    console.error(e);
    renderFailure();
  }
}

init();
