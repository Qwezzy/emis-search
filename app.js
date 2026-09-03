const PROV = {
  EC: "Eastern Cape", FS: "Free State", GT: "Gauteng", KZN: "KwaZulu-Natal",
  LP: "Limpopo", MP: "Mpumalanga", NC: "Northern Cape", NW: "North West", WC: "Western Cape"
};

const PAGE = 25;
let DATA = [];
let VIEW = [];
let page = 1;

const $ = (id) => document.getElementById(id);

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s) {
  return norm(s).split(" ").filter((t) => t.length >= 2 || /^\d+$/.test(t));
}

function haystack(r) {
  if (r._h) return r._h;
  r._h = norm([r.n, r.e, r.t, r.su, r.v, r.di, r.lm, r.a, r.sp, r.ph].join(" "));
  r._hn = norm(r.n);
  return r._h;
}

function score(r, qTokens, raw) {
  const h = haystack(r);
  const name = r._hn;
  let s = 0;
  if (raw && r.e === raw) s += 1000;
  if (raw && r.e && r.e.includes(raw)) s += 400;
  if (qTokens.length && qTokens.every((t) => name.includes(t))) s += 180;
  if (qTokens.length === 1 && name.startsWith(qTokens[0])) s += 120;
  for (const t of qTokens) {
    if (name.includes(t)) s += 40;
    else if (h.includes(t)) s += 12;
    else return -1;
  }
  if (r.l) s += Math.min(20, Math.log10(r.l + 1) * 6);
  return s;
}

function apply() {
  const raw = $("q").value.trim();
  const qTokens = tokens(raw);
  const prov = $("fProv").value;
  const phase = $("fPhase").value;
  const sector = $("fSector").value;
  const q = $("fQ").value;
  const fee = $("fFee").value;
  const urban = $("fUrban").value;
  const sort = $("sort").value;

  let rows = DATA;
  if (prov) rows = rows.filter((r) => r.p === prov);
  if (phase) rows = rows.filter((r) => r.ph === phase);
  if (sector) rows = rows.filter((r) => r.se === sector);
  if (q) rows = rows.filter((r) => r.q === q);
  if (fee !== "") rows = rows.filter((r) => String(r.f) === fee);
  if (urban !== "") rows = rows.filter((r) => String(r.u) === urban);

  if (qTokens.length) {
    const scored = [];
    for (const r of rows) {
      const sc = score(r, qTokens, raw.replace(/\s+/g, ""));
      if (sc >= 0) scored.push([sc, r]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[1].n.localeCompare(b[1].n));
    rows = scored.map((x) => x[1]);
  } else if (sort === "learners") {
    rows = rows.slice().sort((a, b) => (b.l || 0) - (a.l || 0));
  } else if (sort === "ratio") {
    rows = rows.slice().sort((a, b) => ratio(b) - ratio(a));
  } else {
    rows = rows.slice().sort((a, b) => a.n.localeCompare(b.n));
  }

  if (qTokens.length && sort !== "rel") {
    if (sort === "name") rows.sort((a, b) => a.n.localeCompare(b.n));
    if (sort === "learners") rows.sort((a, b) => (b.l || 0) - (a.l || 0));
    if (sort === "ratio") rows.sort((a, b) => ratio(b) - ratio(a));
  }

  VIEW = rows;
  page = 1;
  render();
}

function ratio(r) {
  if (!r.l || !r.ed) return 0;
  return r.l / r.ed;
}

function fmt(n) {
  return n == null ? "\u2014" : Number(n).toLocaleString("en-ZA");
}

function tel(t) {
  if (!t) return "";
  if (t.length === 9) return "0" + t;
  return t;
}

function card(r) {
  const loc = [r.t, r.su, r.di, PROV[r.p] || r.p].filter(Boolean).slice(0, 3).join(" \u00b7 ");
  const pills = [
    r.ph,
    r.se === "I" ? "Independent" : "Public",
    r.q,
    r.f === 0 ? "No fee" : r.f === 1 ? "Fee charging" : "",
    r.u === 0 ? "Rural" : r.u === 1 ? "Urban" : "",
  ].filter(Boolean);
  return `<li class="card" data-e="${r.e}">
    <h3>${escapeHtml(r.n)}</h3>
    <div class="sub">${escapeHtml(loc)} \u00b7 EMIS ${r.e}</div>
    <div class="meta">${pills.map((p) => `<span class="pill${p.startsWith("Q") ? " gold" : ""}">${escapeHtml(p)}</span>`).join("")}</div>
    <div class="sub">${fmt(r.l)} learners \u00b7 ${fmt(r.ed)} educators${r.ed && r.l ? ` \u00b7 ${ratio(r).toFixed(1)} : 1` : ""}</div>
  </li>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&", "<": "<", ">": ">", '"': """, "'": "&#39;"
  }[c]));
}

function render() {
  const total = VIEW.length;
  $("count").textContent = `${total.toLocaleString("en-ZA")} school${total === 1 ? "" : "s"}`;
  $("clearQ").hidden = !$("q").value;
  const start = (page - 1) * PAGE;
  const slice = VIEW.slice(start, start + PAGE);
  $("list").innerHTML = slice.map(card).join("");
  $("empty").hidden = total !== 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const buttons = [];
  const add = (p, label = p) => {
    buttons.push(`<button data-p="${p}" ${p === page ? 'aria-current="true"' : ""}>${label}</button>`);
  };
  if (pages > 1) {
    if (page > 1) add(page - 1, "Prev");
    const from = Math.max(1, page - 2);
    const to = Math.min(pages, page + 2);
    if (from > 1) add(1);
    if (from > 2) buttons.push("<span>…</span>");
    for (let p = from; p <= to; p++) add(p);
    if (to < pages - 1) buttons.push("<span>…</span>");
    if (to < pages) add(pages);
    if (page < pages) add(page + 1, "Next");
  }
  $("pager").innerHTML = buttons.join("");

  const learners = VIEW.reduce((a, r) => a + (r.l || 0), 0);
  const educators = VIEW.reduce((a, r) => a + (r.ed || 0), 0);
  $("facetStats").innerHTML = `
    <strong>${total.toLocaleString("en-ZA")}</strong> in view<br>
    ${learners.toLocaleString("en-ZA")} learners<br>
    ${educators.toLocaleString("en-ZA")} educators
  `;
}

function openSchool(e) {
  const r = DATA.find((x) => x.e === e);
  if (!r) return;
  const maps = r.la && r.lo
    ? `https://www.openstreetmap.org/?mlat=${r.la}&mlon=${r.lo}#map=16/${r.la}/${r.lo}`
    : "";
  const gmaps = r.la && r.lo
    ? `https://www.google.com/maps?q=${r.la},${r.lo}`
    : "";
  $("drawerBody").innerHTML = `
    <p class="sub">${r.se === "I" ? "Independent" : "Public"} · ${escapeHtml(r.ph)} · ${PROV[r.p] || r.p}</p>
    <h2 id="dName">${escapeHtml(r.n)}</h2>
    <dl class="kv">
      <dt>EMIS</dt><dd>${r.e}</dd>
      <dt>District</dt><dd>${escapeHtml(r.di || "—")}</dd>
      <dt>Municipality</dt><dd>${escapeHtml(r.lm || "—")}</dd>
      <dt>Town / suburb</dt><dd>${escapeHtml([r.t, r.su, r.v].filter(Boolean).join(", ") || "—")}</dd>
      <dt>Address</dt><dd>${escapeHtml(r.a || "—")}</dd>
      <dt>Telephone</dt><dd>${tel(r.te) || "—"}</dd>
      <dt>Email</dt><dd>${r.em ? `<a href="mailto:${escapeHtml(r.em)}">${escapeHtml(r.em)}</a>` : "—"}</dd>
      <dt>Quintile</dt><dd>${r.q || "—"}</dd>
      <dt>Fees</dt><dd>${r.f === 0 ? "No-fee school" : r.f === 1 ? "Fee-charging" : "—"}</dd>
      <dt>Setting</dt><dd>${r.u === 0 ? "Rural" : r.u === 1 ? "Urban" : "—"}</dd>
      <dt>Learners (2025)</dt><dd>${fmt(r.l)}</dd>
      <dt>Educators (2025)</dt><dd>${fmt(r.ed)}</dd>
      <dt>Ratio</dt><dd>${r.l && r.ed ? ratio(r).toFixed(1) + " learners per educator" : "—"}</dd>
      ${r.sp ? `<dt>Specialisation</dt><dd>${escapeHtml(r.sp)}</dd>` : ""}
      ${r.ty ? `<dt>Type</dt><dd>${escapeHtml(r.ty)}</dd>` : ""}
      <dt>Status</dt><dd>${r.st === "O" ? "Open" : r.st === "P" ? "Pending open" : r.st || "—"}</dd>
    </dl>
    <div class="actions">
      <button class="btn" data-copy="${r.e}">Copy EMIS</button>
      ${maps ? `<a class="btn sec" href="${maps}" target="_blank" rel="noopener">OpenStreetMap</a>` : ""}
      ${gmaps ? `<a class="btn sec" href="${gmaps}" target="_blank" rel="noopener">Google Maps</a>` : ""}
    </div>
  `;
  $("drawer").hidden = false;
}

function hydrateFilters() {
  const provs = [...new Set(DATA.map((r) => r.p))].sort();
  $("fProv").innerHTML += provs.map((p) => `<option value="${p}">${PROV[p] || p}</option>`).join("");
  const phases = [...new Set(DATA.map((r) => r.ph).filter(Boolean))].sort();
  $("fPhase").innerHTML += phases.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
}

let t = null;
function bind() {
  $("q").addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(apply, 80);
  });
  $("q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") apply();
  });
  ["fProv", "fPhase", "fSector", "fQ", "fFee", "fUrban", "sort"].forEach((id) => {
    $(id).addEventListener("change", apply);
  });
  $("clearQ").addEventListener("click", () => { $("q").value = ""; apply(); $("q").focus(); });
  $("resetFilters").addEventListener("click", () => {
    $("fProv").value = $("fPhase").value = $("fSector").value = $("fQ").value = $("fFee").value = $("fUrban").value = "";
    $("sort").value = "rel";
    apply();
  });
  document.querySelectorAll(".chip-link").forEach((b) => {
    b.addEventListener("click", () => { $("q").value = b.dataset.q; apply(); });
  });
  $("list").addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card) openSchool(card.dataset.e);
  });
  $("pager").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-p]");
    if (!b) return;
    page = Number(b.dataset.p);
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  $("closeDrawer").addEventListener("click", () => { $("drawer").hidden = true; });
  $("drawer").addEventListener("click", (e) => {
    if (e.target.id === "drawer") $("drawer").hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $("drawer").hidden = true;
  });
  $("drawerBody").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      b.textContent = "Copied";
      setTimeout(() => { b.textContent = "Copy EMIS"; }, 1200);
    } catch {}
  });
}

async function boot() {
  bind();
  async function loadJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("missing " + url);
    if (url.endsWith(".gz") && typeof DecompressionStream !== "undefined") {
      const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
      return new Response(stream).json();
    }
    return res.json();
  }
  try {
    const shards = await Promise.all(
      Array.from({ length: 16 }, (_, i) => loadJson("data/schools/shard-" + i + ".json.gz"))
    );
    DATA = shards.flat();
  } catch (e) {
    const shards = await Promise.all(
      Array.from({ length: 16 }, (_, i) => loadJson("data/schools/shard-" + i + ".json"))
    );
    DATA = shards.flat();
  }
  $("loadStatus").textContent = `${DATA.length.toLocaleString("en-ZA")} schools loaded`;
  hydrateFilters();
  apply();
}

boot().catch((err) => {
  $("loadStatus").textContent = "Could not load the register.";
  console.error(err);
});
