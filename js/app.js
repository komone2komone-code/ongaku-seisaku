(() => {
  const STORAGE_KEY = "uchiNoDTM.v1";
  const IMAGE_DB_NAME = "uchiNoDTM.v1.images";
  const IMAGE_STORE = "photos";
  const UNOwned = new Set(["planned", "considering", "not-owned"]);

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  let store = emptyStore();
  let photoCache = {};
  let imageDb = null;
  let pendingFormPhoto = null;
  let pendingPhoto = null;

  const OWNER_STATUS = [
    ["owned", "持っている"],
    ["considering", "購入検討中"],
    ["not-owned", "持っていない"],
    ["unknown", "未確認"]
  ];
  let editTarget = null;
  let videoTarget = null;
  let renameTarget = null;
  let patchConnect = null;
  let patchDrag = null;
  let patchDialogMode = "";
  let termDrag = null;
  let purchaseDrag = null;
  let skipTermClick = false;
  let lastHub = "";
  let lastRenderedRoute = null;
  let lastListState = null;
  const LIST_RESTORE_STORE = "uchiNoDTM.listRestore";
  const LAST_VIEW_KEY = "uchiNoDTM.lastViewState";
  let lastViewState = null;
  let pendingBootView = null;
  let bootHash = "";
  let viewSaveTimer = null;
  let markOwnedTarget = null;
  let pendingBackupImport = null;
  const SHOW_APPLE_WORKFLOWS = false;
  const BACKUP_APP = "音楽制作アプリ";
  const BACKUP_FORMAT = 1;
  const SECRET_KEY_RE = /^(pass(word|wd)?|secret|api[_-]?key|auth|token|license([_-]?key)?|serial([_-]?(no|number|key))?|credentials?)$/i;

  function emptyStore() {
    return { overlays: {}, extra: {}, deleted: {}, categoryOrder: [], termOrder: {}, purchaseOrder: {}, customGroups: { gear: [], software: [], terms: [] }, scratchNotes: null };
  }

  function normalizeStore(parsed) {
    if (!parsed || typeof parsed !== "object") return emptyStore();
    return {
      overlays: parsed.overlays || {},
      extra: parsed.extra || {},
      deleted: parsed.deleted || {},
      categoryOrder: Array.isArray(parsed.categoryOrder) ? parsed.categoryOrder : [],
      termOrder: parsed.termOrder && typeof parsed.termOrder === "object" ? parsed.termOrder : {},
      purchaseOrder: parsed.purchaseOrder && typeof parsed.purchaseOrder === "object" ? parsed.purchaseOrder : {},
      customGroups: {
        gear: Array.isArray(parsed.customGroups?.gear) ? parsed.customGroups.gear : [],
        software: Array.isArray(parsed.customGroups?.software) ? parsed.customGroups.software : [],
        terms: Array.isArray(parsed.customGroups?.terms) ? parsed.customGroups.terms : []
      },
      scratchNotes: parsed.scratchNotes == null ? null : String(parsed.scratchNotes)
    };
  }

  function loadStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      const data = normalizeStore(parsed);
      if (purgeDummyRecords(data)) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
      }
      return data;
    } catch {
      return emptyStore();
    }
  }

  function purgeDummyRecords(data) {
    const dummyIds = { gear: ["sample-status-planned"] };
    let changed = false;
    Object.entries(dummyIds).forEach(([type, ids]) => {
      ids.forEach(id => {
        const extra = data.extra[type] || [];
        if (extra.some(item => item.id === id)) {
          data.extra[type] = extra.filter(item => item.id !== id);
          changed = true;
        }
        if (data.overlays[type] && data.overlays[type][id]) {
          delete data.overlays[type][id];
          changed = true;
        }
      });
    });
    return changed;
  }

  function saveStore() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function seed(type) {
    return Array.isArray(DTM[type]) ? DTM[type] : [];
  }

  function collection(type) {
    const deleted = new Set(store.deleted[type] || []);
    const overlays = store.overlays[type] || {};
    const extra = store.extra[type] || [];
    return [...seed(type), ...extra]
      .filter(item => item && item.id && !deleted.has(item.id))
      .map(item => Object.assign({}, item, overlays[item.id] || {}));
  }

  function findItem(type, id) {
    return collection(type).find(item => item.id === id) || null;
  }

  function patchItem(type, id, patch) {
    const seedIds = new Set(seed(type).map(item => item.id));
    const extra = store.extra[type] || [];
    if (!seedIds.has(id) && extra.some(item => item.id === id)) {
      store.extra[type] = extra.map(item => item.id === id ? Object.assign({}, item, patch) : item);
    } else {
      store.overlays[type] = store.overlays[type] || {};
      store.overlays[type][id] = Object.assign({}, store.overlays[type][id] || {}, patch);
    }
    saveStore();
  }

  function addItem(type, item) {
    store.extra[type] = store.extra[type] || [];
    store.extra[type].push(item);
    saveStore();
  }

  function deleteItem(type, id) {
    const extra = store.extra[type] || [];
    if (extra.some(item => item.id === id)) {
      store.extra[type] = extra.filter(item => item.id !== id);
    } else {
      store.deleted[type] = store.deleted[type] || [];
      if (!store.deleted[type].includes(id)) store.deleted[type].push(id);
    }
    saveStore();
    deletePhoto(`${type}:${id}`);
  }

  function gearGroups() {
    return [...(DTM.gearGroups || []), ...(store.customGroups?.gear || [])];
  }

  function purchaseGearCats() {
    return [
      { id: "mic", title: "マイク", groups: ["mic"] },
      { id: "interface", title: "オーディオインターフェース", groups: ["interface"] },
      { id: "monitor-control", title: "モニターコントローラー", groups: ["monitor-control"] },
      { id: "mic-pre", title: "マイクプリ／チャンネルストリップ", groups: ["mic-pre", "channel-strip"] },
      { id: "midi", title: "MIDI／コントローラー", groups: ["play"] },
      { id: "mixer", title: "ミキサー", groups: ["mixer"] },
      { id: "handheld", title: "レコーダー", groups: ["handheld"] },
      { id: "acoustic", title: "吸音・音響対策", groups: ["acoustic"] },
      { id: "sync", title: "クロック", groups: ["sync"] },
      { id: "other", title: "その他", groups: [] }
    ];
  }

  function purchaseCatId(item) {
    const group = item && item.group;
    const hit = purchaseGearCats().find(cat => cat.groups.includes(group));
    return hit ? hit.id : "other";
  }

  function purchaseGroupForCat(catId, currentGroup) {
    if (catId === "mic-pre") {
      return currentGroup === "channel-strip" ? "channel-strip" : "mic-pre";
    }
    if (catId === "other") {
      const mapped = purchaseCatId({ group: currentGroup });
      return mapped === "other" ? (currentGroup || "other") : "other";
    }
    const cat = purchaseGearCats().find(item => item.id === catId);
    return (cat && cat.groups[0]) || "other";
  }

  function itemsInPurchaseCat(catId, rows) {
    return rows
      .filter(row => purchaseCatId(row.item) === catId)
      .slice()
      .sort((a, b) => compareProductsByMaker(a.item, b.item));
  }

  function movePurchaseGear(id, toCat) {
    const item = findItem("gear", id);
    if (!item || !toCat) return;
    const nextGroup = purchaseGroupForCat(toCat, item.group);
    if (item.group !== nextGroup) {
      patchItem("gear", id, {
        group: nextGroup,
        categoryLabel: groupTitle("gear", nextGroup) || item.categoryLabel
      });
    }
    if (store.purchaseOrder) {
      Object.keys(store.purchaseOrder).forEach(cat => {
        store.purchaseOrder[cat] = (store.purchaseOrder[cat] || []).filter(x => x !== id);
      });
      saveStore();
    }
    render();
  }

  function softwareKinds() {
    const base = [
      { id: "daw", title: "DAW" },
      { id: "suite", title: "プラグインスイート" },
      { id: "plugin", title: "プラグイン" },
      { id: "instrument", title: "ソフト音源" },
      { id: "video", title: "映像" }
    ];
    return [...base, ...(store.customGroups?.software || [])];
  }

  function termCategories() {
    const base = [
      { id: "mic", title: "マイク・録音" },
      { id: "io", title: "オーディオインターフェース・入出力" },
      { id: "cable", title: "接続端子・ケーブル" },
      { id: "mix", title: "ミックス・音作り" },
      { id: "vocal", title: "ボーカル・音声処理" },
      { id: "monitor", title: "モニター・再生" },
      { id: "room", title: "部屋・音響対策" },
      { id: "digital", title: "デジタルオーディオ・同期" },
      { id: "daw", title: "DAW・ソフト" },
      { id: "sampling", title: "サンプリング・ビート制作" },
      { id: "synth", title: "シンセ・MIDI・シーケンス" },
      { id: "power", title: "電源・電圧" },
      { id: "meter", title: "メーター・測定" },
      { id: "other", title: "その他" }
    ];
    const used = new Set(base.map(item => item.id));
    const extra = (store.customGroups?.terms || []).filter(item => item && item.id && !used.has(item.id));
    return [...base, ...extra];
  }

  function termKindLabel(id) {
    return ((DTM.termKinds || []).find(item => item.id === id) || {}).label || "";
  }

  function termCatId(item) {
    if (!item) return "other";
    const known = new Set(termCategories().map(cat => cat.id));
    const overlayCat = store.overlays?.terms?.[item.id]?.termCategory;
    const extraCat = (store.extra?.terms || []).find(term => term.id === item.id)?.termCategory;
    let raw = extraCat || (known.has(overlayCat) ? overlayCat : "") || item.termCategory || "";
    if (known.has(raw)) return raw;
    const seedItem = seed("terms").find(term => term.id === item.id);
    if (seedItem && known.has(seedItem.termCategory)) return seedItem.termCategory;
    const legacy = { signal: "mic", effect: "mix", format: "digital", sample: "sampling", brand: "other", power: "power" };
    return legacy[raw] || "other";
  }

  function glossaryTerms() {
    return collection("terms").filter(item => !item.glossaryHidden && !item.sameAs);
  }

  function toHira(text) {
    return String(text || "")
      .replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .replace(/ヴ/g, "ゔ");
  }

  function toKata(text) {
    return String(text || "")
      .replace(/[\u3041-\u3096]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60))
      .replace(/ゔ/g, "ヴ");
  }

  function termNameParts(name) {
    return String(name || "").split(/\s*[／/]\s*/);
  }

  function stripTermParens(text) {
    return String(text || "").replace(/[（(][^）)]*[）)]/g, "").trim();
  }

  function termHasJapaneseAlt(name) {
    return termNameParts(name).some(part => {
      const core = stripTermParens(part);
      return (core.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g) || []).length >= 2;
    });
  }

  function termParenIsReading(name) {
    return [...String(name || "").matchAll(/[（(]([^）)]+)[）)]/g)].some(match => {
      const inner = match[1] || "";
      const kana = (inner.match(/[\u3040-\u30FFー]/g) || []).length;
      const kanji = (inner.match(/[\u4E00-\u9FFF]/g) || []).length;
      return kana >= 2 && kanji === 0;
    });
  }

  function termNeedsReading(item) {
    const name = String(item && item.name || "");
    if (!name || termHasJapaneseAlt(name) || termParenIsReading(name)) return false;
    const head = stripTermParens(termNameParts(name)[0] || "");
    if (!head || /[\u3040-\u30FF\u4E00-\u9FFF]/.test(head)) return false;
    if (!/[A-Za-z]/.test(head)) return false;
    if (/^[\d.]+\s*V(\s*[→~\-－—]\s*[\d.]+\s*V)?$/i.test(head)) return false;
    return true;
  }

  function termDisplayYomi(item) {
    if (!termNeedsReading(item)) return "";
    if (item.displayYomi) return String(item.displayYomi);
    const source = item.sortYomi || inferTermYomi(item);
    const kata = toKata(source).replace(/[／・\s　()（）?？]/g, "");
    if (!kata || /[A-Za-z]/.test(kata) || !/[\u30A0-\u30FFーヴ]/.test(kata)) return "";
    return kata;
  }

  function termNameHtml(item) {
    const yomi = termDisplayYomi(item);
    if (!yomi) return esc(item.name);
    return `${esc(item.name)} <span class="term-yomi">${esc(yomi)}</span>`;
  }

  function kanaReading(text) {
    const cleaned = String(text || "").replace(/[／・\s　()（）?？]/g, "");
    if (!cleaned) return "";
    return /^[\u3040-\u30FFーゔヴ]+$/.test(cleaned) ? toHira(cleaned) : "";
  }

  function inferTermYomi(item) {
    if (!item) return "";
    if (item.sortYomi) return item.sortYomi;
    const fromName = kanaReading(item.name);
    if (fromName) return fromName;
    const fromAlias = (item.aliases || []).map(kanaReading).find(Boolean);
    if (fromAlias) return fromAlias;
    const en = {
      kontakt: "こんたくと",
      splice: "すぷらいす",
      chop: "ちょっぷ",
      midi: "みでぃ",
      daw: "だう",
      eq: "いーきゅー",
      lfo: "えるえふおー",
      vst: "ぶいえすてぃー",
      vst3: "ぶいえすてぃーすりー",
      au: "えーゆー",
      asio: "あしお"
    };
    const nameKey = String(item.name || "").replace(/[／].*$/, "").trim().toLowerCase();
    return en[nameKey] || en[String(item.id || "").toLowerCase()] || String(item.name || "");
  }

  function normalizeTermYomi(text) {
    return toHira(text).replace(/[／・\s　()（）?？]/g, "").toLowerCase();
  }

  const termCollator = new Intl.Collator("ja", { sensitivity: "base", numeric: true });

  function compareTerms(a, b) {
    const byYomi = termCollator.compare(normalizeTermYomi(inferTermYomi(a)), normalizeTermYomi(inferTermYomi(b)));
    if (byYomi) return byYomi;
    return termCollator.compare(String(a.name || ""), String(b.name || ""));
  }

  function termsInCategory(catId) {
    return glossaryTerms().filter(item => termCatId(item) === catId).slice().sort(compareTerms);
  }

  function termHref(item) {
    if (!item) return "#/terms";
    if (item.sameAs && item.sameAs !== item.id && findItem("terms", item.sameAs)) return `#/terms/${item.sameAs}`;
    if (item.entityKind === "brand") {
      const brand = findItem("brands", item.id) || collection("brands").find(b => norm(b.name) === norm(item.name));
      if (brand) return `#/brands/${brand.id}`;
    }
    if (item.entityKind === "product" && item.relatedGear && item.relatedGear[0] && findItem("gear", item.relatedGear[0])) {
      return `#/gear/${item.relatedGear[0]}`;
    }
    return `#/terms/${item.id}`;
  }

  function termRedirect(item) {
    if (!item) return "";
    const href = termHref(item);
    return href && href !== `#/terms/${item.id}` ? href : "";
  }

  function moveTerm(id, toCat, beforeId) {
    const item = findItem("terms", id);
    if (!item || !toCat || id === beforeId) return;
    if (termCatId(item) !== toCat) patchItem("terms", id, { termCategory: toCat });
    store.termOrder = store.termOrder || {};
    Object.keys(store.termOrder).forEach(cat => {
      store.termOrder[cat] = (store.termOrder[cat] || []).filter(x => x !== id);
    });
    const list = termsInCategory(toCat).map(term => term.id).filter(tid => tid !== id);
    const idx = beforeId ? list.indexOf(beforeId) : -1;
    if (idx >= 0) list.splice(idx, 0, id);
    else list.push(id);
    store.termOrder[toCat] = list;
    saveStore();
    render();
  }

  function brandKeys(brand) {
    return [brand.id, brand.name, brand.nameJa, ...(brand.aliases || []), ...(brand.makerKeys || [])]
      .filter(Boolean)
      .map(norm);
  }

  function gearMatchesBrand(item, brand) {
    if (!item || !brand) return false;
    if (item.makerId && item.makerId === brand.id) return true;
    const keys = brandKeys(brand);
    const maker = norm(item.maker);
    const name = norm(item.name);
    return keys.some(key => key && (maker === key || maker.includes(key) || name.includes(key)));
  }

  function findBrandForItem(item) {
    if (!item) return null;
    if (item.makerId) return findItem("brands", item.makerId);
    return collection("brands").find(brand => gearMatchesBrand(item, brand)) || null;
  }

  function makerLabelHtml(item) {
    const text = item.maker || "";
    if (!text) return "";
    const brand = findBrandForItem(item);
    if (brand) return `<p class="section-label"><a href="#/brands/${esc(brand.id)}">${esc(text)}</a></p>`;
    return `<p class="section-label">${esc(text)}</p>`;
  }

  function instrumentCategoryTitle(id) {
    return ((DTM.instrumentCategories || []).find(item => item.id === id) || {}).title || "";
  }

  function isMidiGroove(item) {
    return !!(item && item.materialKind === "midi-groove");
  }

  function instrumentRowHtml(item) {
    const what = item.what || instrumentCategoryTitle(item.instrumentCategory) || "";
    const blurbRaw = item.listSummary || item.summary || "";
    return itemRow("software", item, `#/software/${item.id}`, {
      hub: true,
      hideEmptyThumb: true,
      showMaker: true,
      hideKind: true,
      usePrefix: false,
      use: what,
      blurb: clipListText(blurbRaw && blurbRaw !== what ? blurbRaw : "", 90)
    });
  }

  function hubFromRoute(parts) {
    const first = parts[0] || "";
    if (!first) return "";
    if (["env", "computers", "patch", "apple", "apps", "instruments"].includes(first)) return "env";
    if (first === "gear" && !parts[1]) return "env";
    if (first === "software" && !parts[1]) return "env";
    if (["dict", "terms", "brands"].includes(first)) return "dict";
    if (first === "howto") return "env";
    if (["buy", "purchase"].includes(first)) return "buy";
    if (first === "diy") return "diy";
    if ((first === "gear" || first === "software") && parts[1]) return lastHub || "env";
    if (first === "search") return lastHub || "";
    return lastHub || "";
  }

  function renderAppNav(parts) {
    const nav = $("appNav");
    const chrome = $("appChrome");
    if (!nav) return;
    const isHome = !parts.length;
    if (isHome) {
      nav.hidden = true;
      nav.innerHTML = "";
      if (chrome) chrome.classList.remove("is-compact");
      return;
    }
    const current = hubFromRoute(parts);
    if (current) lastHub = current;
    nav.hidden = false;
    nav.innerHTML = (DTM.homeCategories || []).map(cat =>
      `<a class="app-nav-item nav-${esc(cat.id)}${cat.id === current ? " is-on" : ""}" href="${esc(cat.hash)}">
        <span class="app-nav-icon" aria-hidden="true"><img src="./assets/icons/${esc(cat.id)}.svg?v=5" alt=""></span>
        <span class="app-nav-label">${esc(cat.title)}</span>
      </a>`
    ).join("");
  }

  function syncChromeCompact() {
    const chrome = $("appChrome");
    if (!chrome) return;
    chrome.classList.toggle("is-compact", window.scrollY > 24 && !$("appNav")?.hidden);
  }

  function groupTitle(kind, id) {
    const list = kind === "gear" ? gearGroups() : kind === "software" ? softwareKinds() : termCategories();
    return (list.find(item => item.id === id) || {}).title || id || "";
  }

  function categories() {
    return (DTM.homeCategories || DTM.categories || []).slice();
  }

  function openImageDb() {
    if (imageDb) return Promise.resolve(imageDb);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IMAGE_DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IMAGE_STORE)) {
          req.result.createObjectStore(IMAGE_STORE);
        }
      };
      req.onsuccess = () => {
        imageDb = req.result;
        resolve(imageDb);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function loadPhotos() {
    const db = await openImageDb();
    photoCache = await new Promise((resolve, reject) => {
      const out = {};
      const req = db.transaction(IMAGE_STORE, "readonly").objectStore(IMAGE_STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          out[cursor.key] = cursor.value;
          cursor.continue();
        } else resolve(out);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function putPhoto(key, dataUrl) {
    const db = await openImageDb();
    const tx = db.transaction(IMAGE_STORE, "readwrite");
    tx.objectStore(IMAGE_STORE).put(dataUrl, key);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    photoCache[key] = dataUrl;
  }

  async function deletePhoto(key) {
    try {
      const db = await openImageDb();
      const tx = db.transaction(IMAGE_STORE, "readwrite");
      tx.objectStore(IMAGE_STORE).delete(key);
      delete photoCache[key];
    } catch {
      delete photoCache[key];
    }
  }

  function cloneWithoutSecrets(value) {
    if (Array.isArray(value)) return value.map(cloneWithoutSecrets);
    if (value && typeof value === "object") {
      const out = {};
      Object.keys(value).forEach(key => {
        if (SECRET_KEY_RE.test(key)) return;
        out[key] = cloneWithoutSecrets(value[key]);
      });
      return out;
    }
    return value;
  }

  function backupDateStamp() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function setTransferStatus(text, isError) {
    const el = $("transferStatus");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("error", !!isError);
  }

  function openTransferDialog() {
    pendingBackupImport = null;
    setTransferStatus("");
    const dialog = $("transferDialog");
    if (dialog && !dialog.open) dialog.showModal();
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function photosForBackup() {
    const out = {};
    const entries = Object.entries(photoCache || {});
    for (const [key, value] of entries) {
      if (typeof value === "string") {
        if (value.startsWith("data:")) out[key] = value;
        continue;
      }
      if (typeof Blob !== "undefined" && value instanceof Blob) {
        const dataUrl = await blobToDataUrl(value);
        if (typeof dataUrl === "string" && dataUrl.startsWith("data:")) out[key] = dataUrl;
      }
    }
    return out;
  }

  function downloadBackupFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  }

  async function writeBackupFile(blob, filename) {
    let file = null;
    try {
      file = new File([blob], filename, { type: "application/json" });
    } catch {}
    const isTouch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (file && isTouch && navigator.canShare) {
      try {
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
          return "shared";
        }
      } catch (err) {
        if (err && err.name === "AbortError") return "cancelled";
      }
    }
    downloadBackupFile(blob, filename);
    return "downloaded";
  }

  async function exportBackup() {
    setTransferStatus("書き出しています…");
    try {
      saveStore();
      const payload = {
        app: BACKUP_APP,
        format: BACKUP_FORMAT,
        exportedAt: new Date().toISOString(),
        store: cloneWithoutSecrets(store),
        lastViewState: lastViewState ? cloneWithoutSecrets(lastViewState) : null,
        photos: await photosForBackup()
      };
      const json = JSON.stringify(payload);
      const filename = `${BACKUP_APP}_backup_${backupDateStamp()}.json`;
      const blob = new Blob([json], { type: "application/json" });
      const result = await writeBackupFile(blob, filename);
      if (result === "cancelled") {
        setTransferStatus("書き出しをキャンセルしました。");
        return;
      }
      if (result === "shared") {
        setTransferStatus("バックアップを共有シートに渡しました。ファイルアプリなどに保存してください。");
        return;
      }
      setTransferStatus(`「${filename}」を保存しました。保存先を聞かれたら、ファイルアプリやダウンロードフォルダを選んでください。`);
    } catch (err) {
      setTransferStatus("バックアップを書き出せませんでした。", true);
    }
  }

  function parseBackupText(text) {
    const raw = String(text || "").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    const appName = parsed.app || parsed.appId || "";
    if (appName && appName !== BACKUP_APP) throw new Error("app");
    if (!parsed.store || typeof parsed.store !== "object") throw new Error("store");
    const photos = {};
    if (parsed.photos && typeof parsed.photos === "object") {
      Object.keys(parsed.photos).forEach(key => {
        const value = parsed.photos[key];
        if (typeof value === "string" && value.startsWith("data:")) photos[key] = value;
      });
    }
    return {
      store: cloneWithoutSecrets(parsed.store),
      lastViewState: parsed.lastViewState && typeof parsed.lastViewState === "object"
        ? cloneWithoutSecrets(parsed.lastViewState)
        : null,
      photos
    };
  }

  async function onBackupFilePicked(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    setTransferStatus("ファイルを確認しています…");
    try {
      const text = await file.text();
      pendingBackupImport = parseBackupText(text);
      setTransferStatus("");
      const dialog = $("transferOverwriteDialog");
      if (dialog && !dialog.open) dialog.showModal();
    } catch {
      pendingBackupImport = null;
      setTransferStatus("このファイルは読み込めません。音楽制作アプリのバックアップファイルを選んでください。", true);
    }
  }

  async function replaceAllPhotos(photos) {
    const db = await openImageDb();
    const tx = db.transaction(IMAGE_STORE, "readwrite");
    const os = tx.objectStore(IMAGE_STORE);
    os.clear();
    Object.entries(photos || {}).forEach(([key, value]) => {
      os.put(value, key);
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    photoCache = Object.assign({}, photos || {});
  }

  async function applyBackupImport(event) {
    event.preventDefault();
    const payload = pendingBackupImport;
    if (!payload) return;
    try {
      const nextStore = normalizeStore(payload.store);
      purgeDummyRecords(nextStore);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextStore));
      if (payload.lastViewState) {
        try { localStorage.setItem(LAST_VIEW_KEY, JSON.stringify(payload.lastViewState)); } catch {}
      }
      try {
        await replaceAllPhotos(payload.photos || {});
      } catch {}
      pendingBackupImport = null;
      const overwrite = $("transferOverwriteDialog");
      if (overwrite) overwrite.close();
      const transfer = $("transferDialog");
      if (transfer) transfer.close();
      location.reload();
    } catch {
      setTransferStatus("読み込みに失敗しました。容量不足のときは写真の少ないバックアップを試してください。", true);
    }
  }

  function statusBadge(status, opts) {
    if (opts && opts.hideOwned && (status === "owned" || status === "builtin")) return "";
    if (opts && opts.hideNotOwned && status === "not-owned") return "";
    const label = (DTM.statusLabels || {})[status] || status || "";
    if (!label) return "";
    return `<span class="badge ${esc(status)}">${esc(label)}</span>`;
  }

  function assetRoot() {
    try {
      const path = String(location.pathname || "/").replace(/index\.html$/i, "");
      if (path.endsWith("/")) return path;
      const slash = path.lastIndexOf("/");
      return slash >= 0 ? path.slice(0, slash + 1) : "/";
    } catch {
      return "./";
    }
  }

  function resolveAsset(path) {
    if (!path) return "";
    if (/^(https?:\/\/|data:|blob:)/i.test(path)) return path;
    const rel = String(path).replace(/^\.\//, "");
    if (rel.startsWith("/")) return rel;
    return (DTM.imageBase || assetRoot()) + rel;
  }

  function keepImageFields(from, payload) {
    if (!from) return payload;
    ["logo", "logoSourceUrl", "logoOfficial", "logoStatus", "logoMissingReason", "image", "imageSourceUrl", "imageOfficial", "imageKind", "imageStatus", "imageMissingReason"].forEach(key => {
      if (from[key] != null && from[key] !== "") payload[key] = from[key];
    });
    if (Array.isArray(from.images) && from.images.length) payload.images = from.images;
    return payload;
  }

  function keepPriceFields(from, payload) {
    if (!from) return payload;
    ["approxPrice", "priceType", "priceCheckedAt", "priceSource", "priceSourceUrl", "priceLabel", "purchasePrice", "purchaseDate"].forEach(key => {
      if (from[key] != null && from[key] !== "") payload[key] = from[key];
    });
    return payload;
  }

  function keepLinkFields(from, payload) {
    if (!from) return payload;
    const edited = Object.prototype.hasOwnProperty.call(payload, "officialUrl");
    if (edited && String(payload.officialUrl || "") !== String(from.officialUrl || "")) {
      if (Array.isArray(from.sources) && from.sources.length) {
        payload.sources = from.sources.map(row => {
          if (row.url === from.officialUrl) return { label: row.label, url: payload.officialUrl };
          return row;
        });
      }
      return payload;
    }
    ["officialUrl", "officialUrlStatus", "officialUrlCheckedAt", "previousOfficialUrl"].forEach(key => {
      if (payload[key] == null && from[key] != null && from[key] !== "") payload[key] = from[key];
    });
    return payload;
  }

  function usefulText(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t || /^(未確認[。．]?|なし|無し)$/.test(t)) return "";
    return String(text).trim();
  }

  function priceLine(item) {
    if (!item) return "";
    if (item.priceLabel) return item.priceLabel;
    const type = item.priceType || "";
    if (type === "model-unconfirmed") return "型番確認後に価格登録";
    if (type === "unannounced") return "価格未発表";
    if (type === "unconfirmed") return "国内価格要確認";
    if (type === "used" && item.approxPrice) return `中古相場：${item.approxPrice}`;
    if (type === "discontinued" && !item.approxPrice) return "生産完了・価格要確認";
    const bits = [];
    if (item.purchasePrice) bits.push(`購入価格：${item.purchasePrice}`);
    if (item.approxPrice) bits.push(`参考価格：${item.approxPrice}`);
    return bits.join("　");
  }

  function purchaseRecordHtml(item) {
    const bits = [];
    if (item.purchaseDate) bits.push(`購入日：${esc(item.purchaseDate)}`);
    if (item.purchasePrice) bits.push(`購入価格：${esc(item.purchasePrice)}`);
    if (!bits.length) return "";
    return `<p class="purchase-record">${bits.join("　")}</p>`;
  }

  function extraImagesHtml(item) {
    const extras = (item && item.images || []).filter(img => img && img.src);
    if (!extras.length) return "";
    return `<div class="detail-gallery">${extras.map(img => `
      <figure class="detail-gallery-item">
        <img alt="${esc(img.caption || "")}" src="${esc(resolveAsset(img.src))}" />
        ${img.caption ? `<figcaption>${esc(img.caption)}</figcaption>` : ""}
      </figure>`).join("")}</div>`;
  }

  function itemVisual(type, item) {
    if (!item) return null;
    const user = photoCache[`${type}:${item.id}`];
    if (user) return { src: user, kind: "photo" };
    if (type === "brands" && item.logo) return { src: resolveAsset(item.logo), kind: "logo" };
    const blocked = item.imageStatus === "failed" || item.imageStatus === "missing";
    if (item.image && !blocked) return { src: resolveAsset(item.image), kind: item.imageKind || "photo" };
    return null;
  }

  function thumbHtml(type, item, className) {
    const vis = itemVisual(type, item);
    if (vis) {
      const kindClass = vis.kind === "logo" ? " is-logo" : vis.kind === "photo" || vis.kind === "screenshot" ? " is-product" : "";
      return `<div class="${className}${kindClass}"><img alt="" src="${esc(vis.src)}" /></div>`;
    }
    const icon = resolveAsset("assets/icons/image-placeholder.svg") + "?v=2";
    return `<div class="${className} is-empty"><span class="thumb-fallback" aria-hidden="true"><img alt="" src="${esc(icon)}" /></span></div>`;
  }

  function menuHtml(type, id) {
    const simple = type === "diy";
    const item = ["gear", "software", "computers"].includes(type) ? findItem(type, id) : null;
    const photoBtn = (simple || type === "connections" || type === "videos" || type === "workflows" || type === "terms")
      ? ""
      : `<button type="button" data-act="photo" data-type="${esc(type)}" data-id="${esc(id)}">写真を変更</button>`;
    const renameBtn = simple
      ? ""
      : `<button type="button" data-act="rename" data-type="${esc(type)}" data-id="${esc(id)}">名前を変更</button>`;
    const markOwnedBtn = item && isPurchaseItem(item)
      ? `<button type="button" data-act="mark-owned" data-type="${esc(type)}" data-id="${esc(id)}">購入済みにする</button>`
      : "";
    const markConsideringBtn = item && isOwnedItem(item) && item.status !== "builtin"
      ? `<button type="button" data-act="mark-considering" data-type="${esc(type)}" data-id="${esc(id)}">購入検討に戻す</button>`
      : "";
    return `
      <button type="button" class="card-menu-btn" data-menu-btn="${esc(type)}:${esc(id)}" aria-label="メニュー">…</button>
      <div class="card-menu" data-menu="${esc(type)}:${esc(id)}">
        ${renameBtn}
        ${photoBtn}
        ${markOwnedBtn}
        ${markConsideringBtn}
        <button type="button" data-act="edit" data-type="${esc(type)}" data-id="${esc(id)}">編集</button>
        <button type="button" class="danger" data-act="delete" data-type="${esc(type)}" data-id="${esc(id)}">削除</button>
      </div>`;
  }

  function closeMenus() {
    document.querySelectorAll(".card-menu.open").forEach(el => el.classList.remove("open"));
    document.querySelectorAll(".menu-open").forEach(el => el.classList.remove("menu-open"));
  }

  function itemCard(type, item, href, opts) {
    const low = item.dtmPriority === "low" ? " is-low" : "";
    const compact = opts && opts.compact ? " compact" : "";
    const model = item.needsModelCheck ? `<span class="badge warn">型番確認</span>` : "";
    return `
      <article class="item-card${low}${compact}" data-href="${esc(href)}"${item && item.id ? ` data-item-id="${esc(item.id)}"` : ""}>
        ${menuHtml(type, item.id)}
        ${thumbHtml(type, item, "thumb")}
        <h3>${esc(item.name)}</h3>
        <div class="card-meta">
          <span class="badge">${esc(item.categoryLabel || item.kindLabel || item.kind || item.owner || item.country || "")}</span>
          ${statusBadge(item.status, opts)}
          ${model}
        </div>
      </article>`;
  }

  function statusTone(status) {
    if (status === "making") return "planned";
    if (status === "planned" || status === "considering" || status === "wishlist") return "considering";
    if (status === "unknown" || status === "not-owned") return "unknown";
    return "owned";
  }

  function listUseLabel(item) {
    if (item && item.kind === "instrument") {
      const cat = (DTM.instrumentCategories || []).find(row => row.id === item.instrumentCategory);
      return (cat && cat.title) || item.instrumentCategory || item.what || item.purpose || item.nameJa || "";
    }
    return item.useLabel || item.purpose || item.nameJa || "";
  }

  function listKindLabel(item) {
    if (item.categoryLabel) return item.categoryLabel;
    if (item.kindLabel) return item.kindLabel;
    const kinds = {
      "windows-pc": "パソコン",
      apple: "Apple製品",
      phone: "スマートフォン",
      daw: "DAW",
      suite: "プラグインスイート",
      plugin: "プラグイン",
      instrument: "ソフト音源",
      video: "映像"
    };
    if (item.kind && kinds[item.kind]) return kinds[item.kind];
    if (item.kind) {
      const diyKind = (DTM.diyKinds || []).find(row => row.id === item.kind);
      if (diyKind) return diyKind.title;
      return item.kind;
    }
    const spec = (item.specialties || []).slice(0, 4).join("／");
    return [item.country, spec].filter(Boolean).join("　");
  }

  function clipListText(raw, max) {
    const text = String(raw || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    const limit = max || 90;
    if (text.length <= limit) return text;
    const cut = text.slice(0, limit);
    const mark = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("、"));
    if (mark >= 22) return text.slice(0, mark + 1);
    return cut.replace(/[、。…]*$/, "") + "…";
  }

  function listBlurb(item) {
    const use = listUseLabel(item);
    const raw = item.listSummary || item.summary || item.what || item.soundImage ||
      [item.owner, item.os, item.osVersion].filter(Boolean).join("　");
    if (!raw || raw === use) return "";
    return clipListText(raw);
  }

  function catSection(cat, title, inner) {
    if (!inner) return "";
    return `<section class="cat-block cat-${esc(cat)}">
      ${title ? `<h3 class="group-title">${esc(title)}</h3>` : ""}
      ${inner}
    </section>`;
  }

  function itemRow(type, item, href, opts) {
    const use = opts && Object.prototype.hasOwnProperty.call(opts, "use") ? opts.use : listUseLabel(item);
    const kind = opts && opts.hideKind ? "" : listKindLabel(item);
    const blurb = (opts && opts.blurb) || listBlurb(item);
    const model = item.needsModelCheck ? `<span class="badge warn">型番確認</span>` : "";
    const usePrefix = opts && opts.usePrefix === false ? "" : "用途：";
    const extra = opts && opts.childNote ? opts.childNote(item) : "";
    const addBlurb = opts && opts.addBlurb && !blurb;
    const purchase = opts && opts.purchase;
    const hub = opts && opts.hub;
    const purchaseCat = opts && opts.purchaseCat;
    const hideThumb = type === "terms" || type === "diy" || (opts && opts.hideThumb);
    const hasThumb = !hideThumb;
    const status = purchase
      ? statusBadge(item.status, { hideNotOwned: true })
      : (opts && opts.hideOwned ? statusBadge(item.status, opts) : "");
    const kindBadge = opts && opts.kindBadge ? `<span class="badge kind-${esc(opts.kindClass || "product")}">${esc(opts.kindBadge)}</span>` : "";
    const videoCount = opts && opts.showVideo ? videosFor(type, item.id).length : 0;
    const videoNote = videoCount === 1 ? "▶ 使い方動画" : videoCount > 1 ? `▶ 動画${videoCount}本` : "";
    const drag = purchase && type === "gear"
      ? ` draggable="true" data-purchase-id="${esc(item.id)}" data-purchase-cat="${esc(purchaseCat || "")}"`
      : "";
    const termDragAttr = opts && opts.termSort
      ? ` draggable="true" data-term-id="${esc(item.id)}" data-term-cat="${esc(opts.termCat || "")}"`
      : "";
    const hrefAttr = href ? ` data-href="${esc(href)}"` : "";
    const idAttr = item && item.id ? ` data-item-id="${esc(item.id)}"` : "";
    return `
      <article class="item-row${purchase || hub ? " hub-row" : ""}${purchase ? " purchase-row" : ""}${hasThumb ? "" : " no-thumb"} tone-${statusTone(item.status || "owned")}"${drag}${termDragAttr}${hrefAttr}${idAttr}>
        ${menuHtml(type, item.id)}
        ${hasThumb ? thumbHtml(type, item, "row-thumb") : ""}
        <div class="row-body">
          <h3>${type === "terms" ? termNameHtml(item) : esc(item.name)}</h3>
          ${opts && opts.showMaker && item.maker ? `<p class="row-use">${esc(item.maker)}</p>` : ""}
          ${use ? `<p class="row-use">${usePrefix}${esc(use)}</p>` : ""}
          ${blurb ? `<p class="row-summary">${esc(blurb)}</p>` : ""}
          ${kind || model || status || kindBadge ? `<p class="row-kind">${kindBadge}${esc(kind)}${model}${status}</p>` : ""}
          ${opts && opts.catLabel ? `<p class="row-cat"><span class="term-cat-tag">${esc(opts.catLabel)}</span></p>` : ""}
          ${purchase && priceLine(item) ? `<p class="row-price">${esc(priceLine(item))}</p>` : ""}
          ${extra ? `<p class="row-children">${esc(extra)}</p>` : ""}
          ${videoNote ? `<p class="row-video">${esc(videoNote)}</p>` : ""}
          ${addBlurb ? `<button type="button" class="row-blurb-btn" data-act="add-blurb" data-type="${esc(type)}" data-id="${esc(item.id)}">説明を追加</button>` : ""}
        </div>
      </article>`;
  }

  function groupedRows(groups, type, hrefFn, opts) {
    return groups.map(group => {
      if (!group.items.length && !(opts && opts.keepEmpty)) return "";
      const cat = group.cat || "other";
      const inner = group.items.length
        ? `<div class="item-list">${group.items.map(item => itemRow(type, item, hrefFn(item), opts)).join("")}</div>`
        : `<p class="muted">まだありません。</p>`;
      return catSection(cat, group.title, inner);
    }).join("");
  }

  function statusLegend() {
    return `<div class="status-legend" aria-label="状態の色">
      <span class="status-chip tone-owned">今あるもの</span>
      <span class="status-chip tone-considering">購入検討</span>
      <span class="status-chip tone-unknown">未確認</span>
    </div>`;
  }

  function pageHead(title, note, actions) {
    return `
      <div class="page-head">
        <div>
          <h2>${esc(title)}</h2>
          ${note ? `<p>${esc(note)}</p>` : ""}
        </div>
        <div class="row-actions">${actions || ""}</div>
      </div>`;
  }

  function groupedCards(groups, type, hrefFn, opts) {
    return groups.map(group => {
      if (!group.items.length) return "";
      return `<h3 class="group-title">${esc(group.title)}</h3>
        <div class="card-grid${opts && opts.compact ? " compact-grid" : ""}">${group.items.map(item => itemCard(type, item, hrefFn(item), opts)).join("")}</div>`;
    }).join("");
  }

  function homeCatTitle(title) {
    if (title === "我が家のDTM環境") return "我が家の<span class=\"nowrap\">DTM環境</span>";
    if (title === "パソコン・Apple製品") return "パソコン・<span class=\"nowrap\">Apple製品</span>";
    if (title === "メーカー・ブランド") return "<span class=\"nowrap\">メーカー・ブランド</span>";
    if (title === "手作り機材・楽器・ソフト") return "手作り機材・<span class=\"nowrap\">楽器・ソフト</span>";
    return esc(title);
  }

  function scratchNotesSeed() {
    return [
      "4K　何の意味だったか確認。映像の4K解像度なのか、音響製品・機能名など別の意味なのか、まだ分かっていない。",
      "MSX　音楽関連で聞いた言葉。何を指すのかまだ確認できていない。",
      "エイガット？　YouTubeなどで聞いた可能性がある言葉。何を指すのかまだ確認できていない。"
    ].join("\n");
  }

  function scratchNotesValue() {
    if (typeof store.scratchNotes === "string") return store.scratchNotes;
    store.scratchNotes = scratchNotesSeed();
    saveStore();
    return store.scratchNotes;
  }

  function persistScratchNotes(text) {
    store.scratchNotes = String(text ?? "");
    saveStore();
  }

  function renderHome() {
    return `
      <form class="search-hero" id="homeSearchForm">
        <label class="sr-only" for="homeSearchInput">検索</label>
        <input id="homeSearchInput" type="search" placeholder="機材・ソフト・DTM用語を検索" autocomplete="off" />
      </form>
      <div class="category-grid">
        ${categories().map(cat => `
          <a class="category-card cat-home-${esc(cat.id)}" href="${esc(cat.hash)}">
            <span class="home-icon-wrap" aria-hidden="true">
              <img src="./assets/icons/${esc(cat.id)}.svg?v=5" alt="" />
            </span>
            <span class="home-card-text">
              <strong>${homeCatTitle(cat.title)}</strong>
              ${cat.blurb ? `<span class="home-card-blurb">${esc(cat.blurb)}</span>` : ""}
            </span>
          </a>
        `).join("")}
      </div>
      <section class="scratch-notes">
        <h2>気になる・覚書</h2>
        <label class="sr-only" for="scratchNotes">気になる・覚書</label>
        <textarea id="scratchNotes" rows="5" placeholder="あとで調べたいこと、思いつき、企画案などを自由に書いてください">${esc(scratchNotesValue())}</textarea>
      </section>`;
  }

  function hubTabs(base, tabs, current, extra) {
    const q = extra ? `&${extra}` : "";
    return `<nav class="sub-tabs" aria-label="表示の切り替え">${tabs.map(tab =>
      `<a class="sub-tab${tab.id === current ? " is-on" : ""}" href="#/${esc(base)}?tab=${esc(tab.id)}${q}">${esc(tab.title)}</a>`
    ).join("")}</nav>`;
  }

  function ownedGear() {
    return collection("gear").filter(isOwnedItem);
  }

  function isOwnedItem(item) {
    return item && (item.status === "owned" || item.status === "builtin");
  }

  function productHref(type, item) {
    if (type === "computers") return `#/computers/${item.id}`;
    if (type === "software") return `#/software/${item.id}`;
    return `#/gear/${item.id}`;
  }

  const productCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

  function productMakerName(item) {
    if (!item) return "";
    const brand = item.makerId ? findItem("brands", item.makerId) : null;
    return String((brand && brand.name) || item.maker || "").trim();
  }

  function compareProductsByMaker(a, b) {
    const makerA = productMakerName(a);
    const makerB = productMakerName(b);
    if (!makerA && makerB) return 1;
    if (makerA && !makerB) return -1;
    const maker = productCollator.compare(makerA, makerB);
    if (maker) return maker;
    return productCollator.compare(String(a && a.name || ""), String(b && b.name || ""));
  }

  function sortProductsByMaker(items) {
    return items.slice().sort(compareProductsByMaker);
  }

  function productRowsWithMakerLabels(type, items, opts) {
    const showMaker = type === "gear" || type === "software";
    let last = null;
    return items.map(item => {
      const maker = productMakerName(item) || "メーカー未登録";
      const isNew = showMaker && (last === null || productCollator.compare(maker, last) !== 0);
      const head = isNew ? `<p class="maker-split">${esc(maker)}</p>` : "";
      last = maker;
      return head + itemRow(type, item, productHref(type, item), opts);
    }).join("");
  }

  function computerKindGroups(items) {
    return [
      { title: "パソコン", cat: "comp-pc", type: "computers", items: items.filter(item => item.kind === "windows-pc") },
      { title: "Apple製品", cat: "comp-apple", type: "computers", items: items.filter(item => item.kind === "apple") },
      { title: "スマートフォン", cat: "comp-phone", type: "computers", items: items.filter(item => item.kind === "phone") }
    ];
  }

  function gearKindGroups(items) {
    const groups = gearGroups().map(group => ({
      title: group.title,
      cat: `gear-${group.id}`,
      type: "gear",
      items: sortProductsByMaker(items.filter(item => item.group === group.id))
    }));
    const used = new Set(groups.flatMap(group => group.items.map(item => item.id)));
    const leftover = sortProductsByMaker(items.filter(item => !used.has(item.id)));
    if (leftover.length) groups.push({ title: "その他", cat: "gear-other", type: "gear", items: leftover });
    return groups;
  }

  function renderProductGroups(groups, opts) {
    return groups.map(group => {
      if (!group.items.length && !(opts && opts.keepEmpty)) return "";
      const inner = group.items.length
        ? `<div class="item-list">${productRowsWithMakerLabels(group.type, group.items, opts)}</div>`
        : `<p class="muted">まだありません。</p>`;
      return catSection(group.cat, group.title, inner);
    }).join("");
  }

  function gearListBody(opts) {
    return renderProductGroups(gearKindGroups(collection("gear").filter(isOwnedItem)), Object.assign({}, opts || {}));
  }

  function ownedComputers() {
    return collection("computers").filter(isOwnedItem);
  }

  function envOwnedListBody(opts) {
    const rowOpts = Object.assign({ hub: true }, opts || {});
    return renderProductGroups(
      computerKindGroups(ownedComputers()).concat(gearKindGroups(collection("gear").filter(isOwnedItem))),
      rowOpts
    );
  }

  function renderGearList() {
    return pageHead("持っている機材", "", addBtn("gear") + `<a class="ghost-btn add-btn" href="#/env?tab=patch">接続図</a>`) +
      gearListBody();
  }

  function renderHowtoList() {
    const featured = findItem("gear", "akai-mpc-studio");
    const rest = ownedGear().filter(item => item.id !== "akai-mpc-studio");
    const href = item => `#/howto/${item.id}`;
    const rowOpts = { hideOwned: true, hub: true, showVideo: true, usePrefix: false };
    return pageHead("使い方・動画", "", addBtn("gear")) +
      (featured ? catSection("howto-first", "まず見る", `<div class="item-list">${itemRow("gear", featured, href(featured), rowOpts)}</div>`) : "") +
      catSection("howto-gear", "機材", rest.length ? `<div class="item-list">${rest.map(item => itemRow("gear", item, href(item), rowOpts)).join("")}</div>` : `<p class="muted">まだありません。</p>`) +
      howtoVideosHtml();
  }

  function isPurchaseItem(item) {
    return item.status === "considering" || item.status === "planned" || item.status === "not-owned";
  }

  function todayInputDate() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function placementKnown(type, item) {
    if (!item) return false;
    if (type === "gear") return !!(item.group && gearGroups().some(g => g.id === item.group));
    if (type === "computers") return !!item.kind;
    if (type === "software") return !!item.kind;
    return true;
  }

  function fillMarkOwnedCategories(type, item) {
    const select = $("markOwnedGroup");
    const wrap = $("markOwnedCatWrap");
    if (!select || !wrap) return;
    const known = placementKnown(type, item);
    wrap.hidden = known;
    if (known) {
      select.innerHTML = "";
      return;
    }
    const groups = type === "computers"
      ? [
          { id: "windows-pc", title: "パソコン" },
          { id: "apple", title: "Apple" },
          { id: "phone", title: "スマートフォン" }
        ]
      : type === "software"
        ? softwareKinds()
        : gearGroups();
    const current = type === "computers" || type === "software" ? item.kind : item.group;
    select.innerHTML = groups.map(g =>
      `<option value="${esc(g.id)}" ${g.id === current ? "selected" : ""}>${esc(g.title)}</option>`
    ).join("");
  }

  function openMarkOwned(type, id) {
    const item = findItem(type, id);
    if (!item || !isPurchaseItem(item)) return;
    markOwnedTarget = { type, id };
    $("markOwnedName").textContent = item.name || "";
    $("markOwnedDate").value = todayInputDate();
    $("markOwnedPrice").value = item.purchasePrice || "";
    fillMarkOwnedCategories(type, item);
    $("markOwnedDialog").showModal();
  }

  function applyMarkOwned(event) {
    event.preventDefault();
    if (!markOwnedTarget) return;
    const { type, id } = markOwnedTarget;
    const item = findItem(type, id);
    if (!item) return;
    const patch = { status: "owned" };
    const date = val("markOwnedDate");
    const price = val("markOwnedPrice");
    if (date) patch.purchaseDate = date;
    if (price) patch.purchasePrice = price;
    if (!placementKnown(type, item)) {
      const chosen = val("markOwnedGroup");
      if (type === "gear" && chosen) {
        patch.group = chosen;
        patch.categoryLabel = groupTitle("gear", chosen) || item.categoryLabel;
      } else if ((type === "computers" || type === "software") && chosen) {
        patch.kind = chosen;
        if (type === "software") patch.kindLabel = groupTitle("software", chosen) || item.kindLabel;
      }
    }
    if (/現在所有登録なし/.test(String(item.homeUse || ""))) {
      patch.homeUse = "所有中。";
    }
    patchItem(type, id, patch);
    markOwnedTarget = null;
    $("markOwnedDialog").close();
    render();
  }

  function markConsidering(type, id) {
    const item = findItem(type, id);
    if (!item || !isOwnedItem(item) || item.status === "builtin") return;
    if (!confirm("この製品を購入検討に戻しますか？")) return;
    patchItem(type, id, { status: "considering" });
    render();
  }

  function purchaseBody() {
    const gearRows = collection("gear")
      .filter(isPurchaseItem)
      .map(item => ({ type: "gear", item, href: `#/gear/${item.id}` }));
    const softRows = collection("software")
      .filter(isPurchaseItem)
      .map(item => ({ type: "software", item, href: `#/software/${item.id}` }));
    const pcRows = collection("computers")
      .filter(isPurchaseItem)
      .map(item => ({ type: "computers", item, href: `#/computers/${item.id}` }));
    const hasAny = gearRows.length + softRows.length + pcRows.length;
    const gearBlocks = purchaseGearCats().map(cat => {
      const items = itemsInPurchaseCat(cat.id, gearRows);
      if (!items.length) {
        return `<section class="cat-block cat-buy-${esc(cat.id)}" hidden data-purchase-empty-cat="${esc(cat.id)}">
          <h3 class="group-title">${esc(cat.title)}</h3>
          <div class="item-list" data-purchase-drop="${esc(cat.id)}"><p class="muted term-drop-empty">ここにドロップできます。</p></div>
        </section>`;
      }
      return catSection(
        `buy-${cat.id}`,
        cat.title,
        `<div class="item-list" data-purchase-drop="${esc(cat.id)}">${productRowsWithMakerLabels("gear", items.map(row => row.item), { addBlurb: true, purchase: true, purchaseCat: cat.id, hub: true })}</div>`
      );
    }).join("");
    const extraBlocks = [
      { title: "ソフト", cat: "buy-soft", type: "software", items: sortProductsByMaker(softRows.map(row => row.item)) },
      { title: "パソコン・端末", cat: "buy-pc", type: "computers", items: sortProductsByMaker(pcRows.map(row => row.item)) }
    ].map(group => {
      if (!group.items.length) return "";
      return catSection(group.cat, group.title, `<div class="item-list">${productRowsWithMakerLabels(group.type, group.items, { addBlurb: true, purchase: true, hub: true })}</div>`);
    }).join("");
    return `<p class="muted term-sort-hint">同じ種類の機材をまとめています。カードをドラッグすると、別の種類へ移せます。</p>` +
      (hasAny ? gearBlocks + extraBlocks : `<p class="empty">いま購入検討の登録はありません。</p>`);
  }

  function renderPurchase() {
    return pageHead("購入検討", "", addBtn("purchase")) +
      purchaseBody();
  }

  function setPurchaseEmptyCatsVisible(on) {
    document.querySelectorAll("[data-purchase-empty-cat]").forEach(el => {
      el.hidden = !on;
    });
  }

  function diyKindTitle(id) {
    return ((DTM.diyKinds || []).find(item => item.id === id) || {}).title || "";
  }

  function diyStatusTitle(id) {
    return ((DTM.diyStatuses || []).find(item => item.id === id) || {}).title || "";
  }

  function diyPowerTitle(id) {
    return ((DTM.diyPower || []).find(item => item.id === id) || {}).title || "";
  }

  function diyLevelTitle(id) {
    return ((DTM.diyLevels || []).find(item => item.id === id) || {}).title || "";
  }

  function diyKindForTerm(termId) {
    return (DTM.diyKinds || []).find(item => item.termId === termId) || null;
  }

  function diyHref(opts) {
    const params = new URLSearchParams();
    if (opts && opts.kind) params.set("kind", opts.kind);
    if (opts && opts.power === "all") params.set("power", "all");
    const query = params.toString();
    return query ? `#/diy?${query}` : "#/diy";
  }

  function diyTermLink(term) {
    const kind = diyKindForTerm(term && term.id);
    if (!kind) return "";
    return `<section class="block">
      <h3>手作りする</h3>
      <p class="muted">市販品ではなく、自分で作る例を見ます。</p>
      <div class="link-list"><a class="chip" href="#/diy">手作り・自作を見る</a></div>
    </section>`;
  }

  function diyAddForm() {
    return `<form id="diyIdeaForm" class="idea-add">
      <label>
        <span>アイデア名</span>
        <input id="diyIdeaName" maxlength="80" placeholder="例：足で操作するDTMコントローラー" autocomplete="off" />
      </label>
      <label>
        <span>ひとことメモ</span>
        <textarea id="diyIdeaMemo" rows="2" placeholder="任意。名前だけでも保存できます"></textarea>
      </label>
      <p id="diyIdeaError" class="error" aria-live="polite"></p>
      <div class="idea-add-actions">
        <button type="submit" class="primary-btn">追加</button>
      </div>
    </form>`;
  }

  function addDiyIdea() {
    const nameEl = $("diyIdeaName");
    const memoEl = $("diyIdeaMemo");
    const errorEl = $("diyIdeaError");
    const name = nameEl ? nameEl.value.trim() : "";
    const memo = memoEl ? memoEl.value.trim() : "";
    if (!name) {
      if (errorEl) errorEl.textContent = "アイデア名を入力してください。";
      return;
    }
    addItem("diy", { id: slugName(), name, memo, listSummary: memo, what: memo });
    render();
  }

  function diyMemoText(item) {
    return clipListText(item.memo || item.listSummary || item.what || "", 90);
  }

  function renderDiy() {
    const items = collection("diy");
    const rows = items.length
      ? `<div class="item-list">${items.map(item => itemRow("diy", item, "", {
        hub: true,
        hideKind: true,
        use: "",
        blurb: diyMemoText(item)
      })).join("")}</div>`
      : `<p class="muted">まだアイデアはありません。</p>`;
    return pageHead("手作り・自作", "") +
      diyAddForm() +
      catSection("diy-ideas", "", rows);
  }

  function renderDiyDetail(id) {
    const item = findItem("diy", id);
    if (!item) return `<p class="empty">見つかりませんでした。</p>`;
    return `
      <article class="detail">
        <section class="detail-hero">
          <div>
            ${menuHtml("diy", item.id)}
            <h2>${esc(item.name)}</h2>
          </div>
        </section>
        ${item.memo || item.what ? section("ひとことメモ", item.memo || item.what) : ""}
      </article>`;
  }

  function computersListBody(opts) {
    const all = ownedComputers().slice().sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return (rank[a.dtmPriority] ?? 9) - (rank[b.dtmPriority] ?? 9);
    });
    const groups = [
      { title: "パソコン", cat: "comp-pc", items: all.filter(item => item.kind === "windows-pc") },
      { title: "Apple製品", cat: "comp-apple", items: all.filter(item => item.kind === "apple") },
      { title: "スマートフォン", cat: "comp-phone", items: all.filter(item => item.kind === "phone") }
    ];
    return groupedRows(groups, "computers", item => `#/computers/${item.id}`, opts);
  }

  function renderComputers() {
    location.hash = "#/env?tab=gear";
    return "";
  }

  function renderSoftware() {
    const all = collection("software");
    const roots = all.filter(item => !item.parentId);
    const childrenOf = (id) => all.filter(item => item.parentId === id);
    const groups = [
      { title: "DAW", cat: "soft-daw", items: roots.filter(item => item.kind === "daw") },
      { title: "スイート・プラグイン", cat: "soft-suite", items: roots.filter(item => item.kind === "suite" || item.kind === "plugin") },
      { title: "ソフト音源", cat: "soft-instrument", items: roots.filter(item => item.kind === "instrument") },
      { title: "映像", cat: "soft-video", items: roots.filter(item => item.kind === "video") }
    ];
    softwareKinds().filter(kind => !["daw", "suite", "plugin", "instrument", "video"].includes(kind.id)).forEach(kind => {
      const items = roots.filter(item => item.kind === kind.id);
      if (items.length) groups.push({ title: kind.title, cat: "soft-other", items });
    });
    const extra = roots.filter(item => !groups.some(group => group.items.includes(item)));
    if (extra.length) groups.push({ title: "その他", cat: "soft-other", items: extra });
    return pageHead("DAW・ソフト", "", addBtn("software")) +
      groupedRows(groups, "software", item => `#/software/${item.id}`, {
        childNote: item => childrenOf(item.id).map(child => child.name).join(" / ")
      });
  }

  function renderInstruments() {
    const allInst = collection("software").filter(item => item.kind === "instrument");
    const items = allInst.filter(item => !isMidiGroove(item));
    const grooves = allInst.filter(isMidiGroove);
    const terms = collection("terms").filter(item => item.diagram === "sample");
    const soundRows = items.length
      ? catSection("inst-sounds", "登録されている音源",
        `<div class="item-list">${items.map(instrumentRowHtml).join("")}</div>`)
      : "";
    const grooveRows = grooves.length
      ? catSection("inst-grooves", "関連するMIDIフレーズ／グルーヴ",
        `<div class="item-list">${grooves.map(instrumentRowHtml).join("")}</div>`)
      : "";
    return pageHead("ソフト音源", "", addBtn("instrument")) +
      renderDiagram("sample") +
      soundRows +
      grooveRows +
      catSection("inst-terms", "関連する用語",
        `<div class="card-grid term-grid">${terms.map(termCard).join("")}</div>`);
  }

  function termListText(item) {
    const raw = item.listSummary || item.summary || item.description || item.doesWhat || item.detail || "";
    const text = String(raw).replace(/\s+/g, " ").trim();
    if (!text) return "名前だけ登録。説明はこれから。";
    if (text.length <= 90) return text;
    const cut = text.slice(0, 90);
    const mark = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("、"));
    if (mark >= 22) return text.slice(0, mark + 1);
    return cut.replace(/[、。…]*$/, "") + "…";
  }

  function termDescription(item) {
    if (!item) return "";
    const dedicated = String(item.description || "").trim();
    if (dedicated) return dedicated;
    const parts = [item.summary, item.doesWhat || item.detail, item.whereUsed]
      .map(text => String(text || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const uniq = [];
    parts.forEach(part => {
      const core = part.replace(/[。．.]+$/, "");
      if (!core) return;
      if (uniq.some(existing => {
        const prev = existing.replace(/[。．.]+$/, "");
        return prev === core || prev.includes(core) || core.includes(prev);
      })) return;
      uniq.push(/[。．.!?！？]$/.test(part) ? part : `${part}。`);
    });
    return uniq.join("");
  }

  function paragraphsHtml(text) {
    const paras = String(text || "").split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    return paras.map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  }

  function termExplainHtml(item) {
    const text = termDescription(item) || "まだ書いていません。";
    return `<section class="block term-explain"><h3>説明</h3>${paragraphsHtml(text)}</section>`;
  }

  function termTone(item) {
    const own = ownershipForTerm(item);
    const statuses = [];
    own.dedicated.forEach(row => statuses.push(row.status));
    own.builtinGear.forEach(row => statuses.push(row.status));
    own.builtinSoft.forEach(row => statuses.push(row.status));
    (item.consideringGear || []).forEach(id => {
      const gear = findItem("gear", id);
      if (gear) statuses.push(gear.status);
    });
    if (statuses.some(status => status === "owned" || status === "builtin")) return "owned";
    if (statuses.some(status => status === "planned")) return "planned";
    if (statuses.some(status => status === "considering")) return "considering";
    return "unknown";
  }

  function termCard(item, opts) {
    const sortable = !!(opts && opts.sortable);
    const catId = termCatId(item);
    const catTitle = groupTitle("terms", catId);
    return `
      <article class="term-card" ${sortable ? `draggable="true" data-term-id="${esc(item.id)}" data-term-cat="${esc(catId)}"` : ""} data-href="${esc(termHref(item))}" data-item-id="${esc(item.id)}">
        ${menuHtml("terms", item.id)}
        <h3>${termNameHtml(item)}</h3>
        <p class="summary">${esc(termListText(item))}</p>
        ${catTitle ? `<p class="row-cat"><span class="term-cat-tag">${esc(catTitle)}</span></p>` : ""}
      </article>`;
  }

  function renderTerms() {
    return pageHead("DTM用語集", "", addBtn("terms")) +
      termsBody();
  }

  function termsBody() {
    const items = glossaryTerms().slice().sort(compareTerms);
    if (!items.length) return `<p class="empty">まだ登録がありません。</p>`;
    return `<div class="item-list">${items.map(item => itemRow("terms", item, termHref(item), {
      hub: true,
      hideKind: true,
      use: "",
      blurb: termListText(item),
      catLabel: groupTitle("terms", termCatId(item))
    })).join("")}</div>`;
  }

  function renderDiagram(id) {
    const diagram = (DTM.diagrams || {})[id];
    if (!diagram) return "";
    const node = (nid) => diagram.nodes.find(n => n.id === nid);
    const card = (nid) => {
      const n = node(nid);
      if (!n) return "";
      return `<a class="diagram-node" href="#/terms/${esc(n.id)}"><strong>${esc(n.label)}</strong><span>${esc(n.text)}</span></a>`;
    };
    const mini = (nid) => {
      const n = node(nid);
      if (!n) return "";
      return `<a class="diagram-mini" href="#/terms/${esc(n.id)}">${esc(n.label)}</a>`;
    };
    const note = (nid) => {
      const n = node(nid);
      if (!n) return "";
      return `<li><a href="#/terms/${esc(n.id)}">${esc(n.label)}</a></li>`;
    };
    return `
      <section class="block diagram-brief">
        <h3>${esc(diagram.title)}</h3>
        <div class="diagram-flow">
          ${mini("sample")}
          <span class="diagram-flow-arrow">→</span>
          ${mini("sampling")}
          <span class="diagram-flow-arrow">→</span>
          ${mini("sampler")}
        </div>
        <ul class="diagram-notes">
          ${note("sample-instrument")}
          ${note("kontakt")}
          ${note("soft-instrument")}
          ${note("synthesizer")}
        </ul>
        <details class="diagram-more">
          <summary>詳しく見る</summary>
          <p class="muted">${esc(diagram.intro || "")}</p>
          <div class="diagram">
            ${card("sample")}
            <div class="diagram-arrow">↓ 取り込む行為</div>
            ${card("sampling")}
            <div class="diagram-arrow">↓ 読み込んで演奏・加工</div>
            ${card("sampler")}
            <div class="diagram-arrow">↓ 大量のサンプルで楽器として鳴らす</div>
            <div class="diagram-side">
              ${card("sample-instrument")}
              ${card("kontakt")}
            </div>
            <div class="diagram-box">
              <em>ソフト音源という大きな分類</em>
              ${card("soft-instrument")}
              ${card("synthesizer")}
            </div>
          </div>
        </details>
      </section>`;
  }

  function videosFor(type, id) {
    const key = type === "computers" ? "computer" : type.replace(/s$/, "");
    return collection("videos").filter(video =>
      (video.relatedType === type || video.relatedType === key) && video.relatedId === id
    );
  }

  function videoListHtml(type, id, heading, opts) {
    const videos = videosFor(type, id);
    const cats = DTM.videoCategories || [];
    const compactEmpty = opts && opts.compactEmpty;
    const markerGroups = (video) => {
      const used = new Set();
      const groups = [];
      cats.forEach(cat => {
        const ms = (video.markers || []).filter(m => m.category === cat);
        if (ms.length) {
          groups.push({ cat, ms });
          used.add(cat);
        }
      });
      const other = (video.markers || []).filter(m => !used.has(m.category));
      if (other.length) groups.push({ cat: other[0].category || "", ms: other });
      return groups;
    };
    if (!videos.length) {
      if (opts && opts.hideEmpty) return "";
      if (compactEmpty) {
        return `<p class="video-add-row"><button type="button" class="ghost-btn add-btn" data-act="add-video" data-type="${esc(type)}" data-id="${esc(id)}">＋動画を追加</button></p>`;
      }
      return `
      <section class="block">
        <div class="page-head" style="margin:0 0 8px">
          <h3>${esc(heading || "使い方動画")}</h3>
          <button type="button" class="ghost-btn add-btn" data-act="add-video" data-type="${esc(type)}" data-id="${esc(id)}">＋ 追加</button>
        </div>
        <p class="muted">まだ動画は登録されていません。</p>
      </section>`;
    }
    return `
      <section class="block">
        <div class="page-head" style="margin:0 0 8px">
          <h3>${esc(heading || "使い方動画")}</h3>
          <button type="button" class="ghost-btn add-btn" data-act="add-video" data-type="${esc(type)}" data-id="${esc(id)}">＋ 追加</button>
        </div>
        ${videos.map(video => `
          <article class="video-card">
            ${menuHtml("videos", video.id)}
            <strong>${esc(video.title || video.name || "動画")}</strong>
            <p class="muted">${esc(video.what || "")}</p>
            ${markerGroups(video).map(group => `
              ${group.cat ? `<p class="video-group-label">${esc(group.cat)}</p>` : ""}
              <div class="marker-row">
                ${group.ms.map(marker => `
                  <button type="button" class="marker-btn" data-act="play-video" data-video="${esc(video.id)}" data-marker="${esc(marker.id)}">
                    ${esc(formatTime(marker.startSeconds))} ${esc(marker.label || "")}
                  </button>
                `).join("")}
              </div>
            `).join("")}
            <div class="marker-row" style="margin-top:6px">
              <button type="button" class="ghost-btn" data-act="add-marker" data-id="${esc(video.id)}">開始位置を追加</button>
            </div>
          </article>
        `).join("")}
      </section>`;
  }

  function howtoVideosHtml() {
    const videos = collection("videos");
    const inner = videos.length ? videos.map(video => {
      const related = video.relatedType && video.relatedId ? findItem(video.relatedType, video.relatedId) : null;
      return `<article class="video-card" style="position:relative">
        ${menuHtml("videos", video.id)}
        <strong>${esc(video.title || video.name || "動画")}</strong>
        <p class="muted">${esc(video.what || "")}${related ? ` ・ ${esc(related.name)}` : ""}</p>
        <div class="marker-row">
          ${(video.markers || []).map(marker => `
            <button type="button" class="marker-btn" data-act="play-video" data-video="${esc(video.id)}" data-marker="${esc(marker.id)}">
              ${esc(formatTime(marker.startSeconds))} ${esc(marker.label || "")}
            </button>
          `).join("")}
          <button type="button" class="ghost-btn" data-act="add-marker" data-id="${esc(video.id)}">開始位置を追加</button>
        </div>
      </article>`;
    }).join("") : `<p class="muted">まだ動画は登録されていません。</p>`;
    return catSection("howto-videos", "使い方動画", inner) +
      `<div class="row-actions" style="margin:-4px 0 12px"><button type="button" class="ghost-btn add-btn" data-act="add-item" data-type="video">＋ 追加</button></div>`;
  }

  function linkChips(type, ids, hrefPrefix) {
    return (ids || []).map(id => {
      const item = findItem(type, id);
      if (!item) return "";
      const href = type === "terms" ? termHref(item) : `${hrefPrefix}${id}`;
      return `<a class="chip" href="${esc(href)}">${esc(item.name)}</a>`;
    }).join("");
  }

  function chipsOrNone(...groups) {
    const html = groups.join("");
    return html || `<span class="muted">登録なし</span>`;
  }

  function productMakerHtml(type, item) {
    if (item.maker) return makerLabelHtml(item);
    if (type === "computers" && item.kind === "apple") return `<p class="section-label">Apple</p>`;
    return "";
  }

  function productKindLabel(type, item) {
    if (type === "gear") return item.categoryLabel || "";
    if (type === "computers") return listKindLabel(item) || item.purpose || "";
    return item.kindLabel || item.kind || item.purpose || "";
  }

  function relatedTermTags(item) {
    const brand = findBrandForItem(item);
    const html = [
      brand ? `<a class="chip" href="#/brands/${esc(brand.id)}">${esc(brand.name)}</a>` : "",
      linkChips("terms", item.relatedTerms, "#/terms/")
    ].join("");
    return html ? `<div class="link-list term-tags term-tags-inline">${html}</div>` : "";
  }

  function whatBlock(item) {
    const body = usefulText(item.summary) || usefulText(item.what) || usefulText(item.listSummary) || usefulText(item.purpose);
    if (!body) return "";
    return `<section class="block">
      <h3>これは何？</h3>
      ${paragraphsHtml(body)}
      ${relatedTermTags(item)}
    </section>`;
  }

  function homeHelpBlock(item) {
    const p = item.purchase || {};
    const now = usefulText(item.homeUse);
    const change = [p.expected, p.difference, p.newCapabilities].map(usefulText).filter(Boolean);
    const sub = usefulText(p.substitute);
    if (!now && !change.length && !sub) return "";
    const multi = [now, change.length, sub].filter(Boolean).length > 1;
    const parts = [];
    if (now) parts.push(`${multi ? "<h4>今の環境</h4>" : ""}${multiline(now)}`);
    if (change.length) parts.push(`${multi ? "<h4>買うとどう変わる？</h4>" : ""}${paragraphsHtml(change.join("\n\n"))}`);
    if (sub) parts.push(`${multi ? "<h4>今ある機材で代用できる？</h4>" : ""}${multiline(sub)}`);
    return `<section class="block home-help"><h3>我が家でどう役立つ？</h3>${parts.join("")}</section>`;
  }

  function moreLinkBlock(title, html) {
    if (!html) return "";
    return `<section class="block"><h3>${esc(title)}</h3><div class="link-list">${html}</div></section>`;
  }

  function confirmWantedBlock(item) {
    const notes = usefulText(item.purchase && item.purchase.notes);
    const items = (item.unconfirmed || []).filter(x => String(x || "").trim());
    if (!notes && !items.length) return "";
    const list = items.length
      ? `<ul class="home-list">${items.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`
      : "";
    return `<section class="block"><h3>確認したいこと</h3>${notes ? `<p>${esc(notes)}</p>` : ""}${list}</section>`;
  }

  function memoBlock(item) {
    const memo = String(item.memo || "").trim();
    return `<section class="block"><h3>メモ</h3>${memo ? multiline(memo) : `<p class="muted">まだありません。</p>`}</section>`;
  }

  function productHero(type, item, kind) {
    return `
      <section class="detail-hero">
        <div class="detail-photo-wrap" style="position:relative">
          ${menuHtml(type, item.id)}
          ${thumbHtml(type, item, "detail-photo")}
        </div>
        <div>
          ${productMakerHtml(type, item)}
          <h2>${esc(item.name)}</h2>
          ${purchaseRecordHtml(item)}
          <div class="card-meta">
            ${kind ? `<span class="badge">${esc(kind)}</span>` : ""}
            ${item.needsModelCheck ? `<span class="badge warn">型番確認</span>` : ""}
          </div>
        </div>
        ${extraImagesHtml(item)}
      </section>`;
  }

  function gearMoreHtml(item) {
    const mpc = item.mpcNotes ? item.mpcNotes.map(note =>
      `<article><h4>${esc(note.title)}</h4><p>${esc(note.body)}</p></article>`
    ).join("") : "";
    const desc = usefulText(item.description);
    const conn = [
      linkChips("computers", item.connectedComputers, "#/computers/"),
      linkChips("gear", (item.connections || []).filter(cid => !findItem("computers", cid)), "#/gear/")
    ].join("");
    const how = usefulText(item.howTo);
    const daw = usefulText(item.dawConnection);
    const connect = [how, daw].filter((text, i, arr) => text && arr.indexOf(text) === i).join("\n");
    const bits = [
      desc ? `<section class="block"><h3>詳しい仕様</h3>${paragraphsHtml(desc)}</section>` : sectionIf("詳しい仕様", item.canDo),
      desc ? sectionIf("何ができる？", item.canDo) : "",
      sectionIf("どういうときに使う？", item.whenToUse),
      sectionIf("接続方法", connect),
      moreLinkBlock("接続する機材", conn),
      moreLinkBlock("関連機材", linkChips("gear", item.relatedGear, "#/gear/")),
      mpc ? `<section class="block"><h3>この機材まわりの言葉</h3><div class="note-grid">${mpc}</div></section>` : "",
      confirmWantedBlock(item)
    ].filter(Boolean);
    if (!bits.length) return "";
    return `<details class="more-block"><summary>詳しく知る</summary>${bits.join("")}</details>`;
  }

  function renderGearDetail(id) {
    const item = findItem("gear", id);
    if (!item) return `<p class="empty">見つかりませんでした。</p>`;
    return `
      <article class="detail">
        ${productHero("gear", item, productKindLabel("gear", item))}
        ${whatBlock(item)}
        ${homeHelpBlock(item)}
        ${videoListHtml("gear", item.id, "使い方動画", { compactEmpty: true })}
        ${officialSiteBlock(item)}
        ${gearMoreHtml(item)}
        ${memoBlock(item)}
      </article>`;
  }

  function section(title, body) {
    return `<section class="block"><h3>${esc(title)}</h3>${multiline(body || "未確認")}</section>`;
  }

  function sectionIf(title, body) {
    const text = usefulText(body);
    if (!text) return "";
    return `<section class="block"><h3>${esc(title)}</h3>${multiline(text)}</section>`;
  }

  function bulletSection(title, items) {
    if (!items || !items.length) return "";
    return `<section class="block"><h3>${esc(title)}</h3><ul class="home-list">${items.map(x => `<li>${esc(x)}</li>`).join("")}</ul></section>`;
  }

  function multiline(body) {
    const lines = String(body || "").split(/\n+/).map(s => s.trim()).filter(Boolean);
    if (lines.length > 1) return `<ul class="home-list">${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>`;
    return `<p>${esc(body || "未確認")}</p>`;
  }

  function homeUseBlock(text) {
    return `<section class="block"><h3>我が家ではどう使える？</h3>${multiline(text || "未確認")}</section>`;
  }

  function unconfirmed(item) {
    if (!item.unconfirmed || !item.unconfirmed.length) return "";
    return `<section class="block"><h3>未確認</h3><div class="card-meta">${item.unconfirmed.map(x => `<span class="badge unknown">${esc(x)}</span>`).join("")}</div></section>`;
  }

  function spec(rows) {
    const shown = rows.filter(row => usefulText(row[1]));
    if (!shown.length) return "";
    return `<dl class="spec-list">${shown.map(([k, v]) => `<div class="spec-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
  }

  function renderComputerDetail(id) {
    const item = findItem("computers", id);
    if (!item) return `<p class="empty">見つかりませんでした。</p>`;
    const specHtml = spec([
      ["所有者", item.owner],
      ["メーカー", item.maker],
      ["機種", item.name],
      ["用途", item.purpose],
      ["OS", item.os],
      ["OSバージョン", item.osVersion],
      ["CPU／チップ", item.cpu],
      ["メモリ", item.memory],
      ["ストレージ", item.storage],
      ["USB-C", item.usbC],
      ["Thunderbolt", item.thunderbolt],
      ["ディスプレイ", item.display]
    ]);
    const more = [
      specHtml ? `<section class="block"><h3>詳しい仕様</h3>${specHtml}</section>` : "",
      moreLinkBlock("接続する機材", linkChips("gear", item.connectedGear, "#/gear/")),
      moreLinkBlock("インストール済みソフト", linkChips("software", item.installedSoftware, "#/software/")),
      confirmWantedBlock(item)
    ].filter(Boolean);
    return `
      <article class="detail">
        ${productHero("computers", item, productKindLabel("computers", item))}
        ${whatBlock(item)}
        ${homeHelpBlock(item)}
        ${videoListHtml("computers", item.id, "使い方動画", { compactEmpty: true })}
        ${officialSiteBlock(item)}
        ${more.length ? `<details class="more-block"><summary>詳しく知る</summary>${more.join("")}</details>` : ""}
        ${memoBlock(item)}
      </article>`;
  }

  function renderSoftwareDetail(id) {
    const item = findItem("software", id);
    if (!item) return `<p class="empty">見つかりませんでした。</p>`;
    const children = collection("software").filter(child => child.parentId === item.id);
    const parent = item.parentId ? findItem("software", item.parentId) : null;
    const specHtml = spec([
      ["バージョン", item.version],
      ["用途", item.purpose],
      ["音源カテゴリー", instrumentCategoryTitle(item.instrumentCategory)],
      ["Kontaktが必要か", item.needsKontakt === "yes" ? "必要" : item.needsKontakt === "no" ? "不要" : item.needsHost || ""],
      ["方式", item.sourceType === "sample" ? "サンプル音源" : item.sourceType === "synth" ? "シンセ音源" : isMidiGroove(item) ? "MIDIフレーズ／グルーヴ" : ""]
    ]);
    const more = [
      specHtml ? `<section class="block"><h3>詳しい仕様</h3>${specHtml}</section>` : "",
      sectionIf("何ができる？", item.canDo),
      sectionIf("どういうときに使う？", item.whenToUse),
      parent ? moreLinkBlock(item.kind === "instrument" || isMidiGroove(item) ? "関連する音源" : "入っているスイート", `<a class="chip" href="#/software/${esc(parent.id)}">${esc(parent.name)}</a>`) : "",
      children.length ? moreLinkBlock(item.kind === "instrument" ? "関連する素材" : "中に入っているもの", children.map(child => `<a class="chip" href="#/software/${esc(child.id)}">${esc(child.name)}</a>`).join("")) : "",
      moreLinkBlock("関連ソフト", linkChips("software", item.relatedSoftware, "#/software/")),
      moreLinkBlock("使用しているPC", linkChips("computers", item.computers, "#/computers/")),
      moreLinkBlock("対応DAW", linkChips("software", item.compatibleDaws, "#/software/")),
      confirmWantedBlock(item)
    ].filter(Boolean);
    return `
      <article class="detail">
        ${productHero("software", item, productKindLabel("software", item))}
        ${whatBlock(item)}
        ${homeHelpBlock(item)}
        ${videoListHtml("software", item.id, "使い方動画", { compactEmpty: true })}
        ${officialSiteBlock(item)}
        ${more.length ? `<details class="more-block"><summary>詳しく知る</summary>${more.join("")}</details>` : ""}
        ${memoBlock(item)}
      </article>`;
  }

  function termFnIdSet(term) {
    const aliasIds = collection("terms").filter(item => item.sameAs === term.id).map(item => item.id);
    return new Set([term.id, term.sameAs, ...aliasIds].filter(Boolean));
  }

  function productHasTermFn(item, fnIds) {
    return (item.functions || []).some(fn => fnIds.has(fn));
  }

  function isConsideringItem(item) {
    return item && (item.status === "considering" || item.status === "planned");
  }

  function uniqById(items) {
    const seen = new Set();
    return items.filter(item => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  function productAnchor(item) {
    const type = collection("software").some(row => row.id === item.id) ? "software" : "gear";
    return `<a href="${esc(productHref(type, item))}">${esc(item.name)}</a>`;
  }

  function jpAndHtml(items) {
    const bits = items.map(productAnchor);
    if (!bits.length) return "";
    if (bits.length === 1) return bits[0];
    if (bits.length === 2) return `${bits[0]}と${bits[1]}`;
    return `${bits.slice(0, -1).join("、")}と${bits[bits.length - 1]}`;
  }

  function termMatchItems(term) {
    return ((term.dedicated && term.dedicated.matchIds) || [])
      .map(id => findItem("gear", id) || findItem("software", id))
      .filter(Boolean);
  }

  function termHomeRelationHtml(term) {
    const fnIds = termFnIdSet(term);
    const matchItems = termMatchItems(term);
    const fnOwned = uniqById([
      ...collection("gear").filter(item => isOwnedItem(item) && productHasTermFn(item, fnIds)),
      ...collection("software").filter(item => isOwnedItem(item) && productHasTermFn(item, fnIds))
    ]);
    const matchOwned = uniqById(matchItems.filter(isOwnedItem));
    const considerPool = uniqById([
      ...matchItems.filter(isConsideringItem),
      ...(term.relatedGear || []).map(id => findItem("gear", id)).filter(item => isConsideringItem(item) && (productHasTermFn(item, fnIds) || matchItems.some(row => row.id === item.id))),
      ...(term.relatedSoftware || []).map(id => findItem("software", id)).filter(item => isConsideringItem(item) && (productHasTermFn(item, fnIds) || matchItems.some(row => row.id === item.id)))
    ]).filter(item => !fnOwned.some(row => row.id === item.id) && !matchOwned.some(row => row.id === item.id));

    const paras = [];
    const kind = term.entityKind;
    const asProduct = kind === "gear" || kind === "category";
    if (fnOwned.length) {
      if (asProduct) {
        paras.push(`<p>我が家では${jpAndHtml(fnOwned)}が${esc(term.name)}として登録されています。</p>`);
      } else {
        paras.push(`<p>${jpAndHtml(fnOwned)}に${esc(term.name)}機能があります。そのため、${esc(term.name)}だけを別に購入する必要はありません。</p>`);
      }
    } else if (matchOwned.length) {
      paras.push(`<p>我が家では${jpAndHtml(matchOwned)}が${esc(term.name)}として登録されています。</p>`);
    }
    if (considerPool.length) {
      if (fnOwned.length || matchOwned.length) {
        paras.push(`<p>${jpAndHtml(considerPool)}にも関係しますが、所有ではなく購入検討です。</p>`);
      } else {
        paras.push(`<p>${jpAndHtml(considerPool)}は購入検討として登録されています。</p>`);
      }
    }
    if (!paras.length) return "";
    return `<section class="block home-rel"><h3>我が家との関係</h3>${paras.join("")}</section>`;
  }

  function termRelatedProductItems(term) {
    const fnIds = termFnIdSet(term);
    const matchIds = new Set((term.dedicated && term.dedicated.matchIds) || []);
    const rows = [];
    const add = (type, item) => {
      if (!item) return;
      if (rows.some(row => row.type === type && row.item.id === item.id)) return;
      rows.push({ type, item });
    };
    const allowConsidering = (item, id) =>
      isConsideringItem(item) && (productHasTermFn(item, fnIds) || matchIds.has(id));
    (term.relatedGear || []).forEach(id => {
      const item = findItem("gear", id);
      if (!item) return;
      const core = productHasTermFn(item, fnIds) || matchIds.has(id);
      const associatedOwned = isOwnedItem(item) && (term.entityKind === "function" || term.entityKind === "concept" || term.entityKind === "standard");
      if (core && (isOwnedItem(item) || isConsideringItem(item))) add("gear", item);
      else if (associatedOwned) add("gear", item);
    });
    (term.relatedSoftware || []).forEach(id => {
      const item = findItem("software", id);
      if (!item) return;
      if (isOwnedItem(item) || allowConsidering(item, id)) add("software", item);
    });
    collection("gear").forEach(item => {
      if (isOwnedItem(item) && productHasTermFn(item, fnIds)) add("gear", item);
    });
    collection("software").forEach(item => {
      if (isOwnedItem(item) && productHasTermFn(item, fnIds)) add("software", item);
    });
    matchIds.forEach(id => {
      const gear = findItem("gear", id);
      const soft = findItem("software", id);
      if (gear) add("gear", gear);
      if (soft) add("software", soft);
    });
    return rows;
  }

  function termRelatedHtml(item) {
    const terms = (item.relatedTerms || []).map(id => {
      const term = findItem("terms", id);
      if (!term || term.glossaryHidden) return "";
      return `<a class="chip chip-term" href="${esc(termHref(term))}">${esc(term.name)}</a>`;
    }).join("");
    const products = termRelatedProductItems(item).map(row =>
      `<a class="chip chip-product" href="${esc(productHref(row.type, row.item))}">${esc(row.item.name)}</a>`
    ).join("");
    if (!terms && !products) return "";
    return `<section class="block relate-block">
      <h3>関連</h3>
      ${terms ? `<div class="relate-row"><span class="relate-label">用語</span><div class="link-list">${terms}</div></div>` : ""}
      ${products ? `<div class="relate-row"><span class="relate-label">製品</span><div class="link-list">${products}</div></div>` : ""}
    </section>`;
  }

  function renderTermDetail(id) {
    const item = findItem("terms", id);
    if (!item) return `<p class="empty">見つかりませんでした。</p>`;
    const catTitle = groupTitle("terms", termCatId(item));
    const alias = (item.aliases || []).find(text => text && !String(item.name).includes(text));
    const title = alias ? `${item.name} / ${alias}` : item.name;
    const memo = String(item.memo || "").trim();
    return `
      <article class="detail">
        <section class="detail-hero">
          <div>
            ${menuHtml("terms", item.id)}
            <h2>${esc(title)}</h2>
            ${catTitle ? `<p class="term-cat-label">${esc(catTitle)}</p>` : ""}
          </div>
        </section>
        ${termExplainHtml(item)}
        ${termHomeRelationHtml(item)}
        ${termRelatedHtml(item)}
        ${videoListHtml("terms", item.id, "使い方動画", { hideEmpty: true })}
        ${memo ? `<section class="block"><h3>メモ</h3>${multiline(memo)}</section>` : ""}
      </article>`;
  }

  function brandChip(brand) {
    if (!brand) return "";
    return `<a class="chip" href="#/brands/${esc(brand.id)}">${esc(brand.name)}</a>`;
  }

  function dedicatedItems(term) {
    const d = term.dedicated;
    if (!d) return [];
    if (Array.isArray(d.matchIds)) {
      return d.matchIds.map(id => findItem("gear", id) || findItem("software", id)).filter(Boolean);
    }
    if (d.category === "instrument") {
      const items = collection("software").filter(item => item.kind === "instrument" && !item.parentId);
      if (term.id === "sample-instrument") {
        return items.filter(item => item.sourceType === "sample");
      }
      return items;
    }
    return collection("gear").filter(item => item.group === d.category);
  }

  function ownershipForTerm(term) {
    const dedicated = dedicatedItems(term);
    const taken = new Set(dedicated.map(item => item.id));
    const aliasIds = collection("terms").filter(item => item.sameAs === term.id).map(item => item.id);
    const fnIds = new Set([term.id, term.sameAs, ...aliasIds].filter(Boolean));
    const hasFn = (item) => (item.functions || []).some(fn => fnIds.has(fn));
    const builtinGear = collection("gear").filter(item => hasFn(item) && !taken.has(item.id));
    const builtinSoft = collection("software").filter(item => hasFn(item) && !taken.has(item.id));
    return { dedicated, builtinGear, builtinSoft };
  }

  function brandRow(item) {
    return itemRow("brands", item, `#/brands/${item.id}`, { usePrefix: false });
  }

  function renderBrands() {
    const items = collection("brands").slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "ja"));
    return pageHead("メーカー・ブランド", "", addBtn("brands")) +
      (items.length
        ? catSection("brands", "メーカー・ブランド", `<div class="item-list">${items.map(brandRow).join("")}</div>`)
        : `<p class="empty">まだ登録がありません。</p>`);
  }

  function famousUsersHtml(users) {
    if (!users || !users.length) return "<p>未確認</p>";
    return `<ul class="own-list">${users.map(row => {
      const src = (row.sourceUrl || row.sourceUrlStatus === "unavailable")
        ? sourceAnchor(row.sourceUrl, row.sourceLabel || "情報源", row.sourceUrlStatus || row.urlStatus, row.previousSourceUrl || row.previousUrl)
        : "情報源なし";
      return `<li>
        <b>${esc(row.name)}</b>：${esc(row.product || "")}${row.usage ? `／${esc(row.usage)}` : ""}
        <div class="muted">${src}${row.confirmedDate ? `　確認日：${esc(row.confirmedDate)}` : ""}</div>
      </li>`;
    }).join("")}</ul>`;
  }

  function isAssetUrl(url) {
    return /\.(png|jpe?g|gif|webp|svg|ico|avif)(\?|#|$)/i.test(String(url || ""));
  }

  function officialUrlOf(item) {
    if (!item) return "";
    if (item.officialUrl) return item.officialUrl;
    const src = item.imageSourceUrl;
    if (src && !isAssetUrl(src)) return src;
    return "";
  }

  function officialUnavailable(item) {
    if (!item) return false;
    if (item.officialUrlStatus === "unavailable") return true;
    if (!item.officialUrl && item.imageSourceUrlStatus === "unavailable") return true;
    return false;
  }

  function sourceAnchor(url, label, status, previousUrl) {
    if (status === "unavailable") {
      const old = previousUrl || url ? `<span class="official-old-note">旧公式URLあり</span>` : "";
      return `${esc(label || "公式サイト")}：現在アクセス不可${old ? ` ${old}` : ""}`;
    }
    if (!url) return esc(label || "情報源なし");
    return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label || "公式サイト")}</a>`;
  }

  function officialSiteBlock(item) {
    const url = officialUrlOf(item);
    if (!url && item.officialUrlStatus !== "unavailable") return "";
    const body = officialUnavailable(item)
      ? `<p>公式サイト：現在アクセス不可</p>${item.previousOfficialUrl || url ? `<p class="official-old-note">旧公式URLあり</p>` : ""}`
      : `<p><a href="${esc(url)}" target="_blank" rel="noopener">公式サイト</a></p>`;
    return `<section class="block"><h3>公式サイト</h3>${body}</section>`;
  }

  function sourcesHtml(rows, item) {
    if (!rows || !rows.length) return "";
    return `<section class="block"><h3>情報源</h3><ul class="own-list">${rows.map(row => {
      const shared = item && row.url && row.url === item.officialUrl;
      const status = row.urlStatus || (shared ? item.officialUrlStatus : "");
      const previous = row.previousUrl || (shared ? item.previousOfficialUrl : "");
      return `<li>${sourceAnchor(row.url, row.label || row.url, status, previous)}</li>`;
    }).join("")}</ul></section>`;
  }

  function renderBrandDetail(id) {
    const item = findItem("brands", id);
    if (!item) return `<p class="empty">見つかりませんでした。</p>`;
    const allGear = collection("gear").filter(gear => gearMatchesBrand(gear, item));
    const allSoft = collection("software").filter(soft => gearMatchesBrand(soft, item));
    const owned = allGear.filter(gear => gear.status === "owned").concat(allSoft.filter(soft => soft.status === "owned"));
    const considering = allGear.filter(gear => gear.status === "planned" || gear.status === "considering")
      .concat(allSoft.filter(soft => soft.status === "planned" || soft.status === "considering"));
    const related = allGear.filter(gear => gear.status !== "owned" && gear.status !== "planned" && gear.status !== "considering")
      .concat(allSoft.filter(soft => soft.status !== "owned" && soft.status !== "planned" && soft.status !== "considering"));
    const termIds = (item.relatedTerms || []).filter(tid => {
      const term = findItem("terms", tid);
      return term && !term.glossaryHidden && tid !== item.id;
    });
    return `
      <article class="detail">
        <section class="detail-hero">
          <div class="detail-photo-wrap" style="position:relative">
            ${menuHtml("brands", item.id)}
            ${thumbHtml("brands", item, "detail-photo")}
          </div>
          <div>
            <p class="section-label">メーカー／ブランド</p>
            <h2>${esc(item.name)}</h2>
            <div class="card-meta">
              ${item.nameJa ? `<span class="badge">${esc(item.nameJa)}</span>` : ""}
              ${item.country ? `<span class="badge">${esc(item.country)}</span>` : ""}
            </div>
          </div>
          ${extraImagesHtml(item)}
        </section>
        <section class="block">
          <h3>基本情報</h3>
          ${spec([
            ["正式名称", item.name],
            ["一般的な呼び方", item.nameJa],
            ["読み方", item.reading],
            ["国名", item.country],
            ["創業年", item.founded]
          ])}
        </section>
        ${section("何が得意な会社／ブランドか", (item.specialties || []).join("\n") || item.soundImage)}
        ${section("代表的な製品カテゴリー", (item.productCategories || []).join("／"))}
        ${section("代表製品", item.representative)}
        ${section("音の特徴やブランドイメージ", item.soundImage)}
        ${section("プロ向け／一般向けなどの傾向", item.audience)}
        <section class="block"><h3>我が家で所有している製品</h3><div class="link-list">${chipsOrNone(owned.map(row => {
          const href = findItem("software", row.id) ? `#/software/${row.id}` : `#/gear/${row.id}`;
          return `<a class="chip" href="${esc(href)}">${esc(row.name)}</a>`;
        }).join(""))}</div></section>
        <section class="block"><h3>購入検討中の製品</h3><div class="link-list">${chipsOrNone(considering.map(row => {
          const href = findItem("software", row.id) ? `#/software/${row.id}` : `#/gear/${row.id}`;
          return `<a class="chip" href="${esc(href)}">${esc(row.name)}</a>`;
        }).join(""))}</div></section>
        <section class="block"><h3>関連製品</h3><div class="link-list">${chipsOrNone(related.map(row => {
          const href = findItem("software", row.id) ? `#/software/${row.id}` : `#/gear/${row.id}`;
          return `<a class="chip" href="${esc(href)}">${esc(row.name)}</a>`;
        }).join(""))}</div></section>
        <section class="block"><h3>関連DTM用語</h3><div class="link-list">${chipsOrNone(linkChips("terms", termIds, "#/terms/"))}</div></section>
        <section class="block"><h3>愛用していることで知られる有名人／アーティスト</h3>${famousUsersHtml(item.famousUsers)}</section>
        ${videoListHtml("brands", item.id, "参考動画")}
        ${item.officialUrl || item.officialUrlStatus === "unavailable" ? officialSiteBlock(item) : ""}
        ${sourcesHtml(item.sources, item)}
        ${section("メモ", item.memo || "なし")}
      </article>`;
  }

  function appleWorkflowsBody() {
    const wfCats = ["wf-a", "wf-b", "wf-c", "wf-d", "wf-e"];
    const items = collection("workflows");
    if (!items.length) return `<p class="empty">ワークフローはまだありません。</p>`;
    return items.map((wf, index) => catSection(wfCats[index % wfCats.length], wf.title, `
      <article class="flow">
        ${menuHtml("workflows", wf.id)}
        <p class="muted">${esc(wf.summary || "")}</p>
        ${wf.apps ? `<p class="muted">アプリ：${esc(wf.apps)}</p>` : ""}
        ${wf.transfer ? `<p class="muted">受け渡し：${esc(wf.transfer)}</p>` : ""}
        ${(wf.steps || []).map((step, stepIndex) => {
          const device = findItem("computers", step.deviceId);
          const name = device ? device.name : step.deviceId;
          return `${stepIndex ? `<div class="flow-down">↓</div>` : ""}
            <div class="flow-step"><b>${esc(name)}</b>${esc(step.action)}</div>`;
        }).join("")}
      </article>
    `)).join("");
  }

  function renderApple() {
    if (!SHOW_APPLE_WORKFLOWS) {
      location.hash = "#/env?tab=gear";
      return "";
    }
    const main = ["macbook-yuri", "ipad-air-yuri", "iphone-yuri"]
      .map(id => findItem("computers", id))
      .filter(Boolean);
    const others = collection("computers").filter(item => item.kind === "apple" && item.appleRole !== "main");
    return pageHead("Apple DTM連携", "", addBtn("workflows")) +
      catSection("comp-apple", "メインの3台", `<div class="item-list">${main.map(item => itemRow("computers", item, `#/computers/${item.id}`)).join("")}</div>`) +
      appleWorkflowsBody() +
      (others.length ? catSection("comp-apple", "そのほかのApple製品", `<div class="item-list">${others.map(item => itemRow("computers", item, `#/computers/${item.id}`)).join("")}</div>`) : "");
  }

  function addBtn(type, label) {
    return `<button type="button" class="ghost-btn add-btn" data-act="add-item" data-type="${esc(type)}">${esc(label || "＋ 追加")}</button>`;
  }

  const NODE_W = 158;
  const NODE_H = 160;

  function patchNodeBox(node) {
    const el = document.querySelector(`[data-patch-node="${node.id}"]`);
    return {
      w: el ? el.offsetWidth : NODE_W,
      h: el ? el.offsetHeight : NODE_H
    };
  }

  function patchBoardSize(diagram) {
    const nodes = diagram.nodes || [];
    const pad = 16;
    if (!nodes.length) return { width: 720, height: 200 };
    let maxX = 0;
    let maxY = 0;
    nodes.forEach(n => {
      const box = patchNodeBox(n);
      maxX = Math.max(maxX, Number(n.x) + box.w);
      maxY = Math.max(maxY, Number(n.y) + box.h);
    });
    return {
      width: Math.max(nodes.length ? 280 : 720, Math.ceil(maxX + pad)),
      height: Math.max(180, Math.ceil(maxY + pad))
    };
  }

  function applyPatchBoardSize(diagram) {
    const size = patchBoardSize(diagram);
    const board = $("patchBoard");
    const svg = $("patchSvg");
    if (board) {
      board.style.width = `${size.width}px`;
      board.style.height = `${size.height}px`;
    }
    if (svg) {
      svg.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
    }
    return size;
  }

  function edgeLabelText(edge) {
    const kind = String(edge.kind || "").toUpperCase();
    const bits = [];
    if (kind) bits.push(kind);
    if (edge.label) bits.push(edge.label);
    let text = bits.join(" / ");
    if (edge.unconfirmed) text = text ? `${text}（未確認）` : "未確認";
    return text;
  }

  function patchItemRef(node) {
    return findItem(node.itemType, node.itemId);
  }

  function patchHref(node) {
    if (node.itemType === "computers") return `#/computers/${node.itemId}`;
    if (node.itemType === "software") return `#/software/${node.itemId}`;
    return `#/gear/${node.itemId}`;
  }

  function addConnectionDiagram() {
    const title = prompt("接続図の名前", "新しい接続図");
    if (!title || !title.trim()) return;
    const id = `patch-${Date.now()}`;
    addItem("connections", {
      id,
      title: title.trim(),
      name: title.trim(),
      width: 720,
      height: 220,
      nodes: [],
      edges: []
    });
    location.hash = `#/patch/${id}`;
  }

  function defaultPatchId() {
    const items = collection("connections");
    if (!items.length) return "";
    const mac = items.find(item => item.id === "mac-setup" || item.title === "Mac制作環境" || item.name === "Mac制作環境");
    return (mac || items[0]).id;
  }

  function patchSwitcher(currentId) {
    const items = collection("connections");
    if (!items.length) return "";
    return `<label class="patch-switch">
      <span class="sr-only">接続図を切り替え</span>
      <select id="patchSelect">${items.map(item =>
        `<option value="${esc(item.id)}" ${item.id === currentId ? "selected" : ""}>${esc(item.title || item.name)}</option>`
      ).join("")}</select>
    </label>`;
  }

  function renderPatchPage(id) {
    const currentId = id || defaultPatchId();
    if (!currentId) {
      return pageHead("機材接続図", "", addBtn("connections")) +
        `<p class="empty">接続図はまだありません。</p>`;
    }
    return renderPatch(currentId);
  }

  function nodeCenter(node) {
    const box = patchNodeBox(node);
    return { x: Number(node.x) + box.w / 2, y: Number(node.y) + box.h / 2 };
  }

  function edgeClass(kind) {
    if (kind === "midi") return "edge-midi";
    if (kind === "audio") return "edge-audio";
    return "edge-other";
  }

  function labelRect(x, y, text) {
    const w = Math.min(220, Math.max(64, String(text).length * 8.2));
    return { x0: x - w / 2, y0: y - 16, x1: x + w / 2, y1: y + 6 };
  }

  function rectsOverlap(a, b) {
    return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  }

  function labelHitsNodes(rect, nodes) {
    return nodes.some(n => {
      const box = patchNodeBox(n);
      return rectsOverlap(rect, {
        x0: Number(n.x) - 6,
        y0: Number(n.y) - 6,
        x1: Number(n.x) + box.w + 6,
        y1: Number(n.y) + box.h + 6
      });
    });
  }

  function edgeLabelPos(from, to, nodes, text, taken, bounds, fromNode, toNode) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const candidates = [];
    function addAnchors(node) {
      if (!node) return;
      const box = patchNodeBox(node);
      const x = Number(node.x);
      const y = Number(node.y);
      candidates.push(
        { x: x + box.w / 2, y: y - 14 },
        { x: x + box.w / 2, y: y + box.h + 18 },
        { x: x + box.w + 80, y: y + 22 },
        { x: x - 80, y: y + 22 }
      );
    }
    addAnchors(fromNode);
    addAnchors(toNode);
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    [0.2, 0.35, 0.5, 0.65, 0.8].forEach(t => {
      const x = from.x + dx * t;
      const y = from.y + dy * t;
      [36, 56, 80].forEach(d => {
        candidates.push({ x: x + px * d, y: y + py * d });
        candidates.push({ x: x - px * d, y: y - py * d });
      });
    });
    for (let r = 30; r <= 200; r += 20) {
      for (let a = 0; a < 360; a += 24) {
        const rad = a * Math.PI / 180;
        candidates.push({ x: mx + Math.cos(rad) * r, y: my + Math.sin(rad) * r });
      }
    }
    const pad = 16;
    const found = candidates.find(p => {
      if (p.x < pad || p.y < 16 || p.x > bounds.width - pad || p.y > bounds.height - 10) return false;
      const rect = labelRect(p.x, p.y, text);
      if (labelHitsNodes(rect, nodes)) return false;
      return !taken.some(prev => rectsOverlap(rect, prev));
    });
    const pos = found || { x: Math.min(bounds.width - 90, Math.max(90, mx)), y: 22 };
    taken.push(labelRect(pos.x, pos.y, text));
    return pos;
  }

  function renderPatchSvg(diagram) {
    const nodes = diagram.nodes || [];
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const bounds = patchBoardSize(diagram);
    const taken = [];
    const defs = `
      <defs>
        <marker id="arr-audio" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#4F8FB8"></path></marker>
        <marker id="arr-midi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#7B6BB0"></path></marker>
        <marker id="arr-other" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#9AABBA"></path></marker>
      </defs>`;
    const lines = (diagram.edges || []).map(edge => {
      const a = byId[edge.from];
      const b = byId[edge.to];
      if (!a || !b) return "";
      const from = nodeCenter(a);
      const to = nodeCenter(b);
      const kind = edge.kind === "midi" ? "midi" : edge.kind === "audio" ? "audio" : "other";
      const dir = edge.direction || "forward";
      const markerEnd = dir === "back" ? "" : `url(#arr-${kind})`;
      const markerStart = dir === "back" || dir === "both" ? `url(#arr-${kind})` : "";
      const label = edgeLabelText(edge);
      const pos = edgeLabelPos(from, to, nodes, label, taken, bounds, a, b);
      const opacity = edge.unconfirmed ? "0.75" : "1";
      return `<line class="${edgeClass(edge.kind)}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" marker-end="${markerEnd}" marker-start="${markerStart}" opacity="${opacity}"></line>${label ? `<text class="patch-label" x="${pos.x}" y="${pos.y}" text-anchor="middle">${esc(label)}</text>` : ""}`;
    }).join("");
    return defs + lines;
  }

  function renderPatch(id, opts) {
    const diagram = findItem("connections", id);
    if (!diagram) return `<p class="empty">見つかりませんでした。</p>`;
    const connecting = patchConnect && patchConnect.diagramId === id;
    const size = patchBoardSize(diagram);
    const edgeList = (diagram.edges || []).map(edge => {
      const from = (diagram.nodes || []).find(n => n.id === edge.from);
      const to = (diagram.nodes || []).find(n => n.id === edge.to);
      const a = from ? patchItemRef(from) : null;
      const b = to ? patchItemRef(to) : null;
      const arrow = edge.direction === "back" ? "←" : edge.direction === "both" ? "↔" : "→";
      return `<div class="patch-edge-row">
        <span>${esc((a && a.name) || edge.from)} ${arrow} ${esc((b && b.name) || edge.to)}　${esc(edgeLabelText(edge))}</span>
        <button type="button" class="ghost-btn add-btn" data-act="patch-del-edge" data-id="${esc(id)}" data-edge="${esc(edge.id)}">削除</button>
      </div>`;
    }).join("") || `<p class="muted">まだ接続線はありません。</p>`;
    const nodeList = (diagram.nodes || []).map(node => {
      const item = patchItemRef(node);
      return `<div class="patch-edge-row">
        <a href="${esc(patchHref(node))}">${esc(item ? item.name : node.itemId)}</a>
        <button type="button" class="ghost-btn add-btn" data-act="patch-del-node" data-id="${esc(id)}" data-node="${esc(node.id)}">図から外す</button>
      </div>`;
    }).join("") || `<p class="muted">まだ機材はありません。</p>`;
    return (opts && opts.embed ? "" : pageHead("機材接続図", "", addBtn("connections") + `<span style="position:relative">${menuHtml("connections", diagram.id)}</span>`)) +
      patchSwitcher(id) +
      `<div class="patch-toolbar">
        <button type="button" class="ghost-btn add-btn" data-act="patch-add-gear" data-id="${esc(id)}">＋機材を追加</button>
        <button type="button" class="ghost-btn add-btn" data-act="patch-add-edge" data-id="${esc(id)}">${connecting ? "接続をやめる" : "接続を追加"}</button>
      </div>
      ${connecting ? `<p class="patch-hint">${patchConnect.fromId ? "接続先の機材を押してください" : "接続元の機材を押してください"}</p>` : `<p class="muted">機材を押すと詳細へ。ドラッグで位置を変えられます。スマホでは図を横にスライドできます。</p>`}
      <div class="patch-scroll">
        <div class="patch-board" id="patchBoard" data-diagram="${esc(id)}" style="width:${size.width}px;height:${size.height}px">
          <svg class="patch-svg" id="patchSvg" viewBox="0 0 ${size.width} ${size.height}">${renderPatchSvg(diagram)}</svg>
          ${(diagram.nodes || []).map(node => {
            const item = patchItemRef(node);
            const name = item ? item.name : node.itemId;
            const kind = item ? (item.categoryLabel || item.kindLabel || item.purpose || "") : "";
            const from = connecting && patchConnect.fromId === node.id ? " is-from" : "";
            const logic = node.itemType === "computers" && item && (item.installedSoftware || []).includes("logic-pro");
            return `<article class="patch-node${from}" data-patch-node="${esc(node.id)}" data-diagram="${esc(id)}" style="left:${Number(node.x)}px;top:${Number(node.y)}px">
              ${item ? thumbHtml(node.itemType, item, "thumb") : `<div class="thumb is-empty"><span class="thumb-fallback" aria-hidden="true"><img alt="" src="${esc(resolveAsset("assets/icons/image-placeholder.svg"))}?v=2" /></span></div>`}
              <h3>${esc(name)}</h3>
              <div class="card-meta"><span class="badge">${esc(kind)}</span>${logic ? `<span class="badge">Logic Pro</span>` : ""}</div>
            </article>`;
          }).join("")}
        </div>
      </div>
      <div class="patch-legend">
        <span><i></i>AUDIO</span>
        <span class="midi"><i></i>MIDI</span>
        <span>「未確認」は、つなぎ方がまだ確かでない線です</span>
      </div>
      <details class="patch-fold" open>
        <summary>接続</summary>
        <div class="patch-edges">${edgeList}</div>
      </details>
      <details class="patch-fold">
        <summary>機材一覧を見る</summary>
        <div class="patch-edges">${nodeList}</div>
      </details>`;
  }

  function nextPatchPos(diagram) {
    const i = (diagram.nodes || []).length;
    return { x: 16 + (i % 2) * 168, y: 16 + Math.floor(i / 2) * (NODE_H + 72) };
  }

  function savePatchDiagram(id, patch) {
    patchItem("connections", id, patch);
  }

  function openPatchAddGear(diagramId) {
    const diagram = findItem("connections", diagramId);
    if (!diagram) return;
    const used = new Set((diagram.nodes || []).map(n => `${n.itemType}:${n.itemId}`));
    const rows = [
      ...collection("gear").map(item => ({ itemType: "gear", item })),
      ...collection("computers").map(item => ({ itemType: "computers", item }))
    ].filter(row => !used.has(`${row.itemType}:${row.item.id}`));
    patchDialogMode = "nodes";
    $("patchDialogTitle").textContent = "機材を追加";
    $("patchSubmit").textContent = "図へ追加";
    $("patchError").textContent = "";
    $("patchFields").innerHTML = rows.length
      ? `<div class="check-grid">${rows.map(row => `
          <label class="check"><input type="checkbox" name="patchPick" value="${esc(row.itemType)}:${esc(row.item.id)}"> ${esc(row.item.name)}</label>
        `).join("")}</div>`
      : `<p class="muted">追加できる機材がありません。</p>`;
    $("patchForm").dataset.diagram = diagramId;
    $("patchDialog").showModal();
  }

  function openPatchEdgeForm(diagramId, fromId, toId) {
    patchDialogMode = "edge";
    $("patchDialogTitle").textContent = "接続を追加";
    $("patchSubmit").textContent = "つなぐ";
    $("patchError").textContent = "";
    const kinds = DTM.signalKinds || [{ id: "audio", label: "AUDIO" }, { id: "midi", label: "MIDI" }];
    $("patchFields").innerHTML = `
      <label><span>種類</span>
        <select id="patchKind">${kinds.map(k => `<option value="${esc(k.id)}">${esc(k.label)}</option>`).join("")}</select>
      </label>
      <label><span>矢印の向き</span>
        <select id="patchDir">
          <option value="forward">接続元 → 接続先</option>
          <option value="back">接続先 → 接続元</option>
          <option value="both">両方向</option>
        </select>
      </label>
      <label><span>ラベル（任意）</span><input id="patchLabel" placeholder="例：USB、LINE OUT、MIC IN" /></label>
      <label class="check"><input type="checkbox" id="patchUnconfirmed" checked> 未確認</label>
    `;
    $("patchForm").dataset.diagram = diagramId;
    $("patchForm").dataset.from = fromId;
    $("patchForm").dataset.to = toId;
    $("patchDialog").showModal();
  }

  function savePatchForm(event) {
    event.preventDefault();
    const diagramId = $("patchForm").dataset.diagram;
    const diagram = findItem("connections", diagramId);
    if (!diagram) return;
    if (patchDialogMode === "nodes") {
      const picked = checked("patchPick");
      if (!picked.length) {
        $("patchError").textContent = "追加する機材を選んでください。";
        return;
      }
      const nodes = [...(diagram.nodes || [])];
      picked.forEach(value => {
        const [itemType, itemId] = value.split(":");
        const pos = nextPatchPos({ nodes });
        nodes.push({ id: `n-${Date.now()}-${nodes.length}`, itemType, itemId, x: pos.x, y: pos.y });
      });
      savePatchDiagram(diagramId, { nodes });
    } else if (patchDialogMode === "edge") {
      const edges = [...(diagram.edges || []), {
        id: `e-${Date.now()}`,
        from: $("patchForm").dataset.from,
        to: $("patchForm").dataset.to,
        kind: val("patchKind") || "audio",
        direction: val("patchDir") || "forward",
        label: val("patchLabel"),
        unconfirmed: !!$("patchUnconfirmed")?.checked
      }];
      savePatchDiagram(diagramId, { edges });
      patchConnect = null;
    }
    $("patchDialog").close();
    render();
  }

  function togglePatchConnect(diagramId) {
    if (patchConnect && patchConnect.diagramId === diagramId) {
      patchConnect = null;
    } else {
      patchConnect = { diagramId, fromId: "" };
    }
    render();
  }

  function onPatchNodeTap(diagramId, nodeId) {
    if (patchConnect && patchConnect.diagramId === diagramId) {
      if (!patchConnect.fromId) {
        patchConnect.fromId = nodeId;
        render();
        return;
      }
      if (patchConnect.fromId === nodeId) return;
      openPatchEdgeForm(diagramId, patchConnect.fromId, nodeId);
      return;
    }
    const diagram = findItem("connections", diagramId);
    const node = (diagram?.nodes || []).find(n => n.id === nodeId);
    if (node) location.hash = patchHref(node);
  }

  function livePatchSvg(diagramId) {
    const svg = $("patchSvg");
    const diagram = findItem("connections", diagramId);
    if (!svg || !diagram) return;
    const nodes = (diagram.nodes || []).map(node => {
      const el = document.querySelector(`[data-patch-node="${node.id}"]`);
      if (!el) return node;
      return Object.assign({}, node, { x: parseFloat(el.style.left) || node.x, y: parseFloat(el.style.top) || node.y });
    });
    svg.innerHTML = renderPatchSvg(Object.assign({}, diagram, { nodes }));
    applyPatchBoardSize({ nodes });
  }

  function onPatchPointerDown(event) {
    const nodeEl = event.target.closest("[data-patch-node]");
    if (!nodeEl || event.target.closest("[data-act]")) return;
    const diagramId = nodeEl.dataset.diagram;
    const nodeId = nodeEl.dataset.patchNode;
    patchDrag = {
      diagramId,
      nodeId,
      startX: event.clientX,
      startY: event.clientY,
      origX: parseFloat(nodeEl.style.left) || 0,
      origY: parseFloat(nodeEl.style.top) || 0,
      moved: false,
      el: nodeEl
    };
    nodeEl.setPointerCapture?.(event.pointerId);
  }

  function onPatchPointerMove(event) {
    if (!patchDrag) return;
    const dx = event.clientX - patchDrag.startX;
    const dy = event.clientY - patchDrag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) patchDrag.moved = true;
    if (!patchDrag.moved) return;
    event.preventDefault();
    const x = Math.max(0, Math.min(1200, patchDrag.origX + dx));
    const y = Math.max(0, patchDrag.origY + dy);
    patchDrag.el.style.left = `${x}px`;
    patchDrag.el.style.top = `${y}px`;
    livePatchSvg(patchDrag.diagramId);
  }

  function onPatchPointerUp(event) {
    if (!patchDrag) return;
    const drag = patchDrag;
    patchDrag = null;
    if (!drag.moved) {
      onPatchNodeTap(drag.diagramId, drag.nodeId);
      return;
    }
    const diagram = findItem("connections", drag.diagramId);
    if (!diagram) return;
    const x = parseFloat(drag.el.style.left) || 0;
    const y = parseFloat(drag.el.style.top) || 0;
    const nodes = (diagram.nodes || []).map(node => node.id === drag.nodeId ? Object.assign({}, node, { x, y }) : node);
    savePatchDiagram(drag.diagramId, { nodes });
  }

  function norm(s) {
    return String(s ?? "").toLowerCase().replace(/\s+/g, "");
  }

  function blob(item) {
    return [
      item.name, item.nameJa, item.reading, item.maker, item.country,
      item.categoryLabel, item.kindLabel, item.kind,
      item.what, item.summary, item.listSummary, item.description, item.detail, item.doesWhat, item.purpose, item.owner, item.canDo,
      item.homeUse, item.memo, item.parts, item.tools, item.softwareNeed, item.howTo, item.purchasePrice, item.purchaseDate, ...(item.aliases || []), ...(item.functions || []), ...(item.specialties || [])
    ].join(" ");
  }

  function searchAll(query) {
    const q = norm(query);
    if (!q) return { terms: [], gear: [], software: [], computers: [], brands: [], diy: [] };
    const hit = (list) => list.filter(item =>
      norm(blob(item)).includes(q) || (item.aliases || []).some(a => norm(a).includes(q))
    );
    const rank = (item) => {
      if (norm(item.name) === q) return 0;
      if ((item.aliases || []).some(alias => norm(alias) === q)) return 1;
      if (norm(item.name).includes(q)) return 2;
      return 3;
    };
    const sorted = (list) => hit(list).slice().sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name), "ja"));
    return {
      terms: sorted(glossaryTerms()),
      gear: sorted(collection("gear")),
      software: sorted(collection("software")),
      computers: sorted(collection("computers")),
      brands: sorted(collection("brands")),
      diy: sorted(collection("diy"))
    };
  }

  function renderSearch(query) {
    const q = query.trim();
    const results = searchAll(q);
    const featured = results.terms[0];
    let html = pageHead("検索", q ? `「${q}」` : "");
    if (!q) return html + `<p class="empty">キーワードを入力してください。</p>`;
    if (featured) {
      const own = ownershipForTerm(featured);
      html += `<section class="search-term">
        <h2>【${esc(featured.name)}${featured.aliases && featured.aliases[0] ? `／${esc(featured.aliases[0])}` : ""}】<span class="badge kind-term">用語</span></h2>
        <h3>これは何？</h3>
        <p>${esc(featured.summary)}</p>
        <h3 style="margin-top:14px">あなたは持っている？</h3>
        <ul class="own-list">${(() => {
          const lines = [];
          if (featured.dedicated) {
            if (own.dedicated.length) own.dedicated.forEach(item => {
              const href = findItem("gear", item.id) ? `#/gear/${item.id}` : `#/software/${item.id}`;
              lines.push(`<li><a href="${esc(href)}">${esc(item.name)}</a>：${esc((DTM.statusLabels || {})[item.status] || "")}</li>`);
            });
            else lines.push(`<li>${esc(featured.dedicated.label)}：現在登録なし</li>`);
          }
          own.builtinGear.forEach(item => lines.push(`<li><a href="#/gear/${esc(item.id)}">${esc(item.name)}</a>：${esc(featured.name)}機能あり</li>`));
          own.builtinSoft.forEach(item => lines.push(`<li><a href="#/software/${esc(item.id)}">${esc(item.name)}</a>：${esc(featured.name)}機能あり</li>`));
          return lines.join("") || "<li>現在登録なし</li>";
        })()}</ul>
        <p style="margin-top:12px"><a class="chip" href="${esc(termHref(featured))}">用語の詳細を見る</a></p>
      </section>`;
    }
    const restTerms = featured ? results.terms.slice(1) : results.terms;
    const block = (title, cat, items, type, hrefFn, kindBadge, kindClass, extraFn) => items.length
      ? catSection(cat, title, `<div class="item-list">${items.map(item => itemRow(type, item, hrefFn(item), Object.assign({ hub: true, kindBadge, kindClass }, extraFn ? extraFn(item) : {}))).join("")}</div>`)
      : "";
    html += block("用語", "inst-terms", restTerms, "terms", item => termHref(item), "用語", "term", item => ({ usePrefix: false, use: groupTitle("terms", termCatId(item)), blurb: termListText(item) }));
    html += block("メーカー・ブランド", "brands", results.brands, "brands", item => `#/brands/${item.id}`, "メーカー", "brand", () => ({ usePrefix: false }));
    html += block("製品", "gear-other", results.gear, "gear", item => `#/gear/${item.id}`, "製品", "product");
    html += block("ソフト", "soft-suite", results.software, "software", item => `#/software/${item.id}`, "ソフト", "soft");
    html += block("パソコン・端末", "comp-pc", results.computers, "computers", item => `#/computers/${item.id}`, "端末", "device");
    html += block("手作り", "diy-wishlist", results.diy, "diy", item => `#/diy/${item.id}`, "自作", "product");
    if (!featured && !results.gear.length && !results.software.length && !results.computers.length && !results.terms.length && !results.brands.length && !results.diy.length) {
      html += `<p class="empty">一致するものはまだありません。</p>`;
    }
    return html;
  }

  function renderEnv(params) {
    let tab = params.get("tab") || "gear";
    if (tab === "apple" || tab === "computers") {
      location.hash = "#/env?tab=gear";
      return "";
    }
    if (tab === "apps") {
      location.hash = "#/env?tab=software";
      return "";
    }
    const tabs = [
      { id: "gear", title: "機材・PC等" },
      { id: "software", title: "ソフト・音源" },
      { id: "patch", title: "接続図" }
    ];
    const current = tabs.some(row => row.id === tab) ? tab : "gear";
    let body = "";
    if (current === "patch") {
      const id = params.get("id") || defaultPatchId();
      body = id ? renderPatch(id, { embed: true }) : `<p class="empty">接続図はまだありません。</p>`;
    } else if (current === "software") {
      body = appsListBody();
    } else {
      body = envOwnedListBody();
    }
    const actions = current === "patch"
      ? addBtn("connections")
      : current === "software"
        ? addBtn("software") + addBtn("instrument", "＋ 音源")
        : addBtn("gear") + addBtn("computers", "＋ 端末");
    return pageHead("我が家のDTM環境", "", actions) +
      hubTabs("env", tabs, current) +
      body;
  }

  function appsSoftRow(item, childrenOf) {
    const kids = childrenOf(item.id);
    const use = item.purpose || item.useLabel || item.what || "";
    const blurbRaw = item.listSummary || item.summary || item.what || item.canDo || "";
    return itemRow("software", item, `#/software/${item.id}`, {
      hub: true,
      hideEmptyThumb: true,
      hideKind: true,
      usePrefix: false,
      use,
      blurb: clipListText(blurbRaw && blurbRaw !== use ? blurbRaw : "", 90),
      childNote: kids.length ? () => kids.map(child => child.name).join(" ／ ") : null
    });
  }

  function renderApps() {
    return appsListBody();
  }

  function appsListBody() {
    const all = collection("software");
    const roots = all.filter(item => !item.parentId);
    const childrenOf = (id) => all.filter(item => item.parentId === id);
    const daws = roots.filter(item => item.kind === "daw");
    const plugins = roots.filter(item => item.kind === "suite" || item.kind === "plugin" || item.kind === "video");
    const extraSoft = roots.filter(item => !["daw", "suite", "plugin", "instrument", "video"].includes(item.kind));
    const pluginItems = plugins.concat(extraSoft);
    const instruments = roots.filter(item => item.kind === "instrument");
    const dawRows = daws.length
      ? catSection("soft-daw", "DAW", `<div class="item-list">${daws.map(item => appsSoftRow(item, childrenOf)).join("")}</div>`)
      : "";
    const pluginRows = pluginItems.length
      ? catSection("soft-suite", "プラグイン・ソフト", `<div class="item-list">${pluginItems.map(item => appsSoftRow(item, childrenOf)).join("")}</div>`)
      : "";
    const instRows = instruments.length
      ? catSection("soft-instrument", "ソフト音源", `<div class="item-list">${instruments.map(instrumentRowHtml).join("")}</div>`)
      : "";
    return dawRows + pluginRows + instRows;
  }

  function brandsBody() {
    const items = collection("brands").slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "ja"));
    return items.length
      ? catSection("brands", "メーカー・ブランド", `<div class="item-list">${items.map(item => itemRow("brands", item, `#/brands/${item.id}`, { hub: true, usePrefix: false, kindBadge: "メーカー", kindClass: "brand" })).join("")}</div>`)
      : `<p class="empty">まだ登録がありません。</p>`;
  }

  function productsBody() {
    const computers = collection("computers");
    const gear = collection("gear");
    const soft = collection("software");
    const groups = computerKindGroups(computers)
      .concat(gearKindGroups(gear))
      .concat(soft.length ? [{ title: "ソフト", cat: "soft-suite", type: "software", items: sortProductsByMaker(soft) }] : []);
    return renderProductGroups(groups, { hub: true, kindBadge: "製品", kindClass: "product" });
  }

  function renderDict(params) {
    const tab = params.get("tab") || "terms";
    const tabs = [
      { id: "terms", title: "用語" },
      { id: "products", title: "製品" },
      { id: "brands", title: "メーカー・ブランド" }
    ];
    const current = tabs.some(row => row.id === tab) ? tab : "terms";
    const body = current === "brands" ? brandsBody()
      : current === "products" ? productsBody()
      : termsBody();
    const actions = current === "brands" ? addBtn("brands") : current === "products" ? addBtn("gear") + addBtn("computers", "＋ 端末") : addBtn("terms");
    return pageHead("DTM辞典", "", actions) +
      hubTabs("dict", tabs, current) +
      body;
  }

  function renderBuy() {
    return renderPurchase();
  }

  function parseRoute() {
    return routeFromHash(location.hash);
  }

  function routeFromHash(hash) {
    const raw = String(hash || "").replace(/^#/, "") || "/";
    const [pathPart, queryPart] = raw.split("?");
    const parts = pathPart.split("/").filter(Boolean);
    const params = new URLSearchParams(queryPart || "");
    return { parts, q: params.get("q") || "", params };
  }

  function snapshotRoute(route) {
    const src = route || parseRoute();
    const params = src.params ? new URLSearchParams(src.params.toString()) : new URLSearchParams();
    return {
      parts: (src.parts || []).slice(),
      q: src.q || params.get("q") || "",
      tab: src.tab || params.get("tab") || "",
      params
    };
  }

  function isDetailRoute(route) {
    if (!route || !route.parts || !route.parts[1]) return false;
    return ["terms", "gear", "brands", "software", "computers", "diy"].includes(route.parts[0]);
  }

  function listRestoreKey(route) {
    if (!route || !route.parts || !route.parts.length) return "";
    const first = route.parts[0];
    if (isDetailRoute(route)) return "";
    const params = route.params || new URLSearchParams();
    const tab = route.tab || params.get("tab") || "";
    const q = route.q || params.get("q") || "";
    const kind = params.get("kind") || "";
    const power = params.get("power") || "";
    if (first === "dict") return `dict:${tab || "terms"}`;
    if (first === "env") return `env:${tab || "gear"}`;
    if (first === "purchase" || first === "buy") return "purchase";
    if (first === "apps") return "env:software";
    if (first === "search") return `search:${q}`;
    if (first === "diy") return `diy:${kind}:${power}`;
    if (first === "terms") return "terms";
    if (first === "brands") return "brands";
    if (first === "gear") return "gear";
    if (first === "software") return "software";
    if (first === "computers") return "computers";
    if (first === "instruments") return "instruments";
    return "";
  }

  function listHrefOf(el) {
    if (!el) return "";
    const raw = el.getAttribute("data-href") || el.getAttribute("href") || "";
    if (!raw) return "";
    return raw.startsWith("#") ? raw : `#${raw.replace(/^#/, "")}`;
  }

  function itemIdFromEl(el, href) {
    if (el && el.dataset && el.dataset.itemId) return el.dataset.itemId;
    const route = routeFromHash(href || "");
    return isDetailRoute(route) ? (route.parts[1] || "") : "";
  }

  function persistListRestore(state) {
    lastListState = state;
    try { sessionStorage.setItem(LIST_RESTORE_STORE, JSON.stringify(state)); } catch {}
    try {
      history.replaceState(Object.assign({}, history.state || {}, { listRestore: state }), "", location.href);
    } catch {}
  }

  function readStoredListRestore() {
    if (lastListState && lastListState.key) return lastListState;
    try {
      const hist = history.state && history.state.listRestore;
      if (hist && hist.key) return hist;
    } catch {}
    try {
      const raw = sessionStorage.getItem(LIST_RESTORE_STORE);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.key) return parsed;
    } catch {}
    return null;
  }

  function captureListRestoreFromEl(el) {
    if (!el) return;
    const href = listHrefOf(el);
    if (!isDetailRoute(routeFromHash(href))) return;
    const current = snapshotRoute(parseRoute());
    const key = listRestoreKey(current);
    if (!key) return;
    const params = current.params || new URLSearchParams();
    persistListRestore({
      key,
      scrollY: window.scrollY,
      itemId: itemIdFromEl(el, href),
      href,
      q: current.q || "",
      tab: current.tab || "",
      kind: params.get("kind") || "",
      power: params.get("power") || "",
      filters: params.toString()
    });
  }

  function rememberLeavingList(route) {
    const prev = lastRenderedRoute;
    const key = listRestoreKey(prev);
    if (!key || !isDetailRoute(route)) return;
    if (lastListState && lastListState.key === key && lastListState.itemId) return;
    const params = (prev && prev.params) || new URLSearchParams();
    persistListRestore({
      key,
      scrollY: window.scrollY,
      itemId: (route.parts && route.parts[1]) || "",
      href: `#/${route.parts[0]}/${route.parts[1]}`,
      q: (prev && prev.q) || "",
      tab: (prev && prev.tab) || "",
      kind: params.get("kind") || "",
      power: params.get("power") || "",
      filters: params.toString()
    });
  }

  function findRestoredCard(state) {
    if (!state) return null;
    const root = $("app") || document;
    const escape = (value) => (window.CSS && CSS.escape) ? CSS.escape(value) : String(value).replace(/"/g, '\\"');
    if (state.itemId) {
      const byId = root.querySelector(`[data-item-id="${escape(state.itemId)}"]`);
      if (byId) return byId;
    }
    if (state.href) {
      const byHref = root.querySelector(`[data-href="${escape(state.href)}"]`);
      if (byHref) return byHref;
    }
    return null;
  }

  function cardInView(card) {
    const rect = card.getBoundingClientRect();
    const topGap = 96;
    return rect.top >= topGap && rect.bottom <= window.innerHeight - 12;
  }

  function applyListRestore(state) {
    if (!state) return;
    let highlighted = false;
    const pin = (force) => {
      const card = findRestoredCard(state);
      if (card) {
        const savedY = Number(state.scrollY) || 0;
        if (force || !cardInView(card)) {
          card.scrollIntoView({ block: "center", inline: "nearest" });
        }
        if (savedY > 0 && !cardInView(card)) window.scrollTo(0, savedY);
        if (!highlighted) {
          card.classList.add("is-just-returned");
          window.setTimeout(() => card.classList.remove("is-just-returned"), 900);
          highlighted = true;
        }
      } else if (Number(state.scrollY) > 0) {
        window.scrollTo(0, state.scrollY);
      }
      syncChromeCompact();
    };
    pin(true);
    requestAnimationFrame(() => pin(true));
    [50, 150, 350, 800].forEach(ms => window.setTimeout(() => pin(false), ms));
    const app = $("app");
    if (app) {
      app.querySelectorAll("img").forEach(img => {
        if (!img.complete) img.addEventListener("load", () => pin(false), { once: true });
      });
    }
  }

  function currentHash() {
    const hash = location.hash || "";
    return (!hash || hash === "#") ? "#/" : hash;
  }

  function isDefaultLaunchHash() {
    const hash = location.hash || "";
    return !hash || hash === "#" || hash === "#/";
  }

  function canonicalizeHash(hash) {
    const route = routeFromHash(hash);
    const first = route.parts[0] || "";
    const id = route.parts[1] || "";
    const params = route.params || new URLSearchParams();
    const tab = route.tab || params.get("tab") || "";
    if (!first) return "#/";
    if (first === "apps" || first === "instruments") return "#/env?tab=software";
    if (first === "software" && !id) return "#/env?tab=software";
    if (first === "computers" && !id) return "#/env?tab=gear";
    if (first === "howto") return id ? `#/gear/${id}` : "#/env?tab=gear";
    if (first === "apple") return "#/env?tab=gear";
    if (first === "purchase") return "#/buy";
    if (first === "buy" && tab === "notes") return "#/";
    if (first === "patch") {
      return id
        ? `#/env?tab=patch&id=${encodeURIComponent(id)}`
        : "#/env?tab=patch";
    }
    return String(hash || "#/").startsWith("#") ? String(hash) : `#${hash}`;
  }

  function hashesEqual(a, b) {
    return canonicalizeHash(a) === canonicalizeHash(b);
  }

  function hashFromListKey(key, state) {
    const raw = String(key || "");
    if (raw === "purchase") return "#/buy";
    if (raw === "apps") return "#/env?tab=software";
    if (raw.indexOf("dict:") === 0) return `#/dict?tab=${encodeURIComponent(raw.slice(5) || "terms")}`;
    if (raw.indexOf("env:") === 0) {
      const tab = raw.slice(4) || "gear";
      if (tab === "patch") {
        const id = state && (state.patchId || "");
        return id ? `#/env?tab=patch&id=${encodeURIComponent(id)}` : "#/env?tab=patch";
      }
      return `#/env?tab=${encodeURIComponent(tab)}`;
    }
    if (raw.indexOf("search:") === 0) {
      const q = raw.slice(7);
      return q ? `#/search?q=${encodeURIComponent(q)}` : "#/search";
    }
    if (raw.indexOf("diy:") === 0) {
      const bits = raw.split(":");
      const params = new URLSearchParams();
      if (bits[1]) params.set("kind", bits[1]);
      if (bits[2]) params.set("power", bits[2]);
      const q = params.toString();
      return q ? `#/diy?${q}` : "#/diy";
    }
    if (raw === "terms") return "#/dict?tab=terms";
    if (raw === "brands") return "#/dict?tab=brands";
    if (raw === "gear") return "#/env?tab=gear";
    if (raw === "software" || raw === "instruments") return "#/env?tab=software";
    if (raw === "computers") return "#/env?tab=gear";
    if (raw === "diy") return "#/diy";
    return "";
  }

  function defaultListHashForDetail(type, state) {
    const key = state && state.listKey;
    const fromKey = hashFromListKey(key, state);
    if (fromKey) return fromKey;
    if (type === "terms") return "#/dict?tab=terms";
    if (type === "brands") return "#/dict?tab=brands";
    if (type === "software") return "#/env?tab=software";
    if (type === "computers" || type === "gear") return "#/env?tab=gear";
    if (type === "diy") return "#/diy";
    if (type === "patch" || type === "connections") return "#/env?tab=patch";
    return "#/";
  }

  function detailTypeOf(route) {
    if (!route || !route.parts || !route.parts[0]) return "";
    const first = route.parts[0];
    if (first === "patch" && route.parts[1]) return "connections";
    if (isDetailRoute(route)) {
      return first === "terms" ? "terms" : first;
    }
    if (first === "env") {
      const tab = route.tab || (route.params && route.params.get("tab")) || "";
      const id = route.params && route.params.get("id");
      if (tab === "patch" && id) return "connections";
    }
    return "";
  }

  function detailIdOf(route) {
    if (!route || !route.parts) return "";
    if (route.parts[1] && (isDetailRoute(route) || route.parts[0] === "patch")) return route.parts[1];
    if (route.parts[0] === "env") return (route.params && route.params.get("id")) || "";
    return "";
  }

  function listHashFitsType(hash, type) {
    const route = routeFromHash(hash || "");
    const first = route.parts[0] || "";
    const tab = route.tab || (route.params && route.params.get("tab")) || "";
    if (type === "terms") return first === "dict" && (!tab || tab === "terms");
    if (type === "brands") return first === "dict" && tab === "brands";
    if (type === "software") return (first === "env" && tab === "software") || (first === "dict" && tab === "products") || first === "buy" || first === "search";
    if (type === "gear" || type === "computers") return first === "env" || (first === "dict" && tab === "products") || first === "buy" || first === "search";
    if (type === "diy") return first === "diy";
    if (type === "connections") return first === "env" && tab === "patch";
    return !!first;
  }

  function resolveLastViewHash(state) {
    if (!state || !state.hash) return "#/";
    let hash = canonicalizeHash(state.hash);
    let route = routeFromHash(hash);
    const type = detailTypeOf(route);
    const id = detailIdOf(route);
    if (type && id) {
      const item = findItem(type, id);
      if (!item) {
        const listHash = canonicalizeHash(state.listHash || "");
        hash = listHashFitsType(listHash, type)
          ? listHash
          : defaultListHashForDetail(type, {});
        route = routeFromHash(hash);
      } else if (type === "terms") {
        const dest = termRedirect(item);
        if (dest) hash = dest;
      }
    }
    if (!hash || hash === "#") return "#/";
    const fallbackType = detailTypeOf(routeFromHash(hash));
    const fallbackId = detailIdOf(routeFromHash(hash));
    if (fallbackType && fallbackId && !findItem(fallbackType, fallbackId)) return "#/";
    return hash;
  }

  function listHashFromCurrent() {
    const route = parseRoute();
    const key = listRestoreKey(route);
    if (key) return currentHash();
    if (lastListState && lastListState.key) {
      return hashFromListKey(lastListState.key, lastViewState) || currentHash();
    }
    if (isDetailRoute(route) || (route.parts[0] === "patch" && route.parts[1])) {
      return defaultListHashForDetail(route.parts[0], lastViewState || {});
    }
    return currentHash();
  }

  function readLastViewState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LAST_VIEW_KEY) || "null");
      if (!parsed || typeof parsed !== "object" || !parsed.hash) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function captureLastViewState() {
    const route = parseRoute();
    const params = route.params || new URLSearchParams();
    const onList = !!listRestoreKey(route);
    const list = lastListState && lastListState.key ? lastListState : null;
    lastViewState = {
      hash: currentHash(),
      scrollY: window.scrollY || 0,
      itemId: isDetailRoute(route) || (route.parts[0] === "patch" && route.parts[1])
        ? (route.parts[1] || "")
        : "",
      listHash: onList ? currentHash() : listHashFromCurrent(),
      listKey: onList ? listRestoreKey(route) : (list && list.key) || "",
      listScrollY: onList ? (window.scrollY || 0) : (list ? Number(list.scrollY) || 0 : 0),
      listItemId: onList ? (list && list.itemId) || "" : (list && list.itemId) || "",
      listHref: list && list.href || "",
      q: route.q || params.get("q") || "",
      tab: route.tab || params.get("tab") || "",
      kind: params.get("kind") || "",
      power: params.get("power") || "",
      filters: params.toString(),
      patchId: (route.parts[0] === "patch" && route.parts[1]) || params.get("id") || "",
      lastHub: lastHub || hubFromRoute(route.parts) || "",
      savedAt: Date.now()
    };
    try { localStorage.setItem(LAST_VIEW_KEY, JSON.stringify(lastViewState)); } catch {}
  }

  function scheduleViewSave() {
    clearTimeout(viewSaveTimer);
    viewSaveTimer = window.setTimeout(() => captureLastViewState(), 180);
  }

  function flushViewSave() {
    clearTimeout(viewSaveTimer);
    captureLastViewState();
  }

  function hydrateListRestoreFromView(state) {
    if (!state || !state.listKey) return;
    persistListRestore({
      key: state.listKey,
      scrollY: Number(state.listScrollY) || 0,
      itemId: state.listItemId || state.itemId || "",
      href: state.listHref || "",
      q: state.q || "",
      tab: state.tab || "",
      kind: state.kind || "",
      power: state.power || "",
      filters: state.filters || ""
    });
  }

  function applyPageScroll(y) {
    const top = Number(y) || 0;
    const pin = () => {
      window.scrollTo(0, top);
      syncChromeCompact();
    };
    pin();
    requestAnimationFrame(pin);
    [50, 150, 350, 800].forEach(ms => window.setTimeout(pin, ms));
    const app = $("app");
    if (app) {
      app.querySelectorAll("img").forEach(img => {
        if (!img.complete) img.addEventListener("load", pin, { once: true });
      });
    }
  }

  function applyPendingBootView() {
    const state = pendingBootView;
    if (!state) return false;
    const now = canonicalizeHash(currentHash());
    const dest = canonicalizeHash(resolveLastViewHash(state));
    if (now !== dest && now !== canonicalizeHash(state.hash)) return false;
    pendingBootView = null;
    bootHash = now;
    window.setTimeout(() => {
      if (bootHash && hashesEqual(currentHash(), bootHash)) bootHash = "";
    }, 1200);
    const route = parseRoute();
    const onList = !!listRestoreKey(route);
    if (onList) {
      applyListRestore({
        key: state.listKey,
        scrollY: Number(state.listScrollY != null ? state.listScrollY : state.scrollY) || 0,
        itemId: state.listItemId || "",
        href: state.listHref || ""
      });
    } else {
      applyPageScroll(state.scrollY);
    }
    return true;
  }

  function prepareLastViewBoot() {
    const state = readLastViewState();
    if (state) {
      lastViewState = state;
      if (state.lastHub) lastHub = state.lastHub;
      hydrateListRestoreFromView(state);
    }
    if (isDefaultLaunchHash()) {
      if (!state) return;
      const dest = resolveLastViewHash(state);
      pendingBootView = Object.assign({}, state, { hash: dest });
      if (dest && dest !== "#/") {
        try {
          history.replaceState(history.state || {}, "", dest);
        } catch {
          location.hash = dest;
        }
      }
      return;
    }
    const current = currentHash();
    const resolved = resolveLastViewHash(Object.assign({}, state || {}, { hash: current }));
    if (canonicalizeHash(resolved) !== canonicalizeHash(current)) {
      pendingBootView = Object.assign({}, state || {}, { hash: resolved, scrollY: 0 });
      try {
        history.replaceState(history.state || {}, "", resolved);
      } catch {
        location.hash = resolved;
      }
      return;
    }
    if (state && hashesEqual(state.hash, current)) pendingBootView = state;
  }

  function render() {
    closeMenus();
    const { parts, q, params } = parseRoute();
    const route = { parts, q, params };
    rememberLeavingList(route);
    const restoreKey = listRestoreKey(route);
    const stored = readStoredListRestore();
    const shouldRestore = !!(stored && isDetailRoute(lastRenderedRoute) && stored.key === restoreKey);
    const restoreState = shouldRestore ? stored : null;
    if (patchConnect) {
      const onOldPatch = parts[0] === "patch" && parts[1] === patchConnect.diagramId;
      const envId = params.get("id") || defaultPatchId();
      const onEnvPatch = parts[0] === "env" && params.get("tab") === "patch" && envId === patchConnect.diagramId;
      if (!onOldPatch && !onEnvPatch) patchConnect = null;
    }
    const isHome = parts.length === 0;
    $("headerSearchForm").hidden = isHome;
    renderAppNav(parts);
    const app = $("app");
    let view = "";
    if (isHome) view = renderHome();
    else if (parts[0] === "search") view = renderSearch(q);
    else if (parts[0] === "env") view = renderEnv(params);
    else if (parts[0] === "apps") {
      location.hash = "#/env?tab=software";
      return;
    }
    else if (parts[0] === "dict") view = renderDict(params);
    else if (parts[0] === "buy") {
      if (params.get("tab") === "notes") {
        location.hash = "#/";
        return;
      }
      view = renderBuy();
    }
    else if (parts[0] === "gear" && parts[1]) view = renderGearDetail(parts[1], false);
    else if (parts[0] === "gear") view = renderGearList();
    else if (parts[0] === "howto" && parts[1]) {
      location.hash = `#/gear/${parts[1]}`;
      return;
    }
    else if (parts[0] === "howto") {
      location.hash = "#/env?tab=gear";
      return;
    }
    else if (parts[0] === "computers" && parts[1]) view = renderComputerDetail(parts[1]);
    else if (parts[0] === "computers") view = renderComputers();
    else if (parts[0] === "software" && parts[1]) view = renderSoftwareDetail(parts[1]);
    else if (parts[0] === "software") {
      location.hash = "#/env?tab=software";
      return;
    }
    else if (parts[0] === "instruments") {
      location.hash = "#/env?tab=software";
      return;
    }
    else if (parts[0] === "terms" && parts[1]) {
      const term = findItem("terms", parts[1]);
      const dest = termRedirect(term);
      if (dest) {
        location.hash = dest;
        return;
      }
      view = renderTermDetail(parts[1]);
    }
    else if (parts[0] === "terms") view = renderTerms();
    else if (parts[0] === "brands" && parts[1]) view = renderBrandDetail(parts[1]);
    else if (parts[0] === "brands") view = renderBrands();
    else if (parts[0] === "purchase") view = renderPurchase();
    else if (parts[0] === "diy" && parts[1]) view = renderDiyDetail(parts[1]);
    else if (parts[0] === "diy") view = renderDiy();
    else if (parts[0] === "apple") {
      if (!SHOW_APPLE_WORKFLOWS) {
        location.hash = "#/env?tab=gear";
        return;
      }
      view = renderApple();
    }
    else if (parts[0] === "patch" && parts[1]) view = renderPatchPage(parts[1]);
    else if (parts[0] === "patch") {
      const id = defaultPatchId();
      if (id) {
        location.hash = `#/patch/${id}`;
        return;
      }
      view = renderPatchPage();
    }
    else view = renderHome();
    app.innerHTML = view;
    const headerInput = $("headerSearchInput");
    if (!isHome && headerInput) headerInput.value = parts[0] === "search" ? q : "";
    if (restoreState) applyListRestore(restoreState);
    else if (pendingBootView) {
      applyPendingBootView();
      pendingBootView = null;
    }
    else if (!patchConnect) {
      if (!(bootHash && hashesEqual(currentHash(), bootHash))) {
        bootHash = "";
        window.scrollTo(0, 0);
      }
    }
    lastRenderedRoute = snapshotRoute(route);
    syncChromeCompact();
    fitPatchBoard();
    captureLastViewState();
  }

  function fitPatchBoard() {
    const board = $("patchBoard");
    if (!board) return;
    const diagram = findItem("connections", board.dataset.diagram);
    if (!diagram) return;
    const svg = $("patchSvg");
    if (svg) svg.innerHTML = renderPatchSvg(diagram);
    applyPatchBoardSize(diagram);
  }

  function goSearch(value) {
    const q = String(value || "").trim();
    location.hash = q ? `#/search?q=${encodeURIComponent(q)}` : "#/search";
  }

  function getYouTubeId(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      if (host === "youtu.be") return u.pathname.split("/").filter(Boolean)[0] || "";
      if (host.endsWith("youtube.com")) {
        if (u.searchParams.get("v")) return u.searchParams.get("v");
        const parts = u.pathname.split("/").filter(Boolean);
        const embed = parts.indexOf("embed");
        if (embed >= 0) return parts[embed + 1] || "";
        const shorts = parts.indexOf("shorts");
        if (shorts >= 0) return parts[shorts + 1] || "";
      }
    } catch {
      return "";
    }
    return "";
  }

  function parseTime(value) {
    const text = String(value || "").trim();
    if (!text) return 0;
    if (/^\d+$/.test(text)) return Number(text);
    const parts = text.split(":").map(Number);
    if (parts.some(n => Number.isNaN(n))) return NaN;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return NaN;
  }

  function formatTime(sec) {
    const n = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(n / 60);
    const s = n % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function fillVideoCategories(selected) {
    const select = $("videoCategoryInput");
    select.innerHTML = (DTM.videoCategories || []).map(cat =>
      `<option ${cat === selected ? "selected" : ""}>${esc(cat)}</option>`
    ).join("");
  }

  function val(id) {
    const el = $(id);
    return el ? String(el.value || "").trim() : "";
  }

  function checked(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);
  }

  function checkList(name, items, selected) {
    const sel = new Set(selected || []);
    if (!items.length) return `<p class="muted">まだ登録がありません。</p>`;
    return `<div class="check-grid">${items.map(item => `
      <label class="check"><input type="checkbox" name="${esc(name)}" value="${esc(item.id)}" ${sel.has(item.id) ? "checked" : ""}> ${esc(item.name || item.title || "")}</label>
    `).join("")}</div>`;
  }

  function statusSelect(selected) {
    const current = selected === "planned" ? "considering" : selected;
    const opts = OWNER_STATUS.map(([k, v]) =>
      `<option value="${esc(k)}" ${k === current ? "selected" : ""}>${esc(v)}</option>`
    ).join("");
    return `<label><span>所有状態</span><select id="editStatus">${opts}</select></label>`;
  }

  function categoryField(selectId, kind, selectedId, label) {
    const groups = kind === "gear" ? gearGroups() : kind === "software" ? softwareKinds() : termCategories();
    const opts = groups.map(g => `<option value="${esc(g.id)}" ${g.id === selectedId ? "selected" : ""}>${esc(g.title)}</option>`).join("");
    return `<label>
      <span>${esc(label || "カテゴリー")}</span>
      <select id="${esc(selectId)}">${opts}</select>
      <button type="button" class="cat-add-btn" data-act="add-category" data-cat="${esc(kind)}" data-select="${esc(selectId)}">＋新しいカテゴリーを追加</button>
    </label>`;
  }

  function photoField() {
    return `<label><span>写真</span><input id="editPhoto" type="file" accept="image/*" /></label>`;
  }

  function field(id, label, value, tag, placeholder) {
    if (tag === "textarea") {
      return `<label><span>${esc(label)}</span><textarea id="${esc(id)}" rows="3" placeholder="${esc(placeholder || "")}">${esc(value || "")}</textarea></label>`;
    }
    return `<label><span>${esc(label)}</span><input id="${esc(id)}" value="${esc(value || "")}" placeholder="${esc(placeholder || "")}" /></label>`;
  }

  function gearForm(item, defaults) {
    const it = item || {};
    const status = defaults?.status || it.status || "owned";
    return photoField() +
      field("editName", "製品名", it.name, "", "例：MOTU M2") +
      field("editMaker", "メーカー", it.maker) +
      categoryField("editGroup", "gear", it.group || "other") +
      statusSelect(status) +
      field("editUseLabel", "用途", it.useLabel, "", "例：サンプラー／ビート制作") +
      field("editSummary", "一言でいうと", it.summary, "textarea", "1〜2文で") +
      field("editWhat", "これは何？", it.what, "textarea") +
      field("editCanDo", "何ができる？", it.canDo, "textarea") +
      field("editWhen", "どういう時に使う？", it.whenToUse, "textarea") +
      field("editHome", "我が家ではどう使える？", it.homeUse, "textarea", "1行が1項目") +
      `<div class="field-block"><span>接続する相手</span>${checkList("editConn", collection("gear").concat(collection("computers")), (it.connections || []).concat(it.connectedComputers || []))}</div>` +
      `<div class="field-block"><span>関連機材</span>${checkList("editRelatedGear", collection("gear"), it.relatedGear)}</div>` +
      `<div class="field-block"><span>関連用語</span>${checkList("editTerms", collection("terms"), it.relatedTerms)}</div>` +
      `<div class="field-block"><span>関連ソフト</span>${checkList("editRelatedSoft", collection("software"), it.relatedSoftware)}</div>` +
      field("editMemo", "メモ", it.memo, "textarea");
  }

  function computerForm(item) {
    const it = item || {};
    return photoField() +
      field("editOwner", "所有者", it.owner) +
      field("editMaker", "メーカー", it.maker) +
      field("editName", "製品名", it.name, "", "例：MacBook Pro") +
      field("editPurpose", "用途", it.purpose) +
      `<label><span>種類</span><select id="editKind">
        <option value="windows-pc" ${it.kind === "windows-pc" ? "selected" : ""}>パソコン</option>
        <option value="apple" ${it.kind === "apple" ? "selected" : ""}>Apple</option>
        <option value="phone" ${it.kind === "phone" ? "selected" : ""}>スマホ</option>
      </select></label>` +
      field("editOs", "OS", it.os) +
      field("editOsVersion", "OSバージョン", it.osVersion) +
      field("editCpu", "CPU／チップ", it.cpu) +
      field("editMemory", "メモリ", it.memory) +
      field("editStorage", "ストレージ", it.storage) +
      `<div class="field-block"><span>接続機材</span>${checkList("editGear", collection("gear"), it.connectedGear)}</div>` +
      `<div class="field-block"><span>インストール済みソフト</span>${checkList("editSoft", collection("software"), it.installedSoftware)}</div>` +
      field("editMemo", "メモ", it.memo, "textarea");
  }

  function softwareForm(item, asInstrument) {
    const it = item || {};
    const kind = asInstrument ? "instrument" : (it.kind || "plugin");
    const cats = DTM.instrumentCategories || [];
    const kontakt = it.needsKontakt || (it.needsHost ? "yes" : "");
    return photoField() +
      field("editName", asInstrument ? "音源名" : "製品名", it.name) +
      field("editMaker", "メーカー", it.maker) +
      field("editVersion", "バージョン", it.version) +
      categoryField("editSoftKind", "software", kind) +
      (asInstrument
        ? `<label><span>音源カテゴリー</span><select id="editInstrumentCategory">
            <option value="">未設定</option>
            ${cats.map(cat => `<option value="${esc(cat.id)}" ${it.instrumentCategory === cat.id ? "selected" : ""}>${esc(cat.title)}</option>`).join("")}
          </select></label>` +
          `<label><span>Kontaktが必要か</span><select id="editNeedsKontakt">
            <option value="" ${!kontakt ? "selected" : ""}>未設定</option>
            <option value="yes" ${kontakt === "yes" ? "selected" : ""}>必要</option>
            <option value="no" ${kontakt === "no" ? "selected" : ""}>不要</option>
          </select></label>` +
          field("editListSummary", "短い説明", it.listSummary || it.what) +
          field("editWhat", "何の音源か", it.what, "textarea") +
          `<label><span>方式</span><select id="editSourceType">
            <option value="" ${!it.sourceType ? "selected" : ""}>未設定</option>
            <option value="sample" ${it.sourceType === "sample" ? "selected" : ""}>サンプル音源</option>
            <option value="synth" ${it.sourceType === "synth" ? "selected" : ""}>シンセ音源</option>
            <option value="other" ${it.sourceType === "other" ? "selected" : ""}>その他</option>
          </select></label>` +
          field("editNeedsHost", "Kontaktなど別ソフトのメモ", it.needsHost)
        : field("editPurpose", "用途", it.purpose, "textarea")) +
      `<div class="field-block"><span>インストールしている端末</span>${checkList("editComputers", collection("computers"), it.computers)}</div>` +
      `<div class="field-block"><span>使用するDAW</span>${checkList("editDaws", collection("software").filter(s => s.kind === "daw"), it.compatibleDaws)}</div>` +
      `<div class="field-block"><span>関連ソフト</span>${checkList("editRelatedSoft", collection("software"), it.relatedSoftware)}</div>` +
      (asInstrument || kind === "instrument" ? `<div class="field-block"><span>関連用語</span>${checkList("editTerms", collection("terms"), it.relatedTerms)}</div>` : "") +
      field("editMemo", "メモ", it.memo, "textarea");
  }

  function termForm(item) {
    const it = item || {};
    return field("editName", "用語名", it.name, "", "例：ミキサー") +
      field("editAliases", "別名", (it.aliases || []).join("、"), "", "空でも保存できます。読点で区切る") +
      categoryField("editTermCategory", "terms", it.termCategory || "other") +
      field("editDescription", "説明", termDescription(it), "textarea", "空でも保存できます") +
      field("editMemo", "メモ", it.memo, "textarea", "空でも保存できます");
  }

  function famousUsersText(rows) {
    return (rows || []).map(row => [row.name, row.product, row.usage, row.sourceUrl, row.confirmedDate].join("｜")).join("\n");
  }

  function parseFamousUsers(text) {
    return String(text || "").split("\n").map(line => line.trim()).filter(Boolean).map(line => {
      const parts = line.split("｜").map(s => String(s || "").trim());
      return {
        name: parts[0] || "",
        product: parts[1] || "",
        usage: parts[2] || "",
        sourceUrl: parts[3] || "",
        confirmedDate: parts[4] || "",
        sourceLabel: parts[3] ? "登録した情報源" : ""
      };
    }).filter(row => row.name);
  }

  function brandForm(item) {
    const it = item || {};
    return photoField() +
      field("editName", "表示名", it.name, "", "例：Audio-Technica") +
      field("editNameJa", "日本語・一般的な呼び方", it.nameJa, "", "例：オーディオテクニカ") +
      field("editReading", "読み方", it.reading) +
      field("editCountry", "国名", it.country, "", "例：日本") +
      field("editFounded", "創業年", it.founded) +
      field("editSpecialties", "得意分野", (it.specialties || []).join("\n"), "textarea", "1行に1つ") +
      field("editProductCats", "代表的な製品カテゴリー", (it.productCategories || []).join("\n"), "textarea", "1行に1つ") +
      field("editRepresentative", "代表製品", it.representative, "textarea") +
      field("editSound", "音の特徴やブランドイメージ", it.soundImage, "textarea") +
      field("editAudience", "プロ向け／一般向けなどの傾向", it.audience, "textarea") +
      `<div class="field-block"><span>関連DTM用語</span>${checkList("editTerms", collection("terms"), it.relatedTerms)}</div>` +
      field("editFamous", "有名人・アーティスト愛用（情報源があるものだけ）", famousUsersText(it.famousUsers), "textarea", "1行：人物名｜製品｜使い方｜URL｜確認日") +
      field("editOfficial", "公式サイト", it.officialUrl, "", "https://") +
      field("editMemo", "メモ", it.memo, "textarea");
  }

  function purchaseTypeField(current) {
    return `<label><span>追加する種類</span>
      <select id="purchaseType">
        <option value="gear" ${current === "gear" ? "selected" : ""}>機材</option>
        <option value="software" ${current === "software" ? "selected" : ""}>ソフト</option>
        <option value="computers" ${current === "computers" ? "selected" : ""}>パソコン・端末</option>
      </select></label>`;
  }

  function purchaseStatusField(selected) {
    return `<label><span>状態</span>
      <select id="editStatus">
        <option value="considering" selected>購入検討中</option>
      </select></label>`;
  }

  function purchaseForm(kind) {
    const status = purchaseStatusField("considering");
    if (kind === "software") {
      return purchaseTypeField("software") +
        field("editName", "製品名", "", "", "例：iZotope RX") +
        categoryField("editSoftKind", "software", "plugin", "分類") +
        status;
    }
    if (kind === "computers") {
      return purchaseTypeField("computers") +
        field("editName", "製品名", "", "", "例：MacBook Pro") +
        `<label><span>分類</span><select id="editKind">
          <option value="windows-pc">パソコン</option>
          <option value="apple">Apple製品</option>
          <option value="phone">スマートフォン</option>
        </select></label>` +
        status;
    }
    return purchaseTypeField("gear") +
      field("editName", "製品名", "", "", "例：MPC Key 37 G2") +
      optionList("editGroup", purchaseGearCats(), "other", "分類") +
      status;
  }

  function optionList(id, rows, selected, label) {
    return `<label><span>${esc(label)}</span>
      <select id="${esc(id)}">${(rows || []).map(row =>
        `<option value="${esc(row.id)}" ${row.id === selected ? "selected" : ""}>${esc(row.title)}</option>`
      ).join("")}</select>
    </label>`;
  }

  function diyForm(item) {
    const it = item || {};
    return field("editName", "アイデア名", it.name, "", "例：足で操作するDTMコントローラー") +
      field("editMemo", "ひとことメモ", it.memo || it.listSummary || it.what, "textarea", "任意。名前だけでも保存できます");
  }

  function openBlurb(type, id) {
    const item = findItem(type, id);
    if (!item) return;
    pendingFormPhoto = null;
    editTarget = { type, id, mode: "edit", variant: "blurb" };
    $("editDialogTitle").textContent = "説明を追加";
    $("editError").textContent = "";
    $("editFields").innerHTML = field(
      "editSummary",
      "短い説明",
      item.listSummary || item.summary || "",
      "textarea",
      "これは何の機材で、何ができるかが分かる1〜2行。例：鍵盤とMPCの機能が一体になった音楽制作機材。"
    );
    if (!$("editDialog").open) $("editDialog").showModal();
  }

  function openRename(type, id) {
    const item = findItem(type, id);
    if (!item) return;
    renameTarget = { type, id };
    $("renameInput").value = item.name || item.title || "";
    $("renameDialog").showModal();
  }

  function openEdit(type, id) {
    if (type === "videos") {
      openVideoDialog("", "", id, "edit");
      return;
    }
    if (type === "workflows") {
      openWorkflow(findItem("workflows", id));
      return;
    }
    if (type === "connections") {
      openRename(type, id);
      return;
    }
    const item = findItem(type, id);
    if (!item) return;
    pendingFormPhoto = null;
    editTarget = { type, id, mode: "edit", variant: item.kind === "instrument" ? "instrument" : "" };
    $("editDialogTitle").textContent = "編集";
    $("editError").textContent = "";
    let fields = "";
    if (type === "gear") fields = gearForm(item);
    else if (type === "software") fields = softwareForm(item, item.kind === "instrument");
    else if (type === "computers") fields = computerForm(item) + statusSelect(item.status || "owned");
    else if (type === "terms") fields = termForm(item);
    else if (type === "brands") fields = brandForm(item);
    else if (type === "diy") fields = diyForm(item);
    $("editFields").innerHTML = fields;
    if (!$("editDialog").open) $("editDialog").showModal();
  }

  function openAdd(type) {
    if (type === "video") {
      openVideoDialog("", "", "", "add");
      return;
    }
    if (type === "workflows") {
      openWorkflow(null);
      return;
    }
    if (type === "connections") {
      addConnectionDiagram();
      return;
    }
    pendingFormPhoto = null;
    const purchaseType = type === "purchase" || type === "purchase-software" || type === "purchase-computers"
      ? (type === "purchase-software" ? "software" : type === "purchase-computers" ? "computers" : "gear")
      : "";
    const actual = purchaseType || (type === "instrument" ? "software" : type);
    editTarget = { type: actual, id: "", mode: "add", variant: type === "instrument" ? "instrument" : (purchaseType ? "purchase" : "") };
    $("editDialogTitle").textContent = "追加";
    $("editError").textContent = "";
    let fields = "";
    if (purchaseType) {
      fields = purchaseForm(purchaseType);
    } else if (actual === "gear") fields = gearForm(null, { status: "owned" });
    else if (actual === "software") fields = softwareForm(null, type === "instrument") + statusSelect("owned");
    else if (actual === "computers") fields = computerForm(null) + statusSelect("owned");
    else if (actual === "terms") fields = termForm(null);
    else if (actual === "brands") fields = brandForm(null);
    else if (actual === "diy") fields = diyForm(null);
    $("editFields").innerHTML = fields;
    if (!$("editDialog").open) $("editDialog").showModal();
  }

  function slugName() {
    return `custom-${Date.now()}`;
  }

  function matchTermsByName(text) {
    if (!text) return [];
    const all = collection("terms");
    return text.split(/[、,]/).map(s => s.trim()).filter(Boolean).map(name => {
      const found = all.find(item => item.name === name || (item.aliases || []).includes(name));
      return found ? found.id : null;
    }).filter(Boolean);
  }

  async function applyFormPhoto(type, id) {
    if (!pendingFormPhoto) return;
    await putPhoto(`${type}:${id}`, pendingFormPhoto);
    pendingFormPhoto = null;
  }

  function collectGearPayload(status) {
    let group = val("editGroup") || "other";
    if (editTarget && editTarget.variant === "purchase") group = purchaseGroupForCat(group, group);
    const conn = checked("editConn");
    const current = editTarget ? findItem("gear", editTarget.id) : null;
    return keepLinkFields(current, keepPriceFields(current, keepImageFields(current, {
      name: val("editName"),
      maker: val("editMaker"),
      group,
      categoryLabel: groupTitle("gear", group) || val("editName"),
      useLabel: val("editUseLabel"),
      status: status || val("editStatus") || "owned",
      functions: [],
      summary: val("editSummary"),
      what: val("editWhat") || val("editSummary"),
      canDo: val("editCanDo"),
      whenToUse: val("editWhen"),
      homeUse: val("editHome"),
      howTo: val("editWhen"),
      dawConnection: "",
      connections: conn,
      relatedGear: checked("editRelatedGear"),
      relatedTerms: checked("editTerms"),
      relatedSoftware: checked("editRelatedSoft"),
      connectedComputers: conn.filter(id => findItem("computers", id)),
      memo: val("editMemo"),
      unconfirmed: []
    })));
  }

  function collectComputerPayload(status) {
    const current = editTarget ? findItem("computers", editTarget.id) : null;
    return keepLinkFields(current, keepPriceFields(current, keepImageFields(current, {
      name: val("editName"),
      owner: val("editOwner"),
      maker: val("editMaker"),
      kind: val("editKind") || "windows-pc",
      purpose: val("editPurpose"),
      os: val("editOs"),
      osVersion: val("editOsVersion"),
      cpu: val("editCpu"),
      memory: val("editMemory"),
      storage: val("editStorage"),
      connectedGear: checked("editGear"),
      installedSoftware: checked("editSoft"),
      memo: val("editMemo"),
      dtmPriority: "medium",
      status: status || val("editStatus") || "owned",
      unconfirmed: []
    })));
  }

  function collectSoftwarePayload(status, asInstrument) {
    const kind = val("editSoftKind") || (asInstrument ? "instrument" : "plugin");
    const current = editTarget ? findItem("software", editTarget.id) : null;
    const asInst = asInstrument || kind === "instrument";
    const payload = {
      name: val("editName"),
      maker: val("editMaker"),
      kind,
      kindLabel: groupTitle("software", kind) || kind,
      purpose: val("editPurpose"),
      version: val("editVersion"),
      computers: checked("editComputers"),
      compatibleDaws: checked("editDaws"),
      parentId: null,
      status: status || val("editStatus") || "owned",
      functions: asInst ? ["soft-instrument"] : [],
      what: val("editWhat"),
      sourceType: val("editSourceType"),
      needsHost: val("editNeedsHost"),
      canDo: "",
      homeUse: "",
      relatedGear: [],
      relatedTerms: checked("editTerms"),
      relatedSoftware: checked("editRelatedSoft"),
      memo: val("editMemo")
    };
    if (asInst) {
      payload.instrumentCategory = val("editInstrumentCategory");
      payload.needsKontakt = val("editNeedsKontakt");
      payload.listSummary = val("editListSummary");
    }
    return keepLinkFields(current, keepImageFields(current, payload));
  }

  function collectDiyPayload() {
    const memo = val("editMemo");
    return {
      name: val("editName"),
      memo,
      listSummary: memo,
      what: memo
    };
  }

  function collectTermPayload() {
    const description = val("editDescription");
    const name = val("editName");
    const aliases = val("editAliases") ? val("editAliases").split(/[、,]/).map(s => s.trim()).filter(Boolean) : [];
    const current = editTarget && editTarget.id ? findItem("terms", editTarget.id) : null;
    const sortYomi = current && current.name === name && current.sortYomi
      ? current.sortYomi
      : inferTermYomi({ name, aliases, id: current && current.id });
    return {
      name,
      aliases,
      termCategory: val("editTermCategory") || "other",
      description,
      memo: val("editMemo"),
      sortYomi
    };
  }

  function lines(id) {
    return val(id).split("\n").map(s => s.trim()).filter(Boolean);
  }

  function collectBrandPayload() {
    const current = editTarget ? findItem("brands", editTarget.id) : null;
    const payload = {
      name: val("editName"),
      nameJa: val("editNameJa"),
      reading: val("editReading"),
      country: val("editCountry"),
      founded: val("editFounded"),
      specialties: lines("editSpecialties"),
      productCategories: lines("editProductCats"),
      representative: val("editRepresentative"),
      soundImage: val("editSound"),
      audience: val("editAudience"),
      relatedTerms: checked("editTerms"),
      famousUsers: parseFamousUsers(val("editFamous")),
      officialUrl: val("editOfficial"),
      memo: val("editMemo")
    };
    if (current) {
      keepImageFields(current, payload);
      keepLinkFields(current, payload);
    }
    return payload;
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editTarget) return;
    if (editTarget.variant === "blurb") {
      const text = val("editSummary");
      const patch = type === "software"
        ? { summary: text, listSummary: text, what: text }
        : type === "computers"
          ? { summary: text, listSummary: text }
          : { summary: text, listSummary: text };
      patchItem(type, editTarget.id, patch);
      $("editDialog").close();
      render();
      return;
    }
    const name = val("editName");
    if (!name) {
      $("editError").textContent = "名前を入力してください。";
      return;
    }
    const type = editTarget.type;
    const asInstrument = editTarget.variant === "instrument" || val("editSoftKind") === "instrument";
    let payload = {};
    if (type === "gear") payload = collectGearPayload();
    else if (type === "software") payload = collectSoftwarePayload("", asInstrument);
    else if (type === "computers") payload = collectComputerPayload();
    else if (type === "terms") payload = collectTermPayload();
    else if (type === "brands") payload = collectBrandPayload();
    else if (type === "diy") payload = collectDiyPayload();
    payload.name = name;
    if (editTarget.variant === "blurb") {
      const text = val("editSummary");
      const patch = type === "software"
        ? { summary: text, listSummary: text, what: text || findItem(type, editTarget.id)?.what }
        : type === "computers"
          ? { purpose: findItem(type, editTarget.id)?.purpose || "", summary: text, listSummary: text }
          : { summary: text, listSummary: text, what: text || findItem(type, editTarget.id)?.what };
      patchItem(type, editTarget.id, patch);
      await applyFormPhoto(type, editTarget.id);
      $("editDialog").close();
      render();
      return;
    }
    if (editTarget.mode === "add") {
      const id = slugName();
      addItem(type, Object.assign({ id }, payload));
      await applyFormPhoto(type, id);
      $("editDialog").close();
      if (editTarget.variant === "purchase") {
        location.hash = "#/purchase";
        render();
        return;
      }
      const hash = type === "computers" ? `#/computers/${id}`
        : type === "terms" ? `#/terms/${id}`
        : type === "software" ? `#/software/${id}`
        : type === "brands" ? `#/brands/${id}`
        : type === "diy" ? "#/diy"
        : `#/gear/${id}`;
      location.hash = hash;
      if (location.hash.replace(/^#/, "") === hash.replace(/^#/, "")) render();
      return;
    }
    patchItem(type, editTarget.id, payload);
    await applyFormPhoto(type, editTarget.id);
    $("editDialog").close();
    render();
  }

  function fillRelatedSelect(selected) {
    const select = $("videoRelatedInput");
    if (!select) return;
    const groups = [
      ["gear", "機材", collection("gear")],
      ["software", "ソフト", collection("software")],
      ["terms", "用語", collection("terms")],
      ["brands", "メーカー・ブランド", collection("brands")],
      ["computers", "端末", collection("computers")],
      ["diy", "手作り", collection("diy")]
    ];
    select.innerHTML = `<option value="">未設定</option>` + groups.map(([type, label, items]) =>
      `<optgroup label="${esc(label)}">${items.map(item => {
        const value = `${type}:${item.id}`;
        return `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(item.name)}</option>`;
      }).join("")}</optgroup>`
    ).join("");
  }

  function openVideoDialog(type, id, videoId, mode) {
    const editing = mode === "edit" && videoId;
    const video = videoId ? findItem("videos", videoId) : null;
    videoTarget = { type: type || (video && video.relatedType) || "", id: id || (video && video.relatedId) || "", videoId: videoId || "", mode: editing ? "edit" : (videoId && !editing ? "marker" : "add") };
    $("videoDialogTitle").textContent = videoTarget.mode === "marker" ? "開始位置を追加" : (editing ? "動画を編集" : "動画を追加");
    $("videoError").textContent = "";
    $("videoTitleInput").value = video ? (video.title || "") : "";
    $("videoUrlInput").value = video ? (video.youtubeUrl || "") : "";
    $("videoWhatInput").value = video ? (video.what || "") : "";
    $("videoStartInput").value = "";
    $("videoMarkerInput").value = "";
    $("videoMemoInput").value = video ? (video.memo || "") : "";
    fillVideoCategories((video && video.markers && video.markers[0] && video.markers[0].category) || "基本操作");
    const related = videoTarget.type && videoTarget.id ? `${videoTarget.type}:${videoTarget.id}` : "";
    fillRelatedSelect(related);
    const lockCore = videoTarget.mode === "marker";
    $("videoTitleInput").disabled = lockCore;
    $("videoUrlInput").disabled = lockCore;
    $("videoWhatInput").disabled = lockCore;
    $("videoRelatedInput").disabled = lockCore;
    $("videoDialog").showModal();
  }

  function saveVideo(event) {
    event.preventDefault();
    if (!videoTarget) return;
    const startText = $("videoStartInput").value.trim();
    const start = startText ? parseTime(startText) : 0;
    if (Number.isNaN(start)) {
      $("videoError").textContent = "開始時間は 4:32 のように入力してください。";
      return;
    }
    const marker = {
      id: `m-${Date.now()}`,
      startSeconds: start,
      label: $("videoMarkerInput").value.trim() || (start ? formatTime(start) : ""),
      category: $("videoCategoryInput").value,
      memo: $("videoMemoInput").value.trim()
    };
    const relatedRaw = $("videoRelatedInput").value || "";
    const [relatedType, relatedId] = relatedRaw.includes(":") ? relatedRaw.split(":") : [videoTarget.type, videoTarget.id];
    if (videoTarget.mode === "marker") {
      const video = findItem("videos", videoTarget.videoId);
      const markers = [...(video.markers || []), marker];
      patchItem("videos", videoTarget.videoId, { markers });
    } else if (videoTarget.mode === "edit") {
      const video = findItem("videos", videoTarget.videoId);
      const url = $("videoUrlInput").value.trim();
      const yt = getYouTubeId(url);
      if (url && !yt) {
        $("videoError").textContent = "YouTube の URL を確認してください。";
        return;
      }
      const title = $("videoTitleInput").value.trim() || video.title || "動画";
      const markers = startText || marker.label ? [...(video.markers || []), marker] : (video.markers || []);
      patchItem("videos", videoTarget.videoId, {
        title,
        name: title,
        youtubeUrl: url || video.youtubeUrl,
        videoId: yt || video.videoId,
        what: $("videoWhatInput").value.trim(),
        memo: $("videoMemoInput").value.trim(),
        relatedType: relatedType || "",
        relatedId: relatedId || "",
        markers
      });
    } else {
      const url = $("videoUrlInput").value.trim();
      const yt = getYouTubeId(url);
      if (!yt) {
        $("videoError").textContent = "YouTube の URL を確認してください。";
        return;
      }
      const title = $("videoTitleInput").value.trim() || "動画";
      addItem("videos", {
        id: `vid-${Date.now()}`,
        title,
        name: title,
        youtubeUrl: url,
        videoId: yt,
        what: $("videoWhatInput").value.trim(),
        memo: $("videoMemoInput").value.trim(),
        relatedType: relatedType || "",
        relatedId: relatedId || "",
        markers: [marker]
      });
    }
    $("videoDialog").close();
    render();
  }

  function playVideo(videoId, markerId) {
    const video = findItem("videos", videoId);
    if (!video) return;
    const marker = (video.markers || []).find(m => m.id === markerId) || (video.markers || [])[0];
    const start = marker ? marker.startSeconds : 0;
    $("playerCat").textContent = marker ? (marker.category || "") : "";
    $("playerTitle").textContent = `${video.title}${marker && marker.label ? " / " + marker.label : ""}`;
    $("playerMemo").textContent = (marker && marker.memo) || video.memo || video.what || "";
    $("playerFrame").src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.videoId)}?start=${start}&autoplay=1`;
    $("playerDialog").showModal();
  }

  function closePlayer() {
    $("playerFrame").src = "";
  }

  function fillWorkflowDevices(selected) {
    const box = $("wfDevices");
    if (!box) return;
    const sel = new Set(selected || []);
    box.innerHTML = collection("computers").map(item => `
      <label class="check"><input type="checkbox" name="wfDevice" value="${esc(item.id)}" ${sel.has(item.id) ? "checked" : ""}> ${esc(item.name)}</label>
    `).join("") || `<p class="muted">端末がまだありません。</p>`;
  }

  function openWorkflow(item) {
    videoTarget = null;
    $("workflowDialog").querySelector("h2").textContent = item ? "ワークフローを編集" : "ワークフローを追加";
    $("wfTitleInput").value = item ? (item.title || item.name || "") : "";
    $("wfSummaryInput").value = item ? (item.summary || "") : "";
    $("wfStepsInput").value = item && item.steps ? item.steps.map(step => {
      const device = findItem("computers", step.deviceId);
      return `${device ? device.name : step.deviceId}：${step.action}`;
    }).join("\n") : "";
    $("wfAppsInput").value = item ? (item.apps || "") : "";
    $("wfTransferInput").value = item ? (item.transfer || "") : "";
    $("wfMemoInput").value = item ? (item.memo || "") : "";
    $("wfError").textContent = "";
    const selected = item ? (item.deviceIds || (item.steps || []).map(step => step.deviceId)) : ["iphone-yuri", "ipad-air-yuri", "macbook-yuri"];
    fillWorkflowDevices(selected);
    $("workflowDialog").dataset.editId = item ? item.id : "";
    $("workflowDialog").showModal();
  }

  function saveWorkflow(event) {
    event.preventDefault();
    const title = $("wfTitleInput").value.trim();
    if (!title) {
      $("wfError").textContent = "ワークフロー名を入力してください。";
      return;
    }
    const computers = collection("computers");
    const steps = $("wfStepsInput").value.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
      const [left, ...rest] = line.split("：");
      const action = rest.join("：").trim() || left;
      const device = computers.find(item => item.name.includes(left.trim()) || left.trim().includes(item.name) || left.trim() === item.name);
      return { deviceId: device ? device.id : left.trim(), action };
    });
    const payload = {
      title,
      name: title,
      summary: $("wfSummaryInput").value.trim(),
      steps,
      deviceIds: checked("wfDevice"),
      apps: $("wfAppsInput").value.trim(),
      transfer: $("wfTransferInput").value.trim(),
      memo: $("wfMemoInput").value.trim()
    };
    const editId = $("workflowDialog").dataset.editId;
    if (editId) patchItem("workflows", editId, payload);
    else addItem("workflows", Object.assign({ id: `wf-${Date.now()}` }, payload));
    $("workflowDialog").close();
    render();
  }

  function addCustomGroup(kind, title) {
    store.customGroups = store.customGroups || { gear: [], software: [], terms: [] };
    store.customGroups[kind] = store.customGroups[kind] || [];
    const id = `cat-${Date.now()}`;
    store.customGroups[kind].push({ id, title });
    saveStore();
    return id;
  }

  function handleAct(act, type, id, el) {
    closeMenus();
    if (act === "rename") openRename(type, id);
    if (act === "photo") {
      pendingPhoto = { type, id };
      $("photoInput").click();
    }
    if (act === "edit") openEdit(type, id);
    if (act === "mark-owned") openMarkOwned(type, id);
    if (act === "mark-considering") markConsidering(type, id);
    if (act === "delete") {
      if (confirm("この項目を削除しますか？")) {
        deleteItem(type, id);
        const { parts } = parseRoute();
        if (parts[1] === id || (type === "workflows" && parts[0] === "apple") || (type === "connections" && parts[0] === "patch")) {
          location.hash = type === "workflows" ? "#/apple" : type === "connections" ? "#/patch" : type === "diy" ? "#/diy" : `#/${type === "computers" ? "computers" : type}`;
          if (location.hash === `#/${type}` || location.hash === "#/apple" || location.hash === "#/patch" || location.hash === "#/diy") render();
        } else render();
      }
    }
    if (act === "add-item") openAdd(type);
    if (act === "add-blurb") openBlurb(type, id);
    if (act === "add-video") openVideoDialog(type, id);
    if (act === "add-marker") openVideoDialog("", "", id);
    if (act === "play-video") playVideo(el.dataset.video, el.dataset.marker);
    if (act === "add-workflow") openWorkflow(null);
    if (act === "add-category") {
      const title = prompt("新しいカテゴリー名");
      if (!title || !title.trim()) return;
      const newId = addCustomGroup(el.dataset.cat, title.trim());
      const select = $(el.dataset.select);
      if (select) {
        const opt = document.createElement("option");
        opt.value = newId;
        opt.textContent = title.trim();
        opt.selected = true;
        select.appendChild(opt);
      }
    }
    if (act === "patch-add-gear") openPatchAddGear(id);
    if (act === "patch-add-edge") togglePatchConnect(id);
    if (act === "patch-del-edge") {
      const diagram = findItem("connections", id);
      if (!diagram) return;
      savePatchDiagram(id, { edges: (diagram.edges || []).filter(edge => edge.id !== el.dataset.edge) });
      render();
    }
    if (act === "patch-del-node") {
      const diagram = findItem("connections", id);
      if (!diagram) return;
      const nodeId = el.dataset.node;
      savePatchDiagram(id, {
        nodes: (diagram.nodes || []).filter(node => node.id !== nodeId),
        edges: (diagram.edges || []).filter(edge => edge.from !== nodeId && edge.to !== nodeId)
      });
      render();
    }
  }

  function onPhoto(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file || !pendingPhoto) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await putPhoto(`${pendingPhoto.type}:${pendingPhoto.id}`, reader.result);
      pendingPhoto = null;
      render();
    };
    reader.readAsDataURL(file);
  }

  function bind() {
    const icon = $("appIconImg");
    const wrap = $("brandIcon");
    if (icon && wrap) {
      icon.addEventListener("load", () => wrap.classList.remove("is-empty"));
      icon.addEventListener("error", () => wrap.classList.add("is-empty"));
    }
    try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch {}
    window.addEventListener("hashchange", render);
    window.addEventListener("scroll", () => {
      syncChromeCompact();
      scheduleViewSave();
    }, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushViewSave();
    });
    window.addEventListener("pagehide", flushViewSave);
    document.addEventListener("freeze", flushViewSave);
    window.addEventListener("pageshow", event => {
      if (event.persisted) flushViewSave();
    });
    document.addEventListener("click", event => {
      const source = event.target.closest("[data-href], a[href^='#/']");
      if (!source) return;
      captureListRestoreFromEl(source);
    }, true);
    document.addEventListener("pointerdown", onPatchPointerDown);
    document.addEventListener("pointermove", onPatchPointerMove, { passive: false });
    document.addEventListener("pointerup", onPatchPointerUp);
    document.addEventListener("dragstart", event => {
      const card = event.target.closest(".term-card[data-term-id], .item-row[data-term-id]");
      const purchaseRow = event.target.closest(".item-row[data-purchase-id]");
      if (event.target.closest("[data-menu-btn], .card-menu, [data-act]")) {
        if (card || purchaseRow) event.preventDefault();
        return;
      }
      if (card) {
        termDrag = { id: card.dataset.termId, cat: card.dataset.termCat };
        skipTermClick = false;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", card.dataset.termId);
        card.classList.add("is-dragging");
        return;
      }
      if (purchaseRow) {
        purchaseDrag = { id: purchaseRow.dataset.purchaseId, cat: purchaseRow.dataset.purchaseCat };
        skipTermClick = false;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", purchaseRow.dataset.purchaseId);
        purchaseRow.classList.add("is-dragging");
        setPurchaseEmptyCatsVisible(true);
      }
    });
    document.addEventListener("dragover", event => {
      const card = event.target.closest(".term-card[data-term-id], .item-row[data-term-id]");
      const zone = event.target.closest("[data-term-drop]");
      const purchaseRow = event.target.closest(".item-row[data-purchase-id]");
      const purchaseZone = event.target.closest("[data-purchase-drop]");
      if (termDrag && (card || zone)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        document.querySelectorAll(".term-grid.is-over").forEach(el => el.classList.remove("is-over"));
        document.querySelectorAll(".term-card.is-drop-target").forEach(el => el.classList.remove("is-drop-target"));
        if (card && card.dataset.termId !== termDrag.id) card.classList.add("is-drop-target");
        if (zone) zone.classList.add("is-over");
        return;
      }
      if (purchaseDrag && (purchaseRow || purchaseZone)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        document.querySelectorAll("[data-purchase-drop].is-over").forEach(el => el.classList.remove("is-over"));
        document.querySelectorAll(".item-row.is-drop-target").forEach(el => el.classList.remove("is-drop-target"));
        if (purchaseRow && purchaseRow.dataset.purchaseId !== purchaseDrag.id) purchaseRow.classList.add("is-drop-target");
        if (purchaseZone) purchaseZone.classList.add("is-over");
      }
    });
    document.addEventListener("drop", event => {
      const card = event.target.closest(".term-card[data-term-id], .item-row[data-term-id]");
      const zone = event.target.closest("[data-term-drop]");
      const purchaseRow = event.target.closest(".item-row[data-purchase-id]");
      const purchaseZone = event.target.closest("[data-purchase-drop]");
      if (termDrag && (card || zone)) {
        event.preventDefault();
        const toCat = (card && card.dataset.termCat) || (zone && zone.dataset.termDrop);
        const beforeId = card && card.dataset.termId !== termDrag.id ? card.dataset.termId : "";
        skipTermClick = true;
        moveTerm(termDrag.id, toCat, beforeId);
        termDrag = null;
        return;
      }
      if (purchaseDrag && (purchaseRow || purchaseZone)) {
        event.preventDefault();
        const toCat = (purchaseRow && purchaseRow.dataset.purchaseCat) || (purchaseZone && purchaseZone.dataset.purchaseDrop);
        skipTermClick = true;
        movePurchaseGear(purchaseDrag.id, toCat);
        purchaseDrag = null;
      }
    });
    document.addEventListener("dragend", () => {
      document.querySelectorAll(".term-card.is-dragging, .term-card.is-drop-target, .term-grid.is-over, .item-row.is-dragging, .item-row.is-drop-target, [data-purchase-drop].is-over").forEach(el => {
        el.classList.remove("is-dragging", "is-drop-target", "is-over");
      });
      setPurchaseEmptyCatsVisible(false);
      termDrag = null;
      purchaseDrag = null;
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      const input = event.target;
      if (input && (input.id === "homeSearchInput" || input.id === "headerSearchInput")) {
        event.preventDefault();
        goSearch(input.value);
      }
    });
    let scratchTimer = null;
    document.addEventListener("input", event => {
      if (event.target.id !== "scratchNotes") return;
      clearTimeout(scratchTimer);
      scratchTimer = setTimeout(() => persistScratchNotes(event.target.value), 400);
    });
    document.addEventListener("focusout", event => {
      if (event.target.id !== "scratchNotes") return;
      clearTimeout(scratchTimer);
      persistScratchNotes(event.target.value);
    });
    document.addEventListener("click", event => {
      const closer = event.target.closest("[data-close-dialog]");
      if (closer) {
        const dialog = $(closer.dataset.closeDialog);
        if (dialog) dialog.close();
        if (closer.dataset.closeDialog === "playerDialog") closePlayer();
        return;
      }
      const menuBtn = event.target.closest("[data-menu-btn]");
      if (menuBtn) {
        event.preventDefault();
        event.stopPropagation();
        const key = menuBtn.dataset.menuBtn;
        const menu = document.querySelector(`[data-menu="${key}"]`);
        const willOpen = menu && !menu.classList.contains("open");
        closeMenus();
        if (willOpen && menu) {
          menu.classList.add("open");
          menuBtn.closest("article")?.classList.add("menu-open");
        }
        return;
      }
      const actBtn = event.target.closest("[data-act]");
      if (actBtn) {
        event.preventDefault();
        event.stopPropagation();
        handleAct(actBtn.dataset.act, actBtn.dataset.type, actBtn.dataset.id, actBtn);
        return;
      }
      if (!event.target.closest(".card-menu") && !event.target.closest("[data-menu-btn]")) closeMenus();
      const hrefCard = event.target.closest("[data-href]");
      if (hrefCard && skipTermClick) {
        skipTermClick = false;
        return;
      }
      if (hrefCard && !event.target.closest("[data-menu-btn]") && !event.target.closest(".card-menu")) {
        captureListRestoreFromEl(hrefCard);
        location.hash = hrefCard.dataset.href.replace(/^#/, "#");
      }
    });
    document.addEventListener("submit", event => {
      if (event.target.id === "homeSearchForm" || event.target.id === "headerSearchForm") {
        event.preventDefault();
        const input = event.target.querySelector("input");
        goSearch(input.value);
      }
      if (event.target.id === "renameForm") {
        event.preventDefault();
        if (!renameTarget) return;
        const name = $("renameInput").value.trim();
        const patch = { name };
        if (renameTarget.type === "workflows" || renameTarget.type === "videos" || renameTarget.type === "connections") patch.title = name;
        patchItem(renameTarget.type, renameTarget.id, patch);
        $("renameDialog").close();
        render();
      }
      if (event.target.id === "editForm") saveEdit(event);
      if (event.target.id === "markOwnedForm") applyMarkOwned(event);
      if (event.target.id === "videoForm") saveVideo(event);
      if (event.target.id === "workflowForm") saveWorkflow(event);
      if (event.target.id === "patchForm") savePatchForm(event);
      if (event.target.id === "diyIdeaForm") {
        event.preventDefault();
        addDiyIdea();
      }
    });
    $("photoInput").addEventListener("change", onPhoto);
    $("transferBtn").addEventListener("click", openTransferDialog);
    $("backupExportBtn").addEventListener("click", exportBackup);
    $("backupImportBtn").addEventListener("click", () => $("backupFileInput").click());
    $("backupFileInput").addEventListener("change", onBackupFilePicked);
    $("transferOverwriteForm").addEventListener("submit", applyBackupImport);
    document.addEventListener("change", event => {
      if (event.target.id === "purchaseType") {
        const v = event.target.value;
        openAdd(v === "software" ? "purchase-software" : v === "computers" ? "purchase-computers" : "purchase");
      }
      if (event.target.id === "patchSelect") {
        const id = event.target.value;
        if (id) {
          const route = parseRoute();
          location.hash = route.parts[0] === "env"
            ? `#/env?tab=patch&id=${encodeURIComponent(id)}`
            : `#/patch/${id}`;
        }
      }
      if (event.target.id === "editPhoto" && event.target.files && event.target.files[0]) {
        const reader = new FileReader();
        reader.onload = () => { pendingFormPhoto = reader.result; };
        reader.readAsDataURL(event.target.files[0]);
      }
    });
    $("playerDialog").addEventListener("close", closePlayer);
    fillVideoCategories("基本操作");
  }

  function isDevHost() {
    const host = location.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  }

  async function setupServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (isDevHost()) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) await registration.unregister();
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith("ongaku-seisaku-")).map(key => caches.delete(key)));
      }
      return;
    }
    try {
      await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
    } catch {}
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  }

  async function init() {
    store = loadStore();
    try { await loadPhotos(); } catch { photoCache = {}; }
    bind();
    prepareLastViewBoot();
    render();
    setupServiceWorker();
  }

  init();
})();
