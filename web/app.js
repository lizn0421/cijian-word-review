"use strict";

const C = window.Cijian;
const $ = (id) => document.getElementById(id);
const storageKey = "cijian.study.v1";
const dateFormat = new Intl.DateTimeFormat("zh-CN", {month: "long", day: "numeric", weekday: "long"});
const timeFormat = new Intl.DateTimeFormat("zh-CN", {month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"});
const ratings = [
  ["again", "忘了"], ["hard", "很吃力"], ["good", "想起来了"], ["easy", "很熟"]
];
const android = window.CijianAndroid;
let state = C.empty(), active = "today", session = false, revealed = false, currentId = "";
let editing = null, visibleRows = 50, toastTimer;

function status(message, error = false) {
  const target = $("status");
  target.textContent = message;
  target.classList.toggle("error", error);
  target.hidden = false;
  clearTimeout(toastTimer);
  if (!error) toastTimer = setTimeout(() => { target.hidden = true; }, 5400);
}
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) state = C.readBackup(saved);
} catch {
  status("现有进度暂时无法读取。若有 JSON 备份，可以从设置中恢复。", true);
}
function save(next) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
    state = next;
    return true;
  } catch {
    status("保存失败。请检查存储空间，或先导出一份备份。", true);
    return false;
  }
}
window.addEventListener("storage", (event) => {
  if (event.key !== storageKey) return;
  try {
    state = event.newValue ? C.readBackup(event.newValue) : C.empty();
    currentId = ""; revealed = false;
    render();
  } catch {
    status("另一标签页的进度无法读取。", true);
  }
});

function node(tag, value, className) {
  const result = document.createElement(tag);
  if (value) result.textContent = value;
  if (className) result.className = className;
  return result;
}
function button(label, className, action) {
  const result = node("button", label, className);
  result.type = "button";
  result.addEventListener("click", action);
  return result;
}
function go(tab) {
  active = tab;
  for (const key of ["today", "words", "settings"]) $(key).hidden = key !== tab;
  for (const item of document.querySelectorAll("[data-tab]")) {
    if (item.dataset.tab === tab) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }
  render();
  window.scrollTo(0, 0);
}
function delayLabel(milliseconds) {
  return milliseconds < C.DAY ? Math.round(milliseconds / C.MINUTE) + " 分钟后" : Math.round(milliseconds / C.DAY) + " 天后";
}
function speak(text) {
  if (android) { android.speak(text); return; }
  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.88;
    utterance.onerror = (event) => {
      if (!["interrupted", "canceled"].includes(event.error)) status("当前设备没有可用的英文语音。", true);
    };
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }
}
function reviewView() {
  const now = Date.now(), totals = C.summary(state, now);
  $("date").textContent = dateFormat.format(now);
  for (const name of ["due", "fresh", "done"]) $(name).textContent = totals[name];
  $("next-review").textContent = totals.next ? "最近到期 · " + timeFormat.format(totals.next) : "";
  const view = $("review-card");
  if (!session || !totals.queue.length) {
    session = false; currentId = ""; revealed = false;
    const top = node("div", totals.total ? "学习队列" : "开始学习", "card-label");
    const body = node("div", "", "card-content");
    const footer = node("div", "", "button-row");
    if (!totals.total) {
      body.append(node("h2", "从你的词表开始", "prompt chinese"),
        node("p", "导入 Google 翻译收藏，把查过的单词和短语变成可复习的卡片。", "hint"));
      footer.append(button("导入收藏", "light-button", () => go("settings")),
        button("试用示例", "outline-button", addDemo));
    } else if (totals.queue.length) {
      body.append(node("h2", "还有 " + totals.queue.length + " 张待练", "prompt chinese"),
        node("p", "每张卡先在心里说出答案，再按回想难度评分。", "hint"));
      footer.append(button("开始练习", "light-button", () => { session = true; reviewView(); $("flip")?.focus(); }));
    } else {
      body.append(node("h2", "当前队列已完成", "prompt chinese"),
        node("p", totals.next ? "下次到期后会出现新的复习卡片。" : "每日新词额度按当地日期更新。", "hint"));
      footer.append(button("查看词库", "outline-button", () => go("words")));
    }
    view.replaceChildren(top, body, footer);
    return;
  }
  const card = totals.queue.find(item => item.id === currentId) || totals.queue[0];
  if (card.id !== currentId) { currentId = card.id; revealed = false; }
  const reverse = state.direction === "zh" || (state.direction === "mix" && card.reviews % 2 === 1);
  const head = node("div", "", "card-top");
  head.append(node("span", (card.first ? "到期复习" : "新词") + " · " + (reverse ? "中 → 英" : "英 → 中"), "card-label"));
  if ((!reverse || revealed) && (android || "speechSynthesis" in window)) {
    head.append(button("发音", "outline-button", () => speak(card.en)));
  }
  const body = node("div", "", "card-content");
  const prompt = node("h2", reverse ? card.zh : card.en, reverse ? "prompt chinese" : "prompt");
  prompt.lang = reverse ? "zh-CN" : "en";
  body.append(prompt);
  if (revealed) {
    const answer = node("p", reverse ? card.en : card.zh, "answer");
    answer.lang = reverse ? "en" : "zh-CN";
    body.append(answer);
    if (card.example) body.append(node("p", card.example, "example"));
  } else {
    body.append(node("p", reverse ? "试着说出对应的英文。" : "试着想起它在你遇到的语境里的意思。", "hint"));
  }
  const actions = node("div", "", revealed ? "ratings" : "button-row");
  if (revealed) {
    for (const [key, label] of ratings) {
      const option = button(label, "rating", () => {
        const reviewed = C.review(card, key);
        const next = {...state, cards: state.cards.map(item => item.id === card.id ? reviewed : item)};
        if (save(next)) {
          revealed = false; currentId = "";
          reviewView();
          $("flip")?.focus();
        }
      });
      option.append(node("small", delayLabel(C.preview(card, key, now).due - now)));
      actions.append(option);
    }
  } else {
    const flip = button("显示答案", "light-button", () => { revealed = true; reviewView(); view.querySelector(".rating")?.focus(); });
    flip.id = "flip";
    actions.append(flip);
  }
  view.replaceChildren(head, body, actions);
}

function wordsView() {
  const totals = C.summary(state);
  $("words-summary").textContent = totals.total + " 张卡片 · " + totals.difficult + " 张难词";
  const query = $("search").value.trim().toLowerCase();
  const hardOnly = $("hard-filter").checked;
  const words = state.cards.filter(card => (!hardOnly || C.difficult(card))
    && [card.en, card.zh, card.example].some(value => value.toLowerCase().includes(query)));
  const list = $("word-list");
  const rows = document.createDocumentFragment();
  for (const card of words.slice(0, visibleRows)) {
    const row = node("div", "", "word-row");
    const content = node("div");
    const word = node("strong", card.en); word.lang = "en";
    content.append(word, node("p", card.zh), node("small", card.first ? "下次 " + timeFormat.format(card.due) : "待学"));
    if (C.difficult(card)) content.append(node("small", " · 难词"));
    const actions = node("div", "", "word-actions");
    actions.append(button("编辑", "secondary", () => openEditor(card)));
    actions.append(button("删除", "text-button", () => {
      if (confirm("删除「" + card.en + "」及其复习进度？") &&
          save({...state, cards: state.cards.filter(item => item.id !== card.id)})) render();
    }));
    row.append(content, actions);
    rows.append(row);
  }
  if (!words.length) rows.append(node("p", state.cards.length ? "没有匹配的卡片。" : "导入词表或手动添加卡片后，词库会显示在这里。", "word-empty"));
  list.replaceChildren(rows);
  $("more").hidden = words.length <= visibleRows;
}
function render() {
  if (active === "today") reviewView();
  if (active === "words") wordsView();
  $("limit").value = String(state.limit);
  $("direction").value = state.direction;
  $("remove-demo").hidden = !state.cards.some(card => card.demo);
}

function openEditor(card) {
  editing = card || null;
  $("editor-title").textContent = card ? "编辑卡片" : "添加卡片";
  $("edit-en").value = card?.en || "";
  $("edit-zh").value = card?.zh || "";
  $("edit-example").value = card?.example || "";
  $("edit-pinned").checked = card?.pinned || false;
  $("editor").showModal();
}
$("edit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const en = $("edit-en").value.trim(), zh = $("edit-zh").value.trim();
  const example = $("edit-example").value.trim();
  if (!en || !zh) return;
  const fresh = C.createCard(en, zh, example, editing?.demo || false);
  if (state.cards.some(card => card.id === fresh.id && card.id !== editing?.id)) {
    $("edit-en").setCustomValidity("这张卡片已经存在。"); $("edit-en").reportValidity(); return;
  }
  const card = {...(editing || fresh), id: fresh.id, en, zh, example, pinned: $("edit-pinned").checked, edited: Date.now()};
  const cards = editing ? state.cards.map(item => item.id === editing.id ? card : item) : [...state.cards, card];
  if (save({...state, cards})) {
    $("editor").close(); render(); status("卡片已保存。");
  }
});
$("edit-en").addEventListener("input", () => $("edit-en").setCustomValidity(""));
$("edit-zh").addEventListener("input", () => $("edit-en").setCustomValidity(""));
$("editor").addEventListener("close", () => $("edit-en").setCustomValidity(""));
$("cancel-edit").addEventListener("click", () => $("editor").close());

function addDemo() {
  const items = C.DEMO.map(([en, zh, example]) => ({...C.createCard(en, zh, example, true), imported: true}));
  const result = C.mergeCards(state.cards, items);
  if (save({...state, cards: result.cards})) {
    render(); status(result.added ? "已添加 " + result.added + " 张示例卡片。" : "示例卡片已在词库里。");
  }
}
function importText(text) {
  const parsed = C.parseImport(text);
  if (!parsed.cards.length) throw Error("没有识别到英中词条。请检查导出的表格，或粘贴「英文、中文」两列。");
  const result = C.mergeCards(state.cards, parsed.cards.map(card => ({...card, imported: true})));
  if (save({...state, cards: result.cards})) {
    render();
    status("新增 " + result.added + " 张，更新 " + result.updated + " 张，重复 " + result.duplicate + " 张，跳过 " + parsed.skipped + " 行。" + (parsed.skippedRows.length ? " 跳过：" + parsed.skippedRows.slice(0, 5).map(item => "第 " + item.row + " 行（" + item.reason + "）").join("；") : ""));
  }
}
function importBackup(text) {
  const backup = C.readBackup(text);
  const result = C.mergeCards(state.cards, backup.cards);
  const next = {...state, cards: result.cards};
  if (!state.cards.length) { next.limit = backup.limit; next.direction = backup.direction; }
  if (save(next)) {
    render(); status("备份已合并。新增 " + result.added + " 张，更新 " + result.updated + " 张。");
  }
}
function handleFile(id, handler) {
  $(id).addEventListener("change", async () => {
    const input = $(id), file = input.files[0];
    if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw Error("文件超过 8 MB，请分批导入。");
      handler(await file.text());
    } catch (error) {
      status(error instanceof SyntaxError ? "JSON 备份无法读取，请重新选择文件。" : error.message, true);
    } finally { input.value = ""; }
  });
}
handleFile("csv-file", importText);
handleFile("backup-file", importBackup);
$("import-paste").addEventListener("click", () => {
  try { importText($("paste").value); } catch (error) { status(error.message, true); }
});
$("backup").addEventListener("click", () => {
  const data = JSON.stringify(state, null, 2);
  const filename = "cijian-" + new Intl.DateTimeFormat("en-CA").format(Date.now()).replaceAll("/", "-") + ".json";
  if (android) { android.exportBackup(filename, data); return; }
  const url = URL.createObjectURL(new Blob([data], {type: "application/json"}));
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
});
$("remove-demo").addEventListener("click", () => {
  if (save({...state, cards: state.cards.filter(card => !card.demo)})) {
    render(); status("已移除示例卡片。");
  }
});
$("choose-csv").addEventListener("click", () => $("csv-file").click());
$("choose-backup").addEventListener("click", () => $("backup-file").click());
$("limit").addEventListener("change", (event) => { save({...state, limit: Number(event.target.value)}); render(); });
$("direction").addEventListener("change", (event) => {
  if (save({...state, direction: event.target.value})) revealed = false;
  render();
});
$("demo-settings").addEventListener("click", addDemo);
$("home").addEventListener("click", () => go("today"));
$("quick-import").addEventListener("click", () => go("settings"));
$("go-hard").addEventListener("click", () => { $("hard-filter").checked = true; go("words"); });
$("manual-add").addEventListener("click", () => openEditor());
for (const item of document.querySelectorAll("[data-tab]")) item.addEventListener("click", () => go(item.dataset.tab));
for (const key of ["search", "hard-filter"]) $(key).addEventListener("input", () => { visibleRows = 50; wordsView(); });
$("more").addEventListener("click", () => { visibleRows += 50; wordsView(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && active === "today" && !session) reviewView(); });
setInterval(() => { if (active === "today" && !session && !document.hidden) reviewView(); }, 30000);
if (!android && "serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
render();
