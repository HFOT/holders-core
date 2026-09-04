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

const state = {
  shard: [],
  profiles: [],
  shown: PAGE,
  shownP: PAGE,
  fundLabels: {},
  fundLabel: "",
};

async function load(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function renderMeta(meta) {
  $("fig-proposals").textContent = num(meta.total_proposals);
  $("fig-proposers").textContent = num(meta.proposers);
  $("fig-pending").textContent = num(meta.pending_used);
  const oc = meta.outcome_counts || {};
  $("hero-foot").textContent =
    `生成 ${meta.generated_at} ／ 取り下げ ${num(oc.withdrawn)}・` +
    `打ち切り ${num(oc.terminated)}・中断 ${num(oc.paused)}` +
    ` ／ 日本語圏タグ ${num(meta.jp_proposals)} 件`;
}

// --- データ処理（変更しない） ---------------------------------------------

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

function filteredProfiles() {
  const jp = $("jp-only-p").checked;
  const q = $("qp").value.trim().toLowerCase();
  return state.profiles.filter((p) => {
    if (jp && !p.jp) return false;
    if (q && !(p.username || "").toLowerCase().includes(q)) return false;
    return true;
  });
}

// --- 描画 ------------------------------------------------------------------

function proposalHtml(d) {
  const hold = d.stage >= 2 && d.used === null;
  const badges = [
    `<span class="badge stage">${STAGE_TEXT[d.stage] || esc(d.stage)}</span>`,
  ];
  // 保留 = ④が未記入。未使用 = 使われていないと記録した確定した事実。別物として描く。
  if (hold) badges.push(`<span class="badge hold">保留</span>`);
  if (d.used === false) badges.push(`<span class="badge unused">未使用</span>`);
  // 転帰は段階を打ち消さない。段階バッジは常に残す。
  if (d.outcome)
    badges.push(
      `<span class="badge oc">${esc(OUTCOMES[d.outcome] || d.outcome)}</span>`
    );
  if (d.jp) badges.push(`<span class="tag">日本語圏</span>`);
  if (d.outcome_type)
    badges.push(
      `<span class="tag">${esc(TYPES[d.outcome_type] || d.outcome_type)}</span>`
    );

  const who = (d.users || []).map((u) => esc(u.name || "?")).join(", ");
  const safe = (u) => typeof u === "string" && /^https?:\/\//i.test(u.trim());
  const links = (d.sources || [])
    .filter(safe)
    .map(
      (u, i) =>
        `<a href="${esc(u)}" rel="noopener noreferrer" target="_blank">一次情報 ${i + 1}</a>`
    )
    .join("");

  return `<li>
    <div class="badges">${badges.join("")}</div>
    <span class="p-title">${esc(d.title)}</span>
    <div class="p-who">${esc((d.fund || {}).label || "")}${who ? " ・ " + who : ""}</div>
    <div class="p-raw">${esc(d.funding_status)} / ${esc(d.status)}<span class="sep">・</span>申請 ${num(
    d.amount_requested
  )}<span class="sep">・</span>受領 ${num(d.amount_received)}</div>
    <div class="p-src">${links}</div>
  </li>`;
}

function renderProposals() {
  const rows = filteredProposals();
  // A: Fund 内の絞り込み結果であることを表記に含める
  const label = state.fundLabel ? `${state.fundLabel} 内 ` : "";
  $("count").textContent = `${label}${num(rows.length)} 件`;
  $("proposals").innerHTML = rows.slice(0, state.shown).map(proposalHtml).join("");
  // B: 空の結果を明示する
  $("empty").hidden = rows.length !== 0;
  $("more").hidden = rows.length <= state.shown;
}

function renderProfiles() {
  const rows = filteredProfiles();
  $("countp").textContent = `${num(rows.length)} 名`;
  document.querySelector("#profiles tbody").innerHTML = rows
    .slice(0, state.shownP)
    .map(
      (p) => `<tr>
        <td class="name">${esc(p.username || p.user_id)}${
        p.jp ? ' <span class="tag">日本語圏</span>' : ""
      }</td>
        <td class="num">${num(p.proposed)}</td>
        <td class="num">${num(p.funded)}</td>
        <td class="num">${num(p.delivered)}</td>
        <td class="num">${num(p.used)}</td>
        <td class="num">${num(p.amount_received)}</td>
        <td class="funds">${esc((p.funds_active || []).join(" / "))}</td>
        <td class="pattern">${esc(PATTERNS[p.pattern] || p.pattern)}</td>
      </tr>`
    )
    .join("");
  $("emptyp").hidden = rows.length !== 0;
  $("morep").hidden = rows.length <= state.shownP;
}

async function selectFund(file) {
  state.shard = await load(`data/proposals/${file}`);
  state.fundLabel = state.fundLabels[file] || "";
  state.shown = PAGE;
  renderProposals();
}

// --- セグメンテッドコントロール --------------------------------------------

function setSeg(seg, i) {
  seg.style.setProperty("--i", i);
  const btns = seg.querySelectorAll(".seg-btn");
  btns.forEach((b, k) => {
    b.classList.toggle("on", k === i);
    if (b.getAttribute("role") === "tab") b.setAttribute("aria-selected", String(k === i));
  });
}

function wireTabs() {
  const seg = $("tabseg");
  const show = (which, i) => {
    $("view-proposals").hidden = which !== "proposals";
    $("view-profiles").hidden = which !== "profiles";
    setSeg(seg, i);
  };
  $("tab-proposals").onclick = () => show("proposals", 0);
  $("tab-profiles").onclick = () => show("profiles", 1);
}

function wireStageSeg() {
  const seg = $("stageseg");
  const btns = [...seg.querySelectorAll(".seg-btn")];
  btns.forEach((b, i) => {
    b.onclick = () => {
      setSeg(seg, i);
      const hidden = $("stage");
      hidden.value = b.dataset.stage || "";
      hidden.dispatchEvent(new Event("input", { bubbles: true }));
    };
  });
}

// C: 名簿が空のときは日本語圏フィルタを無効化する
function applyRosterState(meta) {
  if (meta.jp_proposals !== 0) return;
  for (const [box, note, wrap] of [
    ["jp-only", "jp-note", "jp-wrap"],
    ["jp-only-p", "jp-note-p", "jp-wrap-p"],
  ]) {
    $(box).checked = false;
    $(box).disabled = true;
    $(note).hidden = false;
    $(wrap).classList.add("off");
  }
}

(async () => {
  try {
    wireTabs();
    wireStageSeg();
    const [meta, index, profiles] = await Promise.all([
      load("data/meta.json"),
      load("data/proposals/index.json"),
      load("data/profiles.json"),
    ]);
    renderMeta(meta);
    applyRosterState(meta);
    state.profiles = profiles;

    for (const e of index) state.fundLabels[e.file] = e.fund;
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
    $("hero-foot").textContent = `読み込み失敗: ${e.message}`;
  }
})();
