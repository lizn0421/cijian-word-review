(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Cijian = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const MINUTE = 60_000;
  const DAY = 24 * 60 * MINUTE;
  const RATINGS = ["again", "hard", "good", "easy"];
  const DEMO = [
    ["regression", "回归；功能退化", "This change introduced a regression in multi-user mode."],
    ["intermittent", "间歇性的；时有时无的", "The connection failure is intermittent."],
    ["workaround", "变通办法；临时解决方案", "We found a workaround for the startup crash."],
    ["isolate", "隔离；把……单独找出来", "We need to isolate each user's app data."],
    ["reproduce", "复现；重现", "Can you reproduce the issue on Android 11?"],
    ["fall back to", "退回使用；改用备用方案", "The app falls back to local storage."],
    ["overdue", "过期的；逾期的", "Three reviews are overdue."],
    ["distinguish", "区分；辨别", "Distinguish a timeout from a permission error."]
  ];
  const empty = () => ({version: 1, limit: 5, direction: "en", cards: []});
  const identity = (en, zh) => JSON.stringify([en, zh].map(value => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()));
  const dayKey = (time) => {
    const d = new Date(time);
    return [d.getFullYear(), d.getMonth() + 1, d.getDate()].join("-");
  };
  function createCard(en, zh, example = "", demo = false, now = Date.now()) {
    en = en.trim(); zh = zh.trim();
    return {id: identity(en, zh), en, zh, example: example.trim(), demo, pinned: false,
      created: now, edited: now, first: 0, last: 0, due: 0, days: 0, reviews: 0, lapses: 0, rating: ""};
  }
  function preview(card, rating, now = Date.now()) {
    const baseline = Math.max(1, card.days);
    if (rating === "again") return {due: now + 10 * MINUTE, days: 0};
    if (rating === "hard") {
      if (card.days < 2) return {due: now + 30 * MINUTE, days: 0};
      const days = Math.max(1, Math.round(baseline * 0.65));
      return {due: now + days * DAY, days};
    }
    const days = rating === "easy"
      ? (card.days ? Math.max(4, Math.ceil(baseline * 2.8)) : 4)
      : (card.days ? Math.max(2, Math.ceil(baseline * 2)) : 1);
    const bounded = Math.min(180, days);
    return {due: now + bounded * DAY, days: bounded};
  }
  function review(card, rating, now = Date.now()) {
    if (!RATINGS.includes(rating)) throw Error("评分无效");
    return {...card, ...preview(card, rating, now), first: card.first || now, last: now,
      rating, reviews: card.reviews + 1, lapses: card.lapses + Number(rating === "again")};
  }
  const difficult = (card) => card.pinned || card.lapses >= 2 || card.rating === "again" || card.rating === "hard";
  function summary(state, now = Date.now()) {
    const day = dayKey(now);
    const newToday = state.cards.filter(card => card.first && dayKey(card.first) === day).length;
    const waiting = state.cards.filter(card => !card.first);
    const due = state.cards.filter(card => card.first && card.due <= now);
    const fresh = waiting.sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.created - b.created)
      .slice(0, Math.max(0, state.limit - newToday));
    due.sort((a, b) => Number(difficult(b)) - Number(difficult(a)) || a.due - b.due);
    const future = state.cards.filter(card => card.first && card.due > now).map(card => card.due);
    return {queue: [...due, ...fresh], due: due.length, fresh: fresh.length, waiting: waiting.length,
      done: state.cards.filter(card => card.last && dayKey(card.last) === day).length,
      difficult: state.cards.filter(difficult).length, total: state.cards.length,
      next: future.length ? future.reduce((min, value) => Math.min(min, value)) : 0};
  }
  function parseDelimited(text, delimiter) {
    const rows = [];
    let row = [], field = "", quoted = false;
    const input = text.replace(/^\uFEFF/, "");
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (quoted) {
        if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"' && !field) quoted = true;
      else if (ch === delimiter) { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && input[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += ch;
    }
    if (quoted) throw Error("表格里有未闭合的引号，请重新导出 CSV。");
    if (row.length || field) { row.push(field); rows.push(row); }
    return rows.filter(values => values.some(value => value.trim()));
  }
  const hasHan = (value) => /[\u3400-\u9fff]/.test(value);
  const hasLatin = (value) => /[A-Za-z]/.test(value);
  const isEnglish = (value) => hasLatin(value) && !hasHan(value);
  const englishName = (value) => /^(english(?:\b.*)?|en(?:[-_].+)?|英语|英文)$/i.test(value.trim());
  const chineseName = (value) => /^(chinese(?:\b.*)?|zh(?:[-_].+)?|汉语|(?:简体|繁體|繁体)?中文(?:[（(].*[）)])?)$/i.test(value.trim());
  const compact = (value) => value.toLowerCase().trim().replace(/[\s_-]/g, "");

  function parseImport(text) {
    const delimiter = text.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
    const rows = parseDelimited(text, delimiter);
    if (!rows.length) throw Error("表格没有可导入的内容。");
    const headers = rows[0].map(compact);
    const index = (names) => headers.findIndex(value => names.includes(value));
    const enIndex = index(["english", "en", "英语", "英文", "单词"]);
    const zhIndex = index(["chinese", "zh", "中文", "释义"]);
    const source = index(["sourcetext", "sourcephrase", "sourceword", "originaltext", "original", "source", "源文本", "原文"]);
    const target = index(["targettext", "targetphrase", "targetword", "translation", "translatedtext", "target", "译文", "翻译"]);
    const exampleIndex = index(["example", "examplesentence", "context", "例句", "语境"]);
    const sourceLang = index(["sourcelanguage", "sourcelang", "原语言", "源语言"]);
    const targetLang = index(["targetlanguage", "targetlang", "目标语言"]);
    const direct = enIndex >= 0 && zhIndex >= 0;
    const named = source >= 0 && target >= 0;
    const hasHeader = direct || named || sourceLang >= 0 || targetLang >= 0;
    const data = hasHeader ? rows.slice(1) : rows;
    const cards = [], skippedRows = [];
    let skipped = 0;
    for (const [rowIndex, raw] of data.entries()) {
      const row = raw.map(value => value.trim());
      let pair, explicitPair = false;
      if (direct) { pair = [row[enIndex], row[zhIndex]]; explicitPair = true; }
      else if (named) {
        const original = row[source], translation = row[target];
        if (sourceLang >= 0 && targetLang >= 0) {
          if (englishName(row[sourceLang] || "") && chineseName(row[targetLang] || "")) { pair = [original, translation]; explicitPair = true; }
          if (chineseName(row[sourceLang] || "") && englishName(row[targetLang] || "")) { pair = [translation, original]; explicitPair = true; }
        } else if (original && translation) {
          pair = isEnglish(original) ? [original, translation] : [translation, original];
        }
      } else {
        const enLang = row.findIndex(englishName);
        const zhLang = row.findIndex(chineseName);
        if (row.length === 4 && chineseName(row[1] || "") && isEnglish(row[2] || "")) {
          pair = [row[2], row[3]]; explicitPair = true;
        } else if (row.length === 4 && chineseName(row[0] || "") && englishName(row[1] || "")) {
          pair = [row[3], row[2]]; explicitPair = true;
        } else if (row.length >= 4 && enLang >= 0 && zhLang >= 0) {
          // Translate exports can group language labels together or alternate label and text.
          const values = row.filter((_, i) => i !== enLang && i !== zhLang);
          const en = values.find(isEnglish), zh = values.find(hasHan);
          if (en && zh) pair = [en, zh];
        } else if (row.length === 2 || row.length === 3) {
          pair = isEnglish(row[0]) ? row.slice(0, 2) : [row[1], row[0]];
        } else if (hasHeader) {
          const values = row.filter((_, i) => i !== sourceLang && i !== targetLang);
          const en = values.find(isEnglish), zh = values.find(hasHan);
          if (en && zh) pair = [en, zh];
        }
      }
      if (pair?.[0] && pair[1] && isEnglish(pair[0]) && (explicitPair || hasHan(pair[1]))) {
        const example = exampleIndex >= 0 ? row[exampleIndex] : !hasHeader && row.length === 3 ? row[2] : "";
        cards.push(createCard(...pair, example || ""));
      } else {
        skipped++;
        skippedRows.push({row: rowIndex + (hasHeader ? 2 : 1), reason: "缺少英文或译文，或不是可识别的英中词条"});
      }
    }
    return {cards, skipped, skippedRows};
  }
  function mergeCards(existing, incoming) {
    // Prefer the explicitly supplied lowercase spelling of common words.
    // Keep acronyms and known proper names in their original spelling.
    const properNames = /^(android|google|linux|windows|java|kotlin|python|github|javascript|typescript|openai)$/i;
    const lowercase = new Set([...existing, ...incoming].filter(card => card.en === card.en.toLowerCase()).map(card => card.en.normalize("NFKC")));
    const spelling = (card) => {
      const lower = card.en.toLowerCase();
      return lowercase.has(lower.normalize("NFKC")) && !properNames.test(card.en) && !/^[A-Z0-9_ -]+$/.test(card.en)
        ? {...card, en: lower} : card;
    };
    const cards = new Map(existing.map(card => [card.id, spelling(card)]));
    let added = 0, updated = 0, duplicate = 0;
    for (const original of incoming) {
      const item = spelling(original);
      const previous = cards.get(item.id);
      if (!previous) { cards.set(item.id, item); added++; continue; }
      const progress = item.last > previous.last || (item.last === previous.last && item.reviews > previous.reviews);
      const details = item.edited > previous.edited && !item.imported;
      const example = details ? item.example : previous.example || item.example;
      const demo = previous.demo && item.demo;
      if (!progress && !details && example === previous.example && demo === previous.demo) { duplicate++; continue; }
      const latest = progress ? item : previous;
      cards.set(item.id, {...latest, example, demo, pinned: details ? item.pinned : previous.pinned,
        edited: Math.max(previous.edited, details ? item.edited : 0),
        created: Math.min(previous.created, item.created),
        first: Math.min(previous.first || Infinity, item.first || Infinity) === Infinity ? 0
          : Math.min(previous.first || Infinity, item.first || Infinity)});
      updated++;
    }
    return {cards: [...cards.values()].map(({imported, ...card}) => card), added, updated, duplicate};
  }
  function readBackup(text) {
    const data = JSON.parse(text);
    if (!data || data.version !== 1 || !Array.isArray(data.cards)) throw Error("请选择由词间导出的 JSON 备份。");
    const numbers = ["created", "edited", "first", "last", "due", "days", "reviews", "lapses"];
    for (const card of data.cards) {
      if (!card || typeof card.en !== "string" || !card.en.trim() || typeof card.zh !== "string" || !card.zh.trim()
          || card.id !== identity(card.en, card.zh) || typeof card.example !== "string"
          || typeof card.demo !== "boolean" || typeof card.pinned !== "boolean"
          || numbers.some(key => !Number.isSafeInteger(card[key]) || card[key] < 0)
          || !["", ...RATINGS].includes(card.rating)) throw Error("备份里的卡片格式有误。");
    }
    return {version: 1, cards: data.cards, limit: [3, 5, 8, 12].includes(data.limit) ? data.limit : 5,
      direction: ["en", "zh", "mix"].includes(data.direction) ? data.direction : "en"};
  }
  return {empty, DEMO, createCard, review, preview, summary, parseImport, mergeCards, readBackup, difficult, MINUTE, DAY};
});
