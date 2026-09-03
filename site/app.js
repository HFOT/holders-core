const PATTERNS = {
  delivering: "納品あり",
  fade_out: "採択後に静止",
  continuing_without_delivery: "納品なしで継続",
  proposing: "採択なし",
};
const TYPES = { tech: "技術型", trust: "信頼型" };
const OUTCOMES = { withdrawn: "取り下げ", terminated: "打ち切り", paused: "中断" };
const STAGE_TEXT = { 1: "① 提案", 2: "② 採択", 3: "③ 納品", 4: "④ 使用" };
const PAGE = 100;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
const num = (n) => (n ?? 0).toLocaleString("en-US");
const $ = (id) => document.getElementById(id);

const state = { shard: [], profiles: [], shown: PAGE, shownP: PAGE };

async function load(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function renderMeta(meta) {
  $("meta").textContent =
    `生成 ${meta.generated_at} ／ 提案 ${num(meta.total_proposals)} 件 ／ ` +
    `提案者 ${num(meta.proposers)} 名 ／ ④未記入 ${num(meta.pending_used)} 件`;
  const oc = meta.outcome_counts || {};
  $("outcomes").textContent =
    `取り下げ ${num(oc.withdrawn)} ／ 打ち切り ${num(oc.terminated)} ／ ` +
    `中断 ${num(oc.paused)} ／ 日本語圏タグ ${num(meta.jp_proposals)} 件`;
}

function filteredProposals() {
  const stage = $("stage").value;
  const outcome = $("outcome").value;
  const jp = $("jp-only").checked;
  const q = $("q").value.trim().toLowerCase();
  return state.shard.filter((d) => {
    if (stage && String(d.stage) !== stage) return false;
    if (outcome && d.outcome !== outcome) return false;
    if (jp && !d.jp) return false;
    if (q) {
      const hay =
        (d.title || "") + " " + (d.users || []).map((u) => u.name).join(" ");
      if (!hay.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function proposalHtml(d) {
  const hold = d.stage >= 2 && d.used === null;
  const parts = [`<span class="stage s${esc(d.stage)}">${STAGE_TEXT[d.stage]}</span>`];
  if (hold) parts.push(`<span class="hold">保留</span>`);
  if (d.outcome) parts.push(`<span class="oc">${esc(OUTCOMES[d.outcome] || d.outcome)}</span>`);
  if (d.jp) parts.push(`<span class="jp">日本語圏</span>`);
  if (d.outcome_type)
    parts.push(`<span class="type">${esc(TYPES[d.outcome_type] || d.outcome_type)}</span>`);
  const who = (d.users || []).map((u) => esc(u.name || "?")).join(", ");
  const safe = (u) => typeof u === "string" && /^https?:\/\//i.test(u.trim());
  const links = (d.sources || [])
    .filter(safe)
    .map((u, i) => `<a href="${esc(u)}" rel="noopener" target="_blank">一次情報 ${i + 1}</a>`)
    .join("");
  return `<li>
    <div class="row1">${parts.join("")}
      <span class="title">${esc(d.title)}</span>
      <span class="fund">${esc((d.fund || {}).label || "")}</span>
    </div>
    <div class="who">${who}
      <span class="raw">${esc(d.funding_status)} / ${esc(d.status)}</span>
      <span class="raw">申請 ${num(d.amount_requested)} / 受領 ${num(d.amount_received)}</span>
    </div>
    <div class="sources">${links}</div>
  </li>`;
}

function renderProposals() {
  const rows = filteredProposals();
  $("count").textContent = `${num(rows.length)} 件`;
  $("proposals").innerHTML = rows.slice(0, state.shown).map(proposalHtml).join("");
  $("more").hidden = rows.length <= state.shown;
}

function filteredProfiles() {
  const jp = $("jp-only-p").checked;
  const q = $("qp").value.trim().toLowerCase();
  return state.profiles.filter((p) => {
    if (jp && !p.jp) return false;
    if (q && !(p.username || "").toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderProfiles() {
  const rows = filteredProfiles();
  $("countp").textContent = `${num(rows.length)} 名`;
  document.querySelector("#profiles tbody").innerHTML = rows
    .slice(0, state.shownP)
    .map(
      (p) => `<tr>
        <td>${esc(p.username || p.user_id)}${p.jp ? ' <span class="jp">日本語圏</span>' : ""}</td>
        <td class="num">${num(p.proposed)}</td>
        <td class="num">${num(p.funded)}</td>
        <td class="num">${num(p.delivered)}</td>
        <td class="num">${num(p.used)}</td>
        <td class="num">${num(p.amount_received)}</td>
        <td class="fund">${esc((p.funds_active || []).join(" / "))}</td>
        <td class="pattern">${esc(PATTERNS[p.pattern] || p.pattern)}</td>
      </tr>`
    )
    .join("");
  $("morep").hidden = rows.length <= state.shownP;
}

async function selectFund(file) {
  state.shard = await load(`data/proposals/${file}`);
  state.shown = PAGE;
  renderProposals();
}

function wireTabs() {
  const show = (which) => {
    $("view-proposals").hidden = which !== "proposals";
    $("view-profiles").hidden = which !== "profiles";
    $("tab-proposals").classList.toggle("on", which === "proposals");
    $("tab-profiles").classList.toggle("on", which === "profiles");
  };
  $("tab-proposals").onclick = () => show("proposals");
  $("tab-profiles").onclick = () => show("profiles");
}

(async () => {
  try {
    wireTabs();
    const [meta, index, profiles] = await Promise.all([
      load("data/meta.json"),
      load("data/proposals/index.json"),
      load("data/profiles.json"),
    ]);
    renderMeta(meta);
    state.profiles = profiles;

    $("fund").innerHTML = index
      .map((e) => `<option value="${esc(e.file)}">${esc(e.fund)}（${num(e.count)}）</option>`)
      .join("");
    $("fund").onchange = () => selectFund($("fund").value);

    for (const el of ["stage", "outcome", "jp-only", "q"]) {
      $(el).addEventListener("input", () => {
        state.shown = PAGE;
        renderProposals();
      });
    }
    for (const el of ["jp-only-p", "qp"]) {
      $(el).addEventListener("input", () => {
        state.shownP = PAGE;
        renderProfiles();
      });
    }
    $("more").onclick = () => {
      state.shown += PAGE;
      renderProposals();
    };
    $("morep").onclick = () => {
      state.shownP += PAGE;
      renderProfiles();
    };

    await selectFund(index[0].file);
    renderProfiles();
  } catch (e) {
    $("meta").textContent = `読み込み失敗: ${e.message}`;
  }
})();
