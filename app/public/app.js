// Клієнт: працює лише через REST API (/api/*). Усі рядки з БД екрануються функцією esc() (захист від XSS).
const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const fmt = v => { const d = new Date(v); return isNaN(d) ? "" : d.toLocaleDateString("uk-UA"); };
const fmtT = v => { const d = new Date(v); return isNaN(d) ? "" : d.toLocaleString("uk-UA"); };
const STATUS = { pending: "очікує перевірки", approved: "схвалено", rejected: "відхилено" };
const MAX_DEPTH = 3;

let users = [], me = null, page = 1, current = null;

async function api(path, opts) {
  opts = opts || {};
  const res = await fetch("/api" + path, { method: opts.method || "GET", headers: opts.body ? { "Content-Type": "application/json" } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
  return data;
}
function toast(msg, err) {
  const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
}
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };
const canWrite = () => me && (me.role === "admin" || me.role === "author");

// ------------------------------------------------------------ навігація
function show(view) {
  ["feed", "new", "moderation", "notif"].forEach(v => $("view-" + v).hidden = v !== view);
  document.querySelectorAll("nav button[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  if (view === "feed") loadPosts();
  if (view === "moderation") loadModeration();
  if (view === "notif") loadNotifications();
  if (view === "new" && !$("pId").value) resetForm();
}
document.querySelectorAll("nav button[data-view]").forEach(b => b.onclick = () => show(b.dataset.view));
$("bell").onclick = () => show("notif");

// ------------------------------------------------------------ користувачі
async function loadUsers() {
  users = await api("/users");
  const saved = (() => { try { return localStorage.getItem("blog_user"); } catch (e) { return null; } })();
  $("userSel").innerHTML = users.map(u => `<option value="${esc(u._id)}">${esc(u.username)} (${esc(u.role)})</option>`).join("");
  me = users.find(u => u._id === saved) || users.find(u => u.role === "admin") || users[0];
  $("userSel").value = me._id;
  $("fAuthor").innerHTML += users.filter(u => u.role !== "reader").map(u => `<option value="${esc(u.username)}">${esc(u.username)}</option>`).join("");
  applyUser();
}
function applyUser() {
  $("navMod").hidden = !(me && me.role === "admin");
  refreshBell();
}
$("userSel").onchange = () => {
  me = users.find(u => u._id === $("userSel").value);
  try { localStorage.setItem("blog_user", me._id); } catch (e) { /* приватний режим */ }
  applyUser(); if (!$("view-moderation").hidden && me.role !== "admin") show("feed");
  if (!$("postModal").style.display || $("postModal").style.display === "none") return;
  openPost(current._id, true);
};
async function refreshBell() {
  try {
    const r = await api("/notifications?unread=1&user_id=" + me._id);
    $("bellCount").textContent = r.unread; $("bellCount").hidden = !r.unread;
  } catch (e) { /* ігноруємо */ }
}
setInterval(() => me && refreshBell(), 30000);

// ------------------------------------------------------------ довідники
async function loadCategories() {
  const cats = await api("/categories");
  const opts = cats.map(c => `<option value="${esc(c._id)}" data-slug="${esc(c.slug)}">${esc(c.name)}</option>`).join("");
  $("pCat").innerHTML = opts;
  $("fCat").innerHTML = '<option value="">усі</option>' + cats.map(c => `<option value="${esc(c.slug)}">${esc(c.name)} (${c.statistics ? c.statistics.posts_count : 0})</option>`).join("");
}

// ------------------------------------------------------------ стрічка
function query() {
  const p = new URLSearchParams({ page, per_page: 9, sort: $("fSort").value });
  const set = (k, v) => { if (v) p.set(k, v); };
  set("q", $("fQ").value.trim()); set("tags", $("fTags").value.trim()); set("category", $("fCat").value); set("author", $("fAuthor").value);
  if ($("fTags").value.trim()) p.set("tag_mode", $("fMode").value);
  set("from", $("fFrom").value); if ($("fTo").value) p.set("to", $("fTo").value + "T23:59:59Z");
  if ($("fCity").value) { const [lon, lat] = $("fCity").value.split(","); p.set("lon", lon); p.set("lat", lat); p.set("radius_km", $("fRadius").value); }
  if ($("fQ").value.trim() && !$("fCity").value) p.set("sort", "relevance");
  return p.toString();
}
const loadPosts = guard(async () => {
  const r = await api("/posts?" + query());
  $("resultInfo").textContent = `Знайдено: ${r.total} · сторінка ${r.page} з ${r.pages || 1}`;
  $("postsGrid").innerHTML = r.items.map(card).join("") || '<p class="muted">Нічого не знайдено</p>';
  $("postsGrid").querySelectorAll(".post-card").forEach(el => el.onclick = e => {
    if (e.target.classList.contains("tag")) { $("fTags").value = e.target.dataset.tag; page = 1; loadPosts(); return; }
    openPost(el.dataset.id);
  });
  renderPager(r.pages, r.page);
});
function card(p) {
  const s = p.statistics || {};
  return `<div class="post-card" data-id="${esc(p._id)}">
    ${p.featured_image ? `<img src="${esc(p.featured_image)}" alt="" loading="lazy">` : ""}
    <div class="post-content"><h2 class="post-title">${esc(p.title)}</h2>
    <div class="post-meta"><span>👤 ${esc(p.author.username)}</span><span>📁 ${esc(p.category.name)}</span><span>📅 ${fmt(p.published_at)}</span>
      <span>👁️ ${s.views || 0}</span><span>👍 ${s.likes || 0}</span><span>👎 ${s.dislikes || 0}</span><span>💬 ${s.comments_count || 0}</span>
      ${p.location_name ? `<span>📍 ${esc(p.location_name)}${p.distance_m != null ? " · " + Math.round(p.distance_m / 1000) + " км" : ""}</span>` : ""}</div>
    <p class="post-excerpt">${esc(p.excerpt)}</p>
    <div class="post-tags">${(p.tags || []).map(t => `<span class="tag" data-tag="${esc(t)}">#${esc(t)}</span>`).join("")}</div></div></div>`;
}
function renderPager(pages, cur) {
  if (pages <= 1) { $("pager").innerHTML = ""; return; }
  const nums = []; for (let i = Math.max(1, cur - 2); i <= Math.min(pages, cur + 2); i++) nums.push(i);
  $("pager").innerHTML = `<button data-p="${cur - 1}" ${cur === 1 ? "disabled" : ""}>←</button>` +
    (nums[0] > 1 ? '<button data-p="1">1</button>…' : "") +
    nums.map(i => `<button data-p="${i}" class="${i === cur ? "cur" : ""}">${i}</button>`).join("") +
    (nums[nums.length - 1] < pages ? `…<button data-p="${pages}">${pages}</button>` : "") +
    `<button data-p="${cur + 1}" ${cur === pages ? "disabled" : ""}>→</button>`;
  $("pager").querySelectorAll("button").forEach(b => b.onclick = () => { page = +b.dataset.p; loadPosts(); window.scrollTo(0, 0); });
}
$("filters").onsubmit = e => { e.preventDefault(); page = 1; loadPosts(); };
$("fReset").onclick = () => { $("filters").reset(); page = 1; loadPosts(); };

// ------------------------------------------------------------ перегляд поста
const openPost = guard(async (id, noCount) => {
  const p = await api(`/posts/${id}?user_id=${me._id}${noCount ? "&nocount=1" : ""}`);
  current = p; renderPost(p, "comments");
  $("postModal").style.display = "block";
});
function renderPost(p, tab) {
  const s = p.statistics, canEdit = me && (me.role === "admin" || me._id === String(p.author.user_id));
  $("postDetails").innerHTML = `
    ${p.featured_image ? `<img src="${esc(p.featured_image)}" alt="" style="width:100%;max-height:300px;object-fit:cover;border-radius:8px;margin-bottom:1rem">` : ""}
    <h2>${esc(p.title)} ${p.status !== "published" ? `<span class="st rejected">${esc(p.status)}</span>` : ""}</h2>
    <div class="post-meta" style="margin:.6rem 0"><span>👤 ${esc(p.author.username)}</span><span>📁 ${esc(p.category.name)}</span><span>📅 ${fmt(p.published_at || p.created_at)}</span>
      <span>👁️ ${s.views}</span><span>🏷️ версія ${p.version}</span>${p.location_name ? `<span>📍 ${esc(p.location_name)}</span>` : ""}</div>
    <div class="post-tags">${p.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join("")}</div>
    <div class="post-body">${esc(p.content)}</div>
    <div class="actions">
      <button class="btn sm react ${p.my_reaction === 1 ? "on" : ""}" data-act="like">👍 ${s.likes}</button>
      <button class="btn sm react ${p.my_reaction === -1 ? "on" : ""}" data-act="dislike">👎 ${s.dislikes}</button>
      ${canEdit ? '<button class="btn sm sec" data-act="edit">✏️ Редагувати</button>' : ""}
      ${canEdit && p.status !== "archived" ? '<button class="btn sm bad" data-act="archive">Архівувати</button>' : ""}
    </div>
    <div class="tabs"><button data-tab="comments" class="${tab === "comments" ? "on" : ""}">Коментарі (${s.comments_count})</button><button data-tab="versions" class="${tab === "versions" ? "on" : ""}">Історія версій</button></div>
    <div id="tabBody"></div>`;
  if (tab === "comments") renderComments(p); else loadVersions(p, canEdit);
}
function commentHtml(c) {
  const adm = me && me.role === "admin";
  return `<div class="comment" data-cid="${esc(c.comment_id)}">
    <span class="comment-author">${esc(c.author.username)}</span>
    ${c.status !== "approved" ? `<span class="st ${esc(c.status)}">${esc(STATUS[c.status])}</span>` : ""}
    <span class="muted"> · ${fmtT(c.created_at)}</span>
    <p>${esc(c.text)}</p>
    <div>${c.status === "approved" && c.depth < MAX_DEPTH && me ? `<button class="btn sm sec" data-act="reply" data-cid="${esc(c.comment_id)}">Відповісти</button>` : ""}
    ${adm && c.status !== "approved" ? `<button class="btn sm ok" data-act="mod" data-st="approved" data-cid="${esc(c.comment_id)}">Схвалити</button>` : ""}
    ${adm && c.status !== "rejected" ? `<button class="btn sm bad" data-act="mod" data-st="rejected" data-cid="${esc(c.comment_id)}">Відхилити</button>` : ""}</div>
    <div class="reply-slot"></div>
    ${c.replies.length ? `<div class="replies">${c.replies.map(commentHtml).join("")}</div>` : ""}</div>`; // рекурсія: відповіді рендеряться тією ж функцією
}
function renderComments(p) {
  $("tabBody").innerHTML = `<div class="comments" style="border:none;margin:0;padding:0">${p.comments_tree.map(commentHtml).join("") || '<p class="muted">Коментарів ще немає</p>'}
    <form id="newComment" class="inline-form"><input id="ncText" placeholder="Ваш коментар (з'явиться після модерації)…" required maxlength="2000"><button class="btn sm">Надіслати</button></form></div>`;
  $("newComment").onsubmit = guard(async e => { e.preventDefault(); await sendComment(null, $("ncText").value); });
}
const sendComment = async (parentId, text) => {
  const c = await api(`/posts/${current._id}/comments`, { method: "POST", body: { user_id: me._id, text, parent_id: parentId } });
  toast(c.status === "approved" ? "Коментар опубліковано" : "Коментар надіслано на модерацію");
  await openPost(current._id, true);
};
async function loadVersions(p, canEdit) {
  const r = await api(`/posts/${p._id}/versions`);
  $("tabBody").innerHTML = `<table class="t"><tr><th>Версія</th><th>Назва</th><th>Коли</th><th>Примітка</th><th></th></tr>
    <tr><td><b>${r.current.version}</b> (поточна)</td><td>${esc(r.current.title)}</td><td>${fmtT(r.current.updated_at)}</td><td></td><td></td></tr>
    ${r.items.map(v => `<tr><td>${v.version}</td><td>${esc(v.title)}</td><td>${fmtT(v.saved_at)}</td><td>${esc(v.change_note)}</td>
      <td><button class="btn sm sec" data-act="vview" data-n="${v.version}">Переглянути</button> ${canEdit ? `<button class="btn sm" data-act="vrestore" data-n="${v.version}">Відновити</button>` : ""}</td></tr>`).join("")}</table>
    <div id="vView"></div>`;
}

$("postDetails").onclick = guard(async e => {
  const b = e.target.closest("button[data-act], button[data-tab]"); if (!b) return;
  if (b.dataset.tab) return renderPost(current, b.dataset.tab);
  const act = b.dataset.act;
  if (act === "like" || act === "dislike") {
    const want = act === "like" ? 1 : -1;
    await api(`/posts/${current._id}/reaction`, { method: "POST", body: { user_id: me._id, value: current.my_reaction === want ? 0 : want } });
    return openPost(current._id, true);
  }
  if (act === "reply") {
    const slot = b.closest(".comment").querySelector(".reply-slot");
    slot.innerHTML = '<form class="inline-form"><input required maxlength="2000" placeholder="Ваша відповідь…"><button class="btn sm">OK</button></form>';
    const f = slot.firstChild; f.querySelector("input").focus();
    f.onsubmit = guard(async ev => { ev.preventDefault(); await sendComment(b.dataset.cid, f.querySelector("input").value); });
  }
  if (act === "mod") { await api(`/posts/${current._id}/comments/${b.dataset.cid}`, { method: "PATCH", body: { moderator_id: me._id, status: b.dataset.st } }); return openPost(current._id, true); }
  if (act === "edit") return startEdit(current);
  if (act === "archive") { if (!confirm("Перемістити пост в архів?")) return; await api(`/posts/${current._id}?user_id=${me._id}`, { method: "DELETE" }); toast("Пост архівовано"); closeModal(); loadPosts(); }
  if (act === "vview") { const v = await api(`/posts/${current._id}/versions/${b.dataset.n}`); $("vView").innerHTML = `<div class="panel"><h3>Версія ${v.version}: ${esc(v.title)}</h3><div class="post-body">${esc(v.content)}</div></div>`; }
  if (act === "vrestore") { if (!confirm("Відновити версію " + b.dataset.n + "? Поточний стан теж збережеться в історії.")) return; await api(`/posts/${current._id}/versions/${b.dataset.n}/restore`, { method: "POST", body: { user_id: me._id } }); toast("Версію відновлено"); const p = await api(`/posts/${current._id}?user_id=${me._id}&nocount=1`); current = p; renderPost(p, "versions"); loadPosts(); }
});
function closeModal() { $("postModal").style.display = "none"; }
$("closeModal").onclick = closeModal;
window.onclick = e => { if (e.target === $("postModal")) closeModal(); };

// ------------------------------------------------------------ форма створення / редагування
function resetForm() {
  $("postForm").reset(); $("pId").value = ""; $("pVersion").value = ""; $("noteRow").hidden = true;
  $("formTitle").textContent = "Нова стаття"; $("pSubmit").textContent = "Опублікувати";
}
function startEdit(p) {
  closeModal(); show("new");
  $("pId").value = p._id; $("pVersion").value = p.version; $("noteRow").hidden = false;
  $("formTitle").textContent = "Редагування (поточна версія " + p.version + ")"; $("pSubmit").textContent = "Зберегти нову версію";
  $("pTitle").value = p.title; $("pCat").value = String(p.category.category_id); $("pTags").value = p.tags.join(", ");
  $("pExcerpt").value = p.excerpt || ""; $("pContent").value = p.content; $("pImage").value = p.featured_image || "";
  $("pStatus").value = p.status === "draft" ? "draft" : "published"; $("pNote").value = "";
  const c = p.location ? p.location.coordinates : ["", ""]; $("pLon").value = c[0]; $("pLat").value = c[1]; $("pPlace").value = p.location_name || "";
}
$("postForm").onsubmit = guard(async e => {
  e.preventDefault();
  if (!canWrite()) throw new Error("Оберіть користувача з роллю автора або адміністратора");
  const body = { title: $("pTitle").value, category_id: $("pCat").value, tags: $("pTags").value, excerpt: $("pExcerpt").value, content: $("pContent").value,
    featured_image: $("pImage").value, status: $("pStatus").value, lon: $("pLon").value, lat: $("pLat").value, location_name: $("pPlace").value };
  const id = $("pId").value;
  if (id) { Object.assign(body, { editor_id: me._id, expected_version: +$("pVersion").value, change_note: $("pNote").value }); await api("/posts/" + id, { method: "PUT", body }); toast("Збережено нову версію"); }
  else { body.author_id = me._id; const r = await api("/posts", { method: "POST", body }); toast(r.status === "draft" ? "Чернетку збережено" : "Статтю опубліковано"); }
  resetForm(); show("feed");
});
$("pCancel").onclick = () => { resetForm(); show("feed"); };

// ------------------------------------------------------------ модерація
const loadModeration = guard(async () => {
  const items = await api(`/moderation/queue?user_id=${me._id}&status=${$("modStatus").value}`);
  $("modList").innerHTML = items.map(i => `<div class="comment" data-post="${esc(i.post_id)}" data-cid="${esc(i.comment.comment_id)}">
    <span class="comment-author">${esc(i.comment.author.username)}</span><span class="st ${esc(i.comment.status)}">${esc(STATUS[i.comment.status])}</span>
    <span class="muted"> · ${fmtT(i.comment.created_at)} · «${esc(i.post_title)}»</span><p>${esc(i.comment.text)}</p>
    ${i.comment.status !== "approved" ? '<button class="btn sm ok" data-st="approved">Схвалити</button> ' : ""}${i.comment.status !== "rejected" ? '<button class="btn sm bad" data-st="rejected">Відхилити</button>' : ""}</div>`).join("") || '<p class="muted">Порожньо</p>';
});
$("modStatus").onchange = loadModeration;
$("modList").onclick = guard(async e => {
  const b = e.target.closest("button[data-st]"); if (!b) return;
  const row = b.closest(".comment");
  await api(`/posts/${row.dataset.post}/comments/${row.dataset.cid}`, { method: "PATCH", body: { moderator_id: me._id, status: b.dataset.st } });
  toast("Статус змінено"); loadModeration(); refreshBell();
});

// ------------------------------------------------------------ сповіщення
const loadNotifications = guard(async () => {
  const r = await api("/notifications?user_id=" + me._id);
  $("notifList").innerHTML = r.items.map(n => `<div class="notif ${n.is_read ? "" : "unread"}">
    <b>${esc(n.from_user.username)}</b> ${n.type === "reply" ? "відповів(ла) на ваш коментар" : "прокоментував(ла) ваш пост"} «${esc(n.post_title)}»
    <div class="muted">${fmtT(n.created_at)} — ${esc(n.text_preview)}</div></div>`).join("") || '<p class="muted">Сповіщень немає</p>';
});
$("readAll").onclick = guard(async () => { await api("/notifications/read", { method: "POST", body: { user_id: me._id } }); await loadNotifications(); refreshBell(); });

// ------------------------------------------------------------ старт
(async () => {
  try { await Promise.all([loadUsers(), loadCategories()]); await loadPosts(); }
  catch (e) { $("resultInfo").textContent = "API недоступне: " + e.message + ". Запустіть сервер: npm start (див. README)."; }
})();
