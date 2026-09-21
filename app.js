const viewer =
  document.getElementById(
    "viewer"
  );

const toc =
  document.getElementById(
    "toc"
  );

const progressText =
  document.getElementById(
    "progressText"
  );

const progressFill =
  document.getElementById(
    "progressFill"
  );

const sidebar =
  document.getElementById(
    "sidebar"
  );

const menuBtn =
  document.getElementById(
    "bottomMenuBtn"
  );

const bookmarkBtn =
  document.getElementById(
    "bookmarkBtn"
  );

const themeBtn =
  document.getElementById(
    "themeBtn"
  );

const nextPage =
  document.getElementById(
    "nextPage"
  );

const prevPage =
  document.getElementById(
    "prevPage"
  );

const bottomDecreaseFont =
  document.getElementById(
    "bottomDecreaseFont"
  );

const bottomIncreaseFont =
  document.getElementById(
    "bottomIncreaseFont"
  );

const bottomMenuBtn =
  document.getElementById(
    "bottomMenuBtn"
  );

const searchBtn =
  document.getElementById(
    "searchBtn"
  );

const searchModal =
  document.getElementById(
    "searchModal"
  );

const searchInput =
  document.getElementById(
    "searchInput"
  );

const closeSearch =
  document.getElementById(
    "closeSearch"
  );

const searchResults =
  document.getElementById(
    "searchResults"
  );

const header =
  document.querySelector(
    "header"
  );

const footer =
  document.querySelector(
    "footer"
  );

const leftZone =
  document.getElementById(
    "leftZone"
  );

const centerZone =
  document.getElementById(
    "centerZone"
  );

const rightZone =
  document.getElementById(
    "rightZone"
  );


/* OTHER GLOBALS */

let book;
let rendition;
let currentLocation = null;

let activeSearchHighlight =
  null;

let controlsVisible =
  true;

let fontSize =
  Number(
    localStorage.getItem(
      "fontSize"
    )
  ) || 100;

let fontFamily =
  localStorage.getItem("fontFamily") ||
  "serif";


/* =========================
   APP VERSION
   Change this on every release
========================= */
const APP_VERSION = "1.6.0";

const versionEl =
  document.getElementById(
    "appVersion"
  );
if (versionEl)
  versionEl.textContent =
    "v" + APP_VERSION;

/* =========================
   CLEAR DATA BUTTON
========================= */

const clearDataBtn =
  document.getElementById("clearDataBtn");

if (clearDataBtn) {
  clearDataBtn.addEventListener("click", () => {

    if (!confirm("Clear all app data?\n\nThis will reset bookmarks, themes, and cached settings.")) return;

    localStorage.clear();

    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });

    alert("App data cleared. The app will now reload.");
    location.reload();

  });
}

/* =========================
   BOOK LIBRARY
========================= */
const BOOKS = [
  {
    title: "GES Promotion Aptitude Test Pasco",
    file: "./library/gespasco.epub"
  },
  {
    title: "Model Aptitude Test for GES 1",
    file: "./library/mat1.epub"
  },
  {
    title: "Model Aptitude Test for GES 2",
    file: "./library/mat2.epub"
  }, 
  {
    title: "Effective Teaching Methods",
    file: "./library/etmala.epub"
  },
  {
    title: "Notes for Aptitude Test for GES",
    file: "./library/nfatfges.epub"
  },
  {
    title: "Education in Ghana",
    file: "./library/eigala.epub"
  }  

];

let selectedBookFile =
  localStorage.getItem("lastBook") ||
  BOOKS[0].file;

/* Library screen logic */
const libraryScreen =
  document.getElementById("libraryScreen");

const readerApp =
  document.getElementById("readerApp");

const backBtn =
  document.getElementById("backBtn");

const readerTitle =
  document.getElementById("readerTitle");

document.querySelectorAll(".bookCard")
  .forEach(card => {
    card.addEventListener("click", () => {
      selectedBookFile = card.dataset.file;
      localStorage.setItem("lastBook", selectedBookFile);

      const selectedBook =
        BOOKS.find(b => b.file === selectedBookFile);

      if (readerTitle && selectedBook) {
        readerTitle.textContent = selectedBook.title;
      }

      openReader();
    });
  });

if (backBtn) {
  backBtn.addEventListener("click", () => {
    readerApp.style.display = "none";
    libraryScreen.style.display = "flex";
    backBtn.style.display = "none";
    if (rendition) { rendition.destroy(); rendition = null; }
    /* Restore library theme when returning */
    applyLibraryDayNight();
  });
}

function openReader() {
  libraryScreen.style.display = "none";
  readerApp.style.display = "flex";
  if (backBtn) backBtn.style.display = "flex";
  loadBook();
  loadBookmarks();
}

/* =========================
   SUPPORTER KEY SYSTEM
   ─────────────────────────
   Keys follow format: ALATIPHA-XXXX-YYYY
   where YYYY is a checksum derived from XXXX.
   This is a soft gate, not real security —
   anyone viewing source can find the algorithm.
   It's meant to reward genuine supporters, not
   stop determined bypassing.
========================= */

function supporterChecksum(code) {
  let sum = 0;
  for (let i = 0; i < code.length; i++) {
    sum += code.charCodeAt(i) * (i + 7);
  }
  return (sum % 9973).toString(36).toUpperCase().padStart(4, "0");
}

function isValidSupporterKey(key) {
  const clean = key.trim().toUpperCase();
  const match = clean.match(/^ALATIPHA-([A-Z0-9]{4,8})-([A-Z0-9]{4})$/);
  if (!match) return false;
  const [, code, checksum] = match;
  return supporterChecksum(code) === checksum;
}

function isSupporter() {
  return localStorage.getItem("isSupporter") === "true";
}

function applySupporterUI() {
  const momoSection = document.getElementById("momoSection");
  const thanks = document.getElementById("supporterThanks");
  if (!momoSection || !thanks) return;

  if (isSupporter()) {
    momoSection.style.display = "none";
    thanks.style.display = "flex";
  } else {
    momoSection.style.display = "block";
    thanks.style.display = "none";
  }
}

const supporterKeyModal = document.getElementById("supporterKeyModal");
const supporterKeyLink = document.getElementById("supporterKeyLink");
const supporterKeyClose = document.getElementById("supporterKeyClose");
const supporterKeyInput = document.getElementById("supporterKeyInput");
const supporterKeySubmit = document.getElementById("supporterKeySubmit");
const supporterKeyError = document.getElementById("supporterKeyError");

if (supporterKeyLink) {
  supporterKeyLink.addEventListener("click", () => {
    supporterKeyModal.classList.add("open");
    supporterKeyError.textContent = "";
    supporterKeyInput.value = "";
    supporterKeyInput.focus();
  });
}

if (supporterKeyClose) {
  supporterKeyClose.addEventListener("click", () => {
    supporterKeyModal.classList.remove("open");
  });
}

if (supporterKeySubmit) {
  supporterKeySubmit.addEventListener("click", () => {
    const key = supporterKeyInput.value;
    if (isValidSupporterKey(key)) {
      localStorage.setItem("isSupporter", "true");
      supporterKeyModal.classList.remove("open");
      applySupporterUI();
    } else {
      supporterKeyError.textContent = "Invalid key. Please check and try again.";
    }
  });
}

/* Apply supporter UI on load */
applySupporterUI();

const READER_DATA_KEY =
  "ges-promohub-data";

function getBookmarksKey() {
  return "ges-promohub-bookmarks-" + selectedBookFile;
}


/* =========================
   SAVE READER DATA
========================= */

function saveReaderData(
  data
) {

  try {

    localStorage.setItem(

      READER_DATA_KEY,

      JSON.stringify(data)

    );

  }

  catch (error) {

    console.error(
      error
    );

  }

}

/* =========================
   LOAD READER DATA
========================= */

function loadReaderData() {

  try {

    const saved =
      localStorage.getItem(
        READER_DATA_KEY
      );

    if (!saved)
      return {};

    return JSON.parse(
      saved
    );

  }

  catch (error) {

    console.error(
      error
    );

    return {};

  }

}


/* ==================
   BOOKMARKS
================== */

/* SAVE BOOKMARK */
function saveBookmark() {

  if (
    !rendition ||
    !currentLocation
  ) {

    return;

  }

  const bookmarks =
    JSON.parse(
      localStorage.getItem(
        getBookmarksKey()
      ) || "[]"
    );

  const chapterName =
    getCurrentChapter(
      currentLocation.start.href
    );

  const rawPct =
    book.locations.total > 0
      ? book.locations.percentageFromCfi(
          currentLocation.start.cfi
        )
      : 0;

  const percent =
    Math.floor((rawPct || 0) * 100);

  bookmarks.push({

    cfi:
      currentLocation.start.cfi,

    chapter:
      chapterName,

    progress:
      percent,

    date:
      new Date()
        .toISOString()

  });

  localStorage.setItem(
    getBookmarksKey(),
    JSON.stringify(
      bookmarks
    )
  );

  loadBookmarks();

  /* Switch sidebar to Bookmarks tab */
  document.querySelectorAll(
    ".sidebarTab"
  ).forEach(t =>
    t.classList.remove("active")
  );
  document.querySelectorAll(
    ".tabPanel"
  ).forEach(p =>
    p.classList.remove("active")
  );
  const bTab = document.querySelector(
    '[data-tab="bookmarks"]'
  );
  const bPanel = document.getElementById(
    "bookmarksPanel"
  );
  if (bTab) bTab.classList.add("active");
  if (bPanel) bPanel.classList.add("active");

}

/* LOAD BOOKMARKS */
function loadBookmarks() {

  const list =
    document.getElementById(
      "bookmarksList"
    );

  if (!list)
    return;

  list.innerHTML = "";

  const bookmarks =
    JSON.parse(
      localStorage.getItem(
        getBookmarksKey()
      ) || "[]"
    );

  if (!bookmarks.length) {
    list.innerHTML =
      '<div class="noBookmarks">No bookmarks yet.<br>Tap <i class="fa-solid fa-bookmark"></i> while reading to add one.</div>';
    return;
  }

  bookmarks.forEach(
    (bookmark, index) => {

      const row =
        document.createElement(
          "div"
        );

      row.className =
        "bookmarkRow";

      /* Navigate link */
      const item =
        document.createElement(
          "a"
        );

      item.href = "#";

      item.className =
        "bookmarkLink";

      item.textContent =
        bookmark.chapter +
        " (" +
        bookmark.progress +
        "%)";

      item.addEventListener(
        "click",
        e => {

          e.preventDefault();

          rendition.display(
            bookmark.cfi
          );

          // closeSidebar();
          toggleSidebar();

          hideControls();

        }
      );

      /* Delete button */
      const del =
        document.createElement(
          "button"
        );

      del.className =
        "bookmarkDelete";

      del.title =
        "Delete bookmark";

      del.innerHTML = '<i class="fa-solid fa-trash"></i>';

      del.addEventListener(
        "click",
        e => {

          e.stopPropagation();

          const all =
            JSON.parse(
              localStorage.getItem(
                getBookmarksKey()
              ) || "[]"
            );

          all.splice(index, 1);

          localStorage.setItem(
            getBookmarksKey(),
            JSON.stringify(all)
          );

          loadBookmarks();
          deleteCloudBookmark(bookmark);

        }
      );

      row.appendChild(item);
      row.appendChild(del);
      list.appendChild(row);

    }
  );

}


/* ==============
   LOAD BOOK
============== */

async function loadBook() {

  try {

    const response =
      await fetch(selectedBookFile);

    if (!response.ok) {

      throw new Error(
        "EPUB file not found."
      );

    }

    const blob =
      await response.blob();

    book = ePub(blob);

    startReader();

  }

  catch (error) {

    console.error(error);

    alert(
      "Failed to load EPUB."
    );

  }

}


/* =================
   CHAPTERS
================= */

function getCurrentChapter(
  href
) {

  if (
    !book ||
    !book.navigation ||
    !book.navigation.toc
  ) {

    return "";

  }

  let result = "";

  function search(
    items
  ) {

    items.forEach(
      item => {

        if (
          href.includes(
            item.href.split("#")[0]
          )
        ) {

          result =
            item.label;

        }

        if (
          item.subitems &&
          item.subitems.length
        ) {

          search(
            item.subitems
          );

        }

      }
    );

  }

  search(
    book.navigation.toc
  );

  return result;

}


/* =================
   BUILD TOC
================= */

/* =========================
   HIGHLIGHT ACTIVE TOC ITEM
========================= */

function highlightActiveTOC(currentHref) {

  if (!currentHref) return;

  /* Strip any fragment for comparison */
  const cleanHref = currentHref.split("#")[0];

  document.querySelectorAll(".tocItem").forEach(row => {

    const rowHref = (row.dataset.href || "").split("#")[0];

    row.classList.toggle(
      "active",
      rowHref && cleanHref.endsWith(rowHref)
    );

  });

  /* Auto-expand parent groups containing the active item,
     and scroll it into view */
  const activeRow = document.querySelector(".tocItem.active");
  if (activeRow) {

    let parent = activeRow.closest(".tocChildren");
    while (parent) {
      parent.classList.add("open");
      const toggle = parent.previousElementSibling?.querySelector(".tocToggle");
      if (toggle) toggle.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
      parent = parent.parentElement?.closest(".tocChildren");
    }

    activeRow.scrollIntoView({ block: "center", behavior: "smooth" });
  }

}

function buildTOC(
  item,
  level = 0,
  parent = toc
) {

  const row =
    document.createElement(
      "div"
    );

  row.className =
    "tocItem";

  row.dataset.href = item.href;

  row.style.paddingLeft =
    (level * 20) + "px";

  const toggle =
    document.createElement(
      "span"
    );

  toggle.className =
    "tocToggle";

  const hasChildren =
    item.subitems &&
    item.subitems.length;

  toggle.innerHTML =
    hasChildren
      ? '<i class="fa-solid fa-chevron-right"></i>'
      : "";

  const link =
    document.createElement(
      "a"
    );

  link.textContent =
    item.label;

  link.href = "#";

  link.addEventListener(
    "click",
    e => {

      e.preventDefault();

      rendition.display(
        item.href
      );

      // closeSidebar();
        toggleSidebar();
      
      hideControls();

    }
  );

  row.appendChild(
    toggle
  );

  row.appendChild(
    link
  );

  parent.appendChild(
    row
  );

  if (hasChildren) {

    const children =
      document.createElement(
        "div"
      );

    children.className =
      "tocChildren";

    parent.appendChild(
      children
    );

    toggle.addEventListener(
      "click",
      e => {

        e.stopPropagation();

        children.classList.toggle(
          "open"
        );

        toggle.innerHTML =
          children.classList.contains(
            "open"
          )
            ? '<i class="fa-solid fa-chevron-down"></i>'
            : '<i class="fa-solid fa-chevron-right"></i>';

      }
    );

    item.subitems.forEach(
      child => {

        buildTOC(
          child,
          level + 1,
          children
        );

      }
    );

  }

}


/* =========================
   SLIDE PAGE ANIMATION
========================= */

let _sliding = false;

function slidePage(direction, action) {

  if (_sliding) return;
  _sliding = true;

  const viewer =
    document.getElementById("viewer");

  /* Slide out current page */
  viewer.style.transition =
    "transform 0.22s cubic-bezier(0.4,0,0.2,1)," +
    "opacity 0.22s ease";

  viewer.style.transform =
    direction === "next"
      ? "translateX(-100%)"
      : "translateX(100%)";

  viewer.style.opacity = "0";

  setTimeout(() => {

    /* Turn the page */
    action();

    /* Position new page on opposite side */
    viewer.style.transition = "none";
    viewer.style.transform =
      direction === "next"
        ? "translateX(100%)"
        : "translateX(-100%)";

    /* Force reflow */
    void viewer.offsetWidth;

    /* Slide in */
    viewer.style.transition =
      "transform 0.22s cubic-bezier(0.4,0,0.2,1)," +
      "opacity 0.22s ease";
    viewer.style.transform = "translateX(0)";
    viewer.style.opacity = "1";

    setTimeout(() => {
      viewer.style.transition = "";
      _sliding = false;
    }, 230);

  }, 220);

}

function pageNext() {
  if (!rendition || _sliding) return;
  slidePage("next", () => rendition.next());
}

function pagePrev() {
  if (!rendition || _sliding) return;
  slidePage("prev", () => rendition.prev());
}

/* =================
   START READER
================= */

function startReader() {

  rendition =
    book.renderTo(
      "viewer",
      {
        width: "100%",
        height: "100%",
        spread: "none",
        manager: "default",
        flow: "paginated",
        snap: true
      }
    );

  /* FONT & THEME */

  /* Inject @font-face into every epub iframe with !important */
  rendition.hooks.content.register(contents => {
    const base = window.location.href.replace(/\/[^/]*$/, "");
    const doc = contents.document;
    const style = doc.createElement("style");
    style.id = "custom-fonts";
    style.textContent = `
      @font-face {
        font-family: 'Open Sans';
        src: url('${base}/fonts/OpenSans-VariableFont_wdth_wght.ttf') format('truetype');
        font-weight: 100 900;
      }
      body, p, li, td, th, h1, h2, h3, h4, h5, h6, span, div {
        font-family: ${fontFamily} !important;
      }
    `;
    doc.head.appendChild(style);
  });

  rendition.themes.fontSize(
    fontSize + "%"
  );

  applyTheme();

  setupNavigationZones();

  hideControls();

  /* DISPLAY IMMEDIATELY — don't wait for locations */

  const readerData = loadReaderData();
  const savedLocation = readerData.location;

  rendition
    .display(savedLocation || undefined)
    .catch(() => rendition.display());

  /* BACKGROUND SETUP — TOC + locations, never blocks rendering */

  book.ready.then(() => {

    toc.innerHTML = "";

    book.navigation.toc.forEach(item => {
      buildTOC(item);
    });
    loadBookmarks();

    /* Generate locations in background — progress works once ready */
    book.locations
      .generate(1000)
      .catch(err => console.warn("Locations:", err));

  });

  /* =========================
     LINKS, CONTENTS & FOOTNOTES
     Runs every time a page renders
  ========================= */

  rendition.on("rendered", (section, view) => {

    const doc =
      view?.document ||
      view?.iframe?.contentDocument;

    if (!doc || !doc.body) return;

    installPinchTextZoom(doc);

    /* Detect if this page is a notes/endnotes page */
    const pageTitle = (doc.title || "").toLowerCase();
    const firstH = (doc.querySelector("h1,h2,h3")?.textContent || "").toLowerCase();
    const isNotesPage =
      pageTitle.includes("note") ||
      pageTitle.includes("endnote") ||
      firstH.includes("note") ||
      firstH.includes("endnote");

    /* Detect if this page is a Table of Contents page —
       links here should always navigate normally */
    const isTocPage =
      pageTitle.includes("content") ||
      pageTitle.includes("toc") ||
      firstH.includes("content") ||
      firstH.includes("table of contents") ||
      doc.querySelector('nav[epub\\:type="toc"]') !== null;

    /* Disable text selection in iframe —
       browser menu won't appear at all */
    const noSelStyle =
      doc.getElementById("noSelStyle") ||
      doc.createElement("style");
    noSelStyle.id = "noSelStyle";
    noSelStyle.textContent =
      "body, * { " +
      "  -webkit-user-select: none !important;" +
      "  user-select: none !important;" +
      "}";
    if (!doc.getElementById("noSelStyle"))
      doc.head.appendChild(noSelStyle);

    /* Touch navigation inside iframe
       so taps reach links naturally */
    let _tx = null, _ty = null, _tt = null;

    doc.addEventListener("touchstart", e => {
      _tx = e.touches[0].clientX;
      _ty = e.touches[0].clientY;
      _tt = Date.now();
    }, { passive: true });

    doc.addEventListener("touchend", e => {
      const t = e.changedTouches[0];

      /* If footnote popup is open, close it and swallow tap */
      const existingPopup = document.getElementById("fnPopup");
      if (existingPopup) {
        existingPopup.remove();
        _tx = null;
        return;
      }

      /* If sidebar is open, any tap on the
         reader area (inside iframe) closes it —
         but ignore taps over the footer/header */
      if (sidebarIsOpen()) {
        const footerEl = document.querySelector(".bottomFooter");
        const headerEl = document.querySelector("header");
        let overControl = false;
        if (footerEl) {
          const fr = footerEl.getBoundingClientRect();
          if (t.clientY >= fr.top && t.clientY <= fr.bottom) overControl = true;
        }
        if (headerEl) {
          const hr = headerEl.getBoundingClientRect();
          if (t.clientY >= hr.top && t.clientY <= hr.bottom) overControl = true;
        }
        if (overControl) { _tx = null; return; }
        toggleSidebar();
        _tx = null;
        return;
      }

      if (_tx === null) { _tx = null; return; }
      const dx = t.clientX - _tx;
      const dy = t.clientY - _ty;
      const dt = Date.now() - _tt;
      _tx = null;

      /* Ignore taps that land over the footer/header —
         let the actual button handle it instead */
      const footerEl = document.querySelector(".bottomFooter");
      const headerEl = document.querySelector("header");
      if (footerEl) {
        const fr = footerEl.getBoundingClientRect();
        if (t.clientY >= fr.top && t.clientY <= fr.bottom) return;
      }
      if (headerEl) {
        const hr = headerEl.getBoundingClientRect();
        if (t.clientY >= hr.top && t.clientY <= hr.bottom) return;
      }

      /* Swipe navigation — horizontal swipe > 40px */
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) { pageNext(); hideControls(); }
        else { pagePrev(); hideControls(); }
        return;
      }

      /* Ignore long press or diagonal swipe */
      if (Math.abs(dx) > 25 || Math.abs(dy) > 25 || dt > 500) return;
      /* Bail if tap was on a link — let click handle it */
      const el = doc.elementFromPoint(t.clientX, t.clientY);
      if (el && el.closest("a")) return;
      /* Use screen coords via getBoundingClientRect
         because iframe clientX is relative to iframe */
      const iframe = viewer.querySelector("iframe");
      const rect = iframe
        ? iframe.getBoundingClientRect()
        : { left: 0, width: window.innerWidth };
      const screenX = rect.left + t.clientX;
      const W = window.innerWidth;
      if (screenX < W * 0.3) { pagePrev(); hideControls(); }
      else if (screenX > W * 0.7) { pageNext(); hideControls(); }
      else { toggleControls(); }
    }, { passive: true });

    /* Use document-level capture listener so it fires BEFORE
       epub.js's own link handler, preventing page navigation */
    doc.addEventListener("click", e => {

      const anchor = e.target.closest("a[href]");
      if (!anchor) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const href = anchor.getAttribute("href") || "";

      /* On a Table of Contents page, all links should
         navigate normally — never show a footnote popup */
      if (isTocPage) {
        rendition.display(href).catch(err => console.error(err));
        return;
      }

      const epubType = anchor.getAttribute("epub:type") || "";
      const role = anchor.getAttribute("role") || "";

      /* Footnote ref — explicit epub:type or role */
      const isNote =
        epubType.includes("noteref") ||
        role.includes("doc-noteref") ||
        anchor.classList.contains("footnote") ||
        anchor.classList.contains("endnote");

      if (isNote && href.startsWith("#")) {
        const el = doc.getElementById(href.slice(1));
        if (el) { showFootnote(el); return; }
      }

      /* Same-file fragment — notes page back-link or footnote popup */
      if (href.startsWith("#")) {
        /* On notes page — back-links should navigate, not show popup */
        if (isNotesPage) {
          rendition.display(section.href + href).catch(() => {
            rendition.history?.back?.();
          });
          return;
        }
        const el = doc.getElementById(href.slice(1));
        if (el) { showFootnote(el); return; }
        return;
      }

      /* Cross-file fragment — ONLY treat as footnote if it's an
         explicit note reference. Otherwise it's normal navigation
         (e.g. TOC link to "chapter2.xhtml#section-b") */
      if (href.includes("#")) {
        if (isNotesPage || !isNote) {
          rendition.display(href).catch(err => console.error(err));
          return;
        }
        const parts = href.split("#");
        const fileHref = parts[0];
        const fragId = parts[1];
        const spineItem = book.spine.get(fileHref);
        if (spineItem) {
          spineItem.load(book.load.bind(book)).then(() => {
            const targetDoc = spineItem.document;
            if (targetDoc) {
              const el = targetDoc.getElementById(fragId);
              if (el) { showFootnote(el); return; }
            }
            rendition.display(href).catch(err => console.error(err));
          }).catch(() => {
            rendition.display(href).catch(err => console.error(err));
          });
          return;
        }
      }

      /* External link */
      if (/^https?:\/\//.test(href)) {
        if (confirm("Open link?\n" + href))
          window.open(href, "_blank", "noopener");
        return;
      }

      /* Internal chapter navigation */
      rendition.display(href).catch(err => console.error(err));

    }, true); /* capture: true — fires before epub.js */

  });

  /* Footnote popup */
  function showFootnote(el) {

    document.getElementById("fnPopup")?.remove();

    const clone = el.cloneNode(true);

    /* Remove ALL links from popup */
    clone.querySelectorAll("a").forEach(a => {
      const span = document.createElement("span");
      span.textContent = a.textContent;
      a.replaceWith(span);
    });

    /* Don't show popup if content is just a number or back-link marker
       e.g. "6" or "[←6]" — these are back-links, not real footnotes */
    const text = clone.textContent.trim();
    if (/^\[?←?\d+\]?$/.test(text) || /^\d+$/.test(text)) return;

    const isDark =
      document.body.classList.contains("dark") ||
      document.body.classList.contains("night");

    const popup = document.createElement("div");
    popup.id = "fnPopup";
    Object.assign(popup.style, {
      position: "fixed",
      bottom: "70px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "min(480px, 90vw)",
      background: isDark ? "#1e1e1e" : "#fffdf6",
      color: isDark ? "#eee" : "#111",
      border: "1px solid #888",
      borderRadius: "10px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
      zIndex: "99999",
      overflow: "hidden",
      fontSize: "14px",
      fontFamily: "Arial, sans-serif",
    });
    popup.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;' +
      'padding:8px 12px;border-bottom:1px solid #555;font-size:11px;' +
      'text-transform:uppercase;letter-spacing:.08em;color:#aaa;">' +
      '<span>Note</span>' +
      '<button id="fnClose" style="background:none;border:none;cursor:pointer;' +
      'color:inherit;font-size:18px;padding:2px 6px;">✕</button></div>' +
      '<div style="padding:12px 14px;max-height:200px;overflow-y:auto;line-height:1.6;">' +
      clone.innerHTML + '</div>';

    document.body.appendChild(popup);

    document.getElementById("fnClose")
      .addEventListener("click", () => popup.remove());

    setTimeout(() => {
      document.addEventListener("click", function h(e) {
        if (!popup.contains(e.target)) {
          popup.remove();
          document.removeEventListener("click", h);
        }
      });
    }, 150);

  }

    /* SAVE LOCATION */

  rendition.on(
   "relocated",
   location => {

    try {

      currentLocation =
        location;

      /* =========================
         CALCULATE PROGRESS
      ========================= */

      const percentage =
        book.locations
          .percentageFromCfi(
            location.start.cfi
          );

      const percent =
        Math.floor(
          percentage * 100
        );

      /* =========================
         SAVE READER DATA
      ========================= */

      const readerData = {

        location:
          location.start.cfi,

        progress:
          percent,

        lastRead:
          new Date()
            .toISOString(),

        chapter:
          location.start.href

      };

      saveReaderData(
        readerData
      );

      /* =========================
         UPDATE UI
      ========================= */

      progressText.textContent =
        percent + "%";

      progressFill.style.width =
        percent + "%";
      
      const readingInfo =
        document.getElementById(
        "readingInfo"
      );

      if (readingInfo) {

      const chapterName =
        getCurrentChapter(
        location.start.href
      );

      readingInfo.textContent =
        chapterName +
        " • " +
        percent +
        "%";

    }

      highlightActiveTOC(location.start.href);

 }

      catch (error) {

       console.error(
        error
      );

    }

   }
    
 );

}  


/* ===================
   CONTROLS
=================== */

/* ===== HIDE HEADER ===== */

function hideHeader() {

  header.classList.add(
    "hideControls"
  );

}

/* ===== SHOW HEADER ===== */
function showHeader() {

  header.classList.remove(
    "hideControls"
  );

}

/* ===== HIDE FOOTER ===== */
function hideFooter() {

  footer.classList.add(
    "hideControls"
  );

}

/* ===== SHOW FOOTER ===== */
function showFooter() {

  footer.classList.remove(
    "hideControls"
  );

}

/* ===== HIDE CONTROLS ===== */
function hideControls() {

  hideHeader();

  hideFooter();

  controlsVisible = false;

  document.body.classList.add(
    "readingMode"
  );

}

/* ===== SHOW CONTROLS ===== */
function showControls() {

  showHeader();

  showFooter();

  controlsVisible = true;

  document.body.classList.remove(
    "readingMode"
  );

}

/* ===== TOGGLE CONTROLS - middle tap ===== */
function toggleControls() {

  controlsVisible
    ? hideControls()
    : showControls();

}


/* =========================
 GESTURES (Tap Next/Prev)
========================= */

/* GESTURES (Sidebar) */

function sidebarIsOpen() {

  return sidebar.classList.contains(
    "active"
  );

}

/* GESTURES (Navigation) */

function setupNavigationZones() {

  /* Desktop mouse clicks on zones */
  leftZone.addEventListener("click", () => {
    if (sidebarIsOpen()) return;
    pagePrev();
    hideControls();
  });

  rightZone.addEventListener("click", () => {
    if (sidebarIsOpen()) return;
    pageNext();
    hideControls();
  });

  centerZone.addEventListener("click", () => {
    if (sidebarIsOpen()) return;
    toggleControls();
  });

  /* Keyboard (desktop) */
  document.addEventListener("keydown", e => {
    if (!rendition) return;
    if (document.activeElement === searchInput) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault(); pageNext();
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault(); pagePrev();
    }
  });

}


/* =========================
   THEME ENGINE
========================= */

const THEMES = {
  light: {
    bg:    "#f5f5f5",
    color: "#111111",
    link:  "#1565c0",
  },
  dark: {
    bg:    "#111111",
    color: "#eeeeee",
    link:  "#4dabff",
  },
  sepia: {
    bg:    "#f4ede0",
    color: "#2c1a0e",
    link:  "#7a4a1a",
  },
  night: {
    bg:    "#000000",
    color: "#bbbbbb",
    link:  "#4dabff",
  },
};

/* =========================
   LIBRARY DAY/NIGHT TOGGLE
========================= */

function applyLibraryDayNight(forceTheme) {

  let theme = forceTheme;

  if (!theme) {
    theme = localStorage.getItem("library-theme") || "dark";
  }

  localStorage.setItem("library-theme", theme);

  /* Apply only to the library screen element,
     never touch body classes */
  const lib = document.getElementById("libraryScreen");
  if (lib) {
    lib.setAttribute("data-theme", theme);
  }

  const dayNightBtn =
    document.getElementById("libraryDayNightBtn");

  if (dayNightBtn) {
    dayNightBtn.innerHTML = theme === "dark"
      ? '<i class="fa-solid fa-moon"></i>'
      : '<i class="fa-solid fa-sun"></i>';
  }
}

function toggleLibraryDayNight() {

  const current =
    localStorage.getItem("library-theme") || "dark";

  const next = current === "light" ? "dark" : "light";

  applyLibraryDayNight(next);
}

function applyTheme(theme) {

  if (!theme) {
    theme = localStorage.getItem(
      "reader-theme"
    ) || "dark";
  }

  localStorage.setItem(
    "reader-theme", theme
  );

  /* Apply only to body — reader only */
  document.body.classList.remove(
    "dark", "sepia", "night"
  );

  if (theme !== "light") {
    document.body.classList.add(theme);
  }

  /* Mark active option */
  document.querySelectorAll(
    ".themeOption"
  ).forEach(btn => {
    btn.classList.toggle(
      "active",
      btn.dataset.theme === theme
    );
  });

  if (!rendition) return;

  const t = THEMES[theme] || THEMES.dark;

  rendition.themes.default({
    body: {
      background:   t.bg,
      color:        t.color,
      padding:      "20px",
      "line-height":"1.7",
      "font-family": fontFamily,
    },
    a: { color: t.link },
  });

  rendition.themes.fontSize(
    fontSize + "%"
  );

}


/* =========================
   THEME OPTION CLICKS
========================= */

const libraryDayNightBtn =
  document.getElementById("libraryDayNightBtn");

if (libraryDayNightBtn) {
  libraryDayNightBtn.addEventListener(
    "click",
    toggleLibraryDayNight
  );
}

document.querySelectorAll(
  ".themeOption"
).forEach(btn => {
  btn.addEventListener("click", () => {
    applyTheme(btn.dataset.theme);
    closeThemePicker();
  });
});

/* =============
   SEARCH BOOK
============= */

async function searchBook(
  query
) {

  searchResults.innerHTML =
    "Searching...";

  const results = [];

  try {

    for (
      const item of book.spine.spineItems
    ) {

      await item.load(
        book.load.bind(book)
      );

      const doc =
        item.document;

      const walker =
        doc.createTreeWalker(
          doc.body,
          NodeFilter.SHOW_TEXT
        );

      let node;

      while (
        (node = walker.nextNode())
      ) {

        const text =
          node.textContent;

        const lowerText =
          text.toLowerCase();

        const lowerQuery =
          query.toLowerCase();

        const index =
          lowerText.indexOf(
            lowerQuery
          );

        if (index !== -1) {

          const range =
            doc.createRange();

          range.setStart(
            node,
            index
          );

          range.setEnd(
            node,
            index +
            query.length
          );

          const cfi =
            item.cfiFromRange(
              range
            );

          const snippet =
            text.substring(
              Math.max(
                0,
                index - 40
              ),
              index + 80
            );

          results.push({

            cfi,

            excerpt:
              snippet

          });

        }

      }

      item.unload();

    }

    renderSearchResults(
      results
    );

  }

  catch (error) {

    console.error(error);

    searchResults.innerHTML =
      "Search failed.";

  }

}


/* =============
   SEARCH RESULTS 
============= */ 

function renderSearchResults(
  results
) {

  searchResults.innerHTML =
    "";

  if (!results.length) {

    searchResults.innerHTML =
      "No results found.";

    return;

  }

  results.forEach(
    result => {

      const div =
        document.createElement(
          "div"
        );

      div.className =
        "searchItem";

      div.textContent =
        result.excerpt;

      div.addEventListener(
       "click",
        async () => {

      try {

      /* OPEN LOCATION */

      await rendition.display(
        result.cfi
      );

      /* REMOVE OLD HIGHLIGHT */

      if (
        activeSearchHighlight
      ) {

        rendition.annotations.remove(
          activeSearchHighlight,
          "highlight"
        );

      }

      /* ADD HIGHLIGHT */

      rendition.annotations.highlight(

        result.cfi,

        {},

        null,

        "search-highlight",

        {

          fill: "yellow",

          "fill-opacity": "0.35"

        }

      );

      /* SAVE ACTIVE */

      activeSearchHighlight =
        result.cfi;

      /* CLOSE SEARCH */

      searchModal.classList.remove(
        "active"
      );

    }

    catch (error) {

      console.error(
        error
      );

      alert(
        "Could not open result."
      );

     }

    }
  );

      searchResults.appendChild(
        div
      );

    }
  );

}


/* =========================
   UPDATE MENU ICONS
========================= */

function updateMenuButtons() {

  const isOpen =
    sidebar.classList.contains(
      "active"
    );

  const icon =
    isOpen
      ? "✕"
      : "☰";

  menuBtn.textContent =
    icon;

  bottomMenuBtn.textContent =
    icon;

}

/* TOGGLE SIDEBAR */

function toggleSidebar() {

  const isOpen =
    sidebar.classList.contains(
      "active"
    );

  if (isOpen) {

    /* X pressed */

    sidebar.classList.remove(
      "active"
    );

    updateMenuButtons();

    hideControls();

  }

  else {

    /* ☰ pressed */

    sidebar.classList.add(
      "active"
    );

    updateMenuButtons();

    showHeader();

    hideFooter();

  }

}


/* CLOSE SIDEBAR */

function closeSidebar() {
  sidebar.classList.remove("active");
  
  updateMenuButtons();
  
  hideHeader();

}

/* MENU EVENTS */

menuBtn.addEventListener(
  "click",
  toggleSidebar
);

bottomMenuBtn.addEventListener(
  "click",
  toggleSidebar
);


/* ==========
   OTHER EVENTS
========== */

/* Theme button — toggle picker panel */
const themePicker =
  document.getElementById(
    "themePicker"
  );

function toggleThemePicker() {
  themePicker.classList.toggle("open");
  closeFontPicker();
}

function closeThemePicker() {
  themePicker.classList.remove("open");
}

themeBtn.addEventListener(
  "click",
  e => {
    e.stopPropagation();
    toggleThemePicker();
  }
);

/* Close pickers when nav zones are tapped */
[leftZone, centerZone, rightZone].forEach(
  zone => zone.addEventListener(
    "click",
    () => {
      closeThemePicker();
      closeFontPicker();
    }
  )
);

/* =========================
   FONT PICKER
========================= */

const fontPicker =
  document.getElementById("fontPicker");

const fontPickerBtn =
  document.getElementById("fontPickerBtn");

function applyFont(font) {
  fontFamily = font;
  localStorage.setItem("fontFamily", font);

  document.querySelectorAll(".fontOption")
    .forEach(btn => {
      btn.classList.toggle(
        "active",
        btn.dataset.font === font
      );
    });

  if (!rendition) return;

  rendition.getContents().forEach(contents => {
    const doc = contents.document;
    if (!doc) return;
    let style = doc.getElementById("custom-fonts");
    if (style) {
      style.textContent = style.textContent.replace(
        /body,[\s\S]*?font-family:.*?!important;[\s\S]*?}/,
        `body, p, li, td, th, h1, h2, h3, h4, h5, h6, span, div {
          font-family: ${font} !important;
        }`
      );
    }
    if (doc.body) {
      doc.body.style.setProperty("font-family", font, "important");
    }
  });

  applyTheme();
}

function toggleFontPicker() {
  fontPicker.classList.toggle("open");
  closeThemePicker();
}

function closeFontPicker() {
  if (fontPicker) fontPicker.classList.remove("open");
}

if (fontPickerBtn) {
  fontPickerBtn.addEventListener("click", e => {
    e.stopPropagation();
    toggleFontPicker();
  });
}

document.querySelectorAll(".fontOption")
  .forEach(btn => {
    btn.addEventListener("click", () => {
      applyFont(btn.dataset.font);
      closeFontPicker();
    });
  });

/* Mark saved font as active on load */
document.querySelectorAll(".fontOption")
  .forEach(btn => {
    btn.classList.toggle(
      "active",
      btn.dataset.font === fontFamily
    );
  });

nextPage.addEventListener(
  "click",
  () => {

    pageNext();

    hideHeader();

  }
);

prevPage.addEventListener(
  "click",
  () => {

    pagePrev();
    
    hideHeader();

  }
);

bookmarkBtn.addEventListener(
  "click",
  () => {

    saveBookmark();

    alert(
      "Bookmark saved"
    );

  }
);

bottomDecreaseFont.addEventListener(
  "click",
  () => {

    if (fontSize <= 70)
      return;

    fontSize -= 10;

    rendition.themes.fontSize(
      fontSize + "%"
    );

    localStorage.setItem(
      "fontSize",
      fontSize
    );

  }
);

bottomIncreaseFont.addEventListener(
  "click",
  () => {

    fontSize += 10;

    rendition.themes.fontSize(
      fontSize + "%"
    );

    localStorage.setItem(
      "fontSize",
      fontSize
    );

  }
);

searchBtn.addEventListener(
  "click",
  () => {

    searchModal.classList.add(
      "active"
    );

    searchInput.focus();

    hideControls();

  }
);

closeSearch.addEventListener(
  "click",
  () => {

    searchModal.classList.remove(
      "active"
    );

    hideControls();

  }
);

searchInput.addEventListener(
  "keydown",
  e => {

    if (
      e.key === "Enter"
    ) {

      const query =
        searchInput.value.trim();

      if (!query)
        return;

      searchBook(query);

    }

  }
);


/* ================
   SERVICE WORKER
================ */

if (
  "serviceWorker" in navigator
) {

  window.addEventListener(
    "load",
    async () => {

      try {

        await navigator
          .serviceWorker
          .register(
            "./sw.js"
          );

      }

      catch (error) {

        console.error(error);

      }

    }
  );

}

/* =========================
   SIDEBAR TAB SWITCHING
========================= */

document.querySelectorAll(".sidebarTab")
  .forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".sidebarTab")
        .forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".tabPanel")
        .forEach(p => p.classList.remove("active"));
      const target = document.getElementById(
        tab.dataset.tab === "toc"
          ? "tocPanel"
          : "bookmarksPanel"
      );
      if (target) target.classList.add("active");
    });
  });

/* =========================
   SIDEBAR GESTURES
   Tap outside + swipe left to close
========================= */

/* 1. Click outside — desktop */
document.addEventListener("click", e => {
  if (
    sidebar.classList.contains("active") &&
    !sidebar.contains(e.target) &&
    e.target !== menuBtn &&
    e.target !== bottomMenuBtn &&
    !e.target.closest("header")
  ) {
    toggleSidebar();
  }
});

/* 2. Swipe left ON SIDEBAR — mobile
   Attached to sidebar so it doesn't
   compete with iframe touch handlers */
let swipeStartX = null;
let swipeStartY = null;

sidebar.addEventListener("touchstart", e => {
  swipeStartX = e.touches[0].clientX;
  swipeStartY = e.touches[0].clientY;
}, { passive: true });

sidebar.addEventListener("touchend", e => {
  if (swipeStartX === null) return;
  const dx = e.changedTouches[0].clientX - swipeStartX;
  const dy = e.changedTouches[0].clientY - swipeStartY;
  swipeStartX = null;
  swipeStartY = null;
  if (dx < -50 && Math.abs(dx) > Math.abs(dy)) {
    toggleSidebar();
  }
}, { passive: true });

/* 3. Tap outside — mobile
   Track touchstart at document level
   so we know where the finger started
   regardless of what the iframe does */
let _tapStartX = null, _tapStartY = null;

document.addEventListener("touchstart", e => {
  if (!sidebar.classList.contains("active")) return;
  _tapStartX = e.touches[0].clientX;
  _tapStartY = e.touches[0].clientY;
}, { passive: true, capture: true });

document.addEventListener("touchend", e => {
  if (!sidebar.classList.contains("active")) {
    _tapStartX = null; return;
  }
  if (_tapStartX === null) return;

  const t  = e.changedTouches[0];
  const dx = Math.abs(t.clientX - _tapStartX);
  const dy = Math.abs(t.clientY - _tapStartY);
  _tapStartX = null;

  /* Only act on short taps, not swipes */
  if (dx > 15 || dy > 15) return;

  /* Use capture-phase coordinates to
     find element before iframe consumes */
  const el = document.elementFromPoint(
    t.clientX, t.clientY
  );

  if (
    el &&
    !sidebar.contains(el) &&
    !menuBtn.contains(el) &&
    !bottomMenuBtn.contains(el) &&
    !el.closest("#faqBtn") &&
    !el.closest("#backBtn") &&
    !el.closest("header")
  ) {
    toggleSidebar();
  }
}, { passive: true, capture: true });

/* Show library on start */
libraryScreen.style.display = "flex";
readerApp.style.display = "none";

/* Apply saved theme immediately so the
   library screen matches the reader theme */
applyLibraryDayNight();


/* =====================================================
   v1.6.0 - Firebase sync, in-app FAQ, pull refresh,
   pinch-to-text zoom. LocalStorage remains authoritative
   offline and Firebase is the cross-device sync layer.
===================================================== */

let cloudUser = null;
let cloudDb = null;
let cloudAuth = null;
let cloudReady = false;
let authMode = "login";
let preferenceSyncTimer = null;
let progressSyncTimer = null;

function firebaseConfigured() {
  const c = window.GES_PROMOHUB_FIREBASE_CONFIG;
  return !!(window.firebase && c && c.apiKey && !c.apiKey.startsWith("PASTE_") && c.appId && !c.appId.startsWith("PASTE_"));
}

function bookCloudId() {
  return (selectedBookFile || "book").replace(/^\.\/library\//, "").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}

function getBookReaderDataKey() {
  return READER_DATA_KEY + "-" + bookCloudId();
}

/* Upgrade the original single-book local progress store to a book-specific
   store without discarding an existing installation's saved position. */
const _legacyLoadReaderData = loadReaderData;
const _legacySaveReaderData = saveReaderData;
loadReaderData = function() {
  try {
    const key = getBookReaderDataKey();
    const own = localStorage.getItem(key);
    if (own) return JSON.parse(own);
    const legacy = _legacyLoadReaderData();
    if (legacy && legacy.location) {
      localStorage.setItem(key, JSON.stringify(legacy));
      return legacy;
    }
  } catch (e) { console.warn("Local reading data:", e); }
  return {};
};

saveReaderData = function(data) {
  try {
    data.updatedAtMs = Date.now();
    localStorage.setItem(getBookReaderDataKey(), JSON.stringify(data));
    scheduleProgressSync(data);
  } catch (e) { console.error(e); }
};

function localPreferences() {
  return {
    theme: localStorage.getItem("reader-theme") || "dark",
    libraryTheme: localStorage.getItem("library-theme") || "dark",
    fontSize: Math.max(70, Math.min(200, Number(localStorage.getItem("fontSize")) || fontSize || 100)),
    fontFamily: localStorage.getItem("fontFamily") || fontFamily || "serif",
    updatedAtMs: Number(localStorage.getItem("ges-promohub-pref-updated")) || Date.now()
  };
}

function markPreferencesChanged() {
  localStorage.setItem("ges-promohub-pref-updated", String(Date.now()));
  schedulePreferenceSync();
}

function schedulePreferenceSync() {
  clearTimeout(preferenceSyncTimer);
  preferenceSyncTimer = setTimeout(syncPreferencesToCloud, 700);
}

function scheduleProgressSync(data) {
  if (!cloudReady || !cloudUser || !cloudDb) return;
  clearTimeout(progressSyncTimer);
  progressSyncTimer = setTimeout(async () => {
    try {
      await cloudDb.collection("users").doc(cloudUser.uid)
        .collection("reading").doc(bookCloudId()).set({
          bookFile: selectedBookFile,
          cfi: data.location || "",
          progress: Number(data.progress) || 0,
          chapter: data.chapter || "",
          updatedAtMs: Number(data.updatedAtMs) || Date.now(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) { console.warn("Cloud progress sync:", e); }
  }, 1200);
}

async function syncPreferencesToCloud() {
  if (!cloudReady || !cloudUser || !cloudDb) return;
  try {
    const prefs = localPreferences();
    await cloudDb.collection("users").doc(cloudUser.uid)
      .collection("preferences").doc("reader").set({
        ...prefs,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
  } catch (e) { console.warn("Cloud preferences sync:", e); }
}

async function mergePreferencesFromCloud() {
  if (!cloudReady || !cloudUser || !cloudDb) return;
  try {
    const ref = cloudDb.collection("users").doc(cloudUser.uid).collection("preferences").doc("reader");
    const snap = await ref.get();
    const local = localPreferences();
    if (!snap.exists) { await syncPreferencesToCloud(); return; }
    const remote = snap.data() || {};
    if ((Number(remote.updatedAtMs) || 0) > (Number(local.updatedAtMs) || 0)) {
      if (remote.theme) localStorage.setItem("reader-theme", remote.theme);
      if (remote.libraryTheme) localStorage.setItem("library-theme", remote.libraryTheme);
      if (remote.fontFamily) { localStorage.setItem("fontFamily", remote.fontFamily); fontFamily = remote.fontFamily; }
      if (remote.fontSize) { fontSize = Math.max(70, Math.min(200, Number(remote.fontSize))); localStorage.setItem("fontSize", String(fontSize)); }
      localStorage.setItem("ges-promohub-pref-updated", String(remote.updatedAtMs || Date.now()));
      applyLibraryDayNight();
      if (rendition) { applyTheme(); applyFont(fontFamily); }
    } else {
      await syncPreferencesToCloud();
    }
  } catch (e) { console.warn("Preference merge:", e); }
}

async function mergeProgressFromCloud() {
  if (!cloudReady || !cloudUser || !cloudDb) return;
  try {
    const ref = cloudDb.collection("users").doc(cloudUser.uid).collection("reading").doc(bookCloudId());
    const snap = await ref.get();
    const local = loadReaderData();
    if (!snap.exists) { if (local.location) scheduleProgressSync(local); return; }
    const remote = snap.data() || {};
    if ((Number(remote.updatedAtMs) || 0) > (Number(local.updatedAtMs) || 0) && remote.cfi) {
      const merged = { location: remote.cfi, progress: remote.progress || 0, chapter: remote.chapter || "", lastRead: new Date().toISOString(), updatedAtMs: remote.updatedAtMs };
      localStorage.setItem(getBookReaderDataKey(), JSON.stringify(merged));
      if (rendition) rendition.display(remote.cfi).catch(() => {});
    } else if (local.location) {
      scheduleProgressSync(local);
    }
  } catch (e) { console.warn("Progress merge:", e); }
}

function bookmarkId(b) {
  const s = [selectedBookFile, b.cfi, b.date || ""].join("|");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return "b" + (h >>> 0).toString(36);
}

async function syncLocalBookmarksToCloud() {
  if (!cloudReady || !cloudUser || !cloudDb) return;
  try {
    const arr = JSON.parse(localStorage.getItem(getBookmarksKey()) || "[]");
    const batch = cloudDb.batch();
    arr.forEach(b => {
      const ref = cloudDb.collection("users").doc(cloudUser.uid).collection("bookmarks").doc(bookmarkId(b));
      batch.set(ref, { ...b, bookFile: selectedBookFile, updatedAtMs: Date.now() }, { merge: true });
    });
    if (arr.length) await batch.commit();
  } catch (e) { console.warn("Bookmark upload:", e); }
}


async function deleteCloudBookmark(bookmark) {
  if (!cloudReady || !cloudUser || !cloudDb) return;
  try {
    const col = cloudDb.collection("users").doc(cloudUser.uid).collection("bookmarks");
    const q = await col.where("bookFile", "==", selectedBookFile).where("cfi", "==", bookmark.cfi).get();
    const batch = cloudDb.batch(); q.forEach(d => batch.delete(d.ref)); if (!q.empty) await batch.commit();
  } catch (e) { console.warn("Bookmark delete sync:", e); }
}

async function mergeBookmarksFromCloud() {
  if (!cloudReady || !cloudUser || !cloudDb) return;
  try {
    await syncLocalBookmarksToCloud();
    const snap = await cloudDb.collection("users").doc(cloudUser.uid).collection("bookmarks")
      .where("bookFile", "==", selectedBookFile).get();
    const local = JSON.parse(localStorage.getItem(getBookmarksKey()) || "[]");
    const map = new Map(local.map(b => [b.cfi + "|" + (b.date || ""), b]));
    snap.forEach(d => { const b=d.data(); map.set(b.cfi + "|" + (b.date || ""), b); });
    localStorage.setItem(getBookmarksKey(), JSON.stringify([...map.values()]));
    loadBookmarks();
  } catch (e) { console.warn("Bookmark merge:", e); }
}

async function syncCurrentBookCloud() {
  await Promise.allSettled([mergeProgressFromCloud(), mergeBookmarksFromCloud()]);
}

/* Existing bookmark actions stay local-first. These observers mirror the
   final local state to Firestore after add/delete without changing UI flow. */
const _saveBookmarkLocal = saveBookmark;
saveBookmark = function() { _saveBookmarkLocal(); setTimeout(syncLocalBookmarksToCloud, 0); };

const _loadBookmarksLocal = loadBookmarks;
loadBookmarks = function() { _loadBookmarksLocal(); };

/* Preference setters keep their original behavior, then schedule cloud sync. */
const _applyThemeLocal = applyTheme;
applyTheme = function(theme) { _applyThemeLocal(theme); if (theme) markPreferencesChanged(); postFaqTheme(theme || localStorage.getItem("reader-theme") || "dark"); };
const _applyFontLocal = applyFont;
applyFont = function(font) { _applyFontLocal(font); markPreferencesChanged(); };

/* Capture A+/A- changes already handled by the original buttons. */
if (bottomDecreaseFont) bottomDecreaseFont.addEventListener("click", markPreferencesChanged);
if (bottomIncreaseFont) bottomIncreaseFont.addEventListener("click", markPreferencesChanged);
if (libraryDayNightBtn) libraryDayNightBtn.addEventListener("click", markPreferencesChanged);

/* ---------- Firebase Authentication ---------- */
const authScreen = document.getElementById("authScreen");
const authName = document.getElementById("authName");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authPrimaryBtn = document.getElementById("authPrimaryBtn");
const googleSignInBtn = document.getElementById("googleSignInBtn");
const authModeBtn = document.getElementById("authModeBtn");
const authOfflineBtn = document.getElementById("authOfflineBtn");
const authError = document.getElementById("authError");

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  authName.style.display = signup ? "block" : "none";
  authPrimaryBtn.textContent = signup ? "Create account" : "Login";
  authModeBtn.textContent = signup ? "Already have an account? Login" : "Create an account";
  authPassword.autocomplete = signup ? "new-password" : "current-password";
  authError.textContent = "";
}

function showAuth() { if (authScreen) authScreen.classList.add("active"); }
function hideAuth() { if (authScreen) authScreen.classList.remove("active"); }

function initials(name, email) {
  const source = (name || email || "U").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "U") + (parts.length > 1 ? parts[parts.length-1][0] : "")).toUpperCase();
}

function setAvatar(el, user) {
  if (!el || !user) return;
  if (user.photoURL) el.innerHTML = '<img src="' + user.photoURL.replace(/"/g, "&quot;") + '" alt="">';
  else el.textContent = initials(user.displayName, user.email);
}

async function ensureUserProfile(user) {
  if (!cloudDb || !user) return;
  const ref = cloudDb.collection("users").doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ uid:user.uid, name:user.displayName || "", email:user.email || "", photoURL:user.photoURL || "", role:"user", accountStatus:"active", createdAt:firebase.firestore.FieldValue.serverTimestamp(), updatedAt:firebase.firestore.FieldValue.serverTimestamp() });
  } else {
    await ref.set({ name:user.displayName || snap.data().name || "", email:user.email || "", photoURL:user.photoURL || "", updatedAt:firebase.firestore.FieldValue.serverTimestamp() }, { merge:true });
  }
}

async function updateAccountUI(user) {
  [document.getElementById("profileAvatar"), document.getElementById("libraryProfileAvatar"), document.getElementById("accountAvatar")].forEach(el => setAvatar(el,user));
  document.getElementById("accountName").textContent = user?.displayName || "GES PromoHub User";
  document.getElementById("accountEmail").textContent = user?.email || "";
  try {
    const s = await cloudDb.collection("users").doc(user.uid).get();
    const d = s.data() || {};
    document.getElementById("accountType").textContent = (d.role || "user") + " · " + (d.accountStatus || "active");
  } catch (_) {}
}

async function initFirebaseFeatures() {
  if (!firebaseConfigured()) { cloudReady = false; return; }
  try {
    if (!firebase.apps.length) firebase.initializeApp(window.GES_PROMOHUB_FIREBASE_CONFIG);
    cloudAuth = firebase.auth();
    cloudDb = firebase.firestore();
    cloudAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
    cloudAuth.onAuthStateChanged(async user => {
      cloudUser = user || null;
      cloudReady = !!user;
      if (!user) { showAuth(); return; }
      hideAuth();
      await ensureUserProfile(user);
      await updateAccountUI(user);
      await mergePreferencesFromCloud();
      await syncCurrentBookCloud();
    });
  } catch (e) { console.warn("Firebase startup:", e); }
}

if (authModeBtn) authModeBtn.addEventListener("click", () => setAuthMode(authMode === "login" ? "signup" : "login"));
if (authOfflineBtn) authOfflineBtn.addEventListener("click", hideAuth);
if (authPrimaryBtn) authPrimaryBtn.addEventListener("click", async () => {
  if (!cloudAuth) { authError.textContent = "Firebase is not configured yet. You can continue offline."; return; }
  authError.textContent = "";
  try {
    if (authMode === "signup") {
      const cred = await cloudAuth.createUserWithEmailAndPassword(authEmail.value.trim(), authPassword.value);
      if (authName.value.trim()) await cred.user.updateProfile({ displayName: authName.value.trim() });
      await ensureUserProfile(cred.user);
      await cloudAuth.signOut();
      setAuthMode("login");
      authPassword.value = "";
      authError.textContent = "Account created. Please log in.";
      showAuth();
    } else {
      await cloudAuth.signInWithEmailAndPassword(authEmail.value.trim(), authPassword.value);
    }
  } catch (e) { authError.textContent = (e.message || "Unable to sign in.").replace(/^Firebase:\s*/i, ""); }
});
if (googleSignInBtn) googleSignInBtn.addEventListener("click", async () => {
  if (!cloudAuth) { authError.textContent = "Firebase is not configured yet. You can continue offline."; return; }
  try { await cloudAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
  catch (e) { authError.textContent = e.message || "Google sign-in failed."; }
});

/* Account panel */
const accountPanel = document.getElementById("accountPanel");
function openAccount() { if (cloudUser) accountPanel.classList.add("open"); else showAuth(); }
[document.getElementById("profileBtn"), document.getElementById("libraryProfileBtn")].forEach(b => b && b.addEventListener("click", e => { e.stopPropagation(); openAccount(); }));
document.getElementById("accountClose")?.addEventListener("click", () => accountPanel.classList.remove("open"));
document.getElementById("logoutBtn")?.addEventListener("click", async () => { accountPanel.classList.remove("open"); if (cloudAuth) await cloudAuth.signOut(); });

/* ---------- In-app FAQ ---------- */
const faqOverlay = document.getElementById("faqOverlay");
const faqFrame = document.getElementById("faqFrame");
function postFaqTheme(theme) { try { faqFrame?.contentWindow?.postMessage({ type:"GES_PROMOHUB_THEME", theme }, location.origin); } catch (_) {} }
function openFaq() { faqOverlay.classList.add("open"); postFaqTheme(localStorage.getItem("reader-theme") || localStorage.getItem("library-theme") || "dark"); }
function closeFaq() { faqOverlay.classList.remove("open"); }
document.getElementById("sidebarFaqBtn")?.addEventListener("click", openFaq);
document.querySelector(".libraryFooterLink")?.addEventListener("click", e => { e.preventDefault(); openFaq(); });
document.getElementById("faqCloseBtn")?.addEventListener("click", closeFaq);
window.addEventListener("message", e => { if (e.data?.type === "GES_PROMOHUB_CLOSE_FAQ") closeFaq(); });

/* ---------- Pull to refresh ---------- */
const refreshIndicator = document.createElement("div");
refreshIndicator.id = "pullRefreshIndicator";
refreshIndicator.textContent = "Pull to refresh";
document.body.appendChild(refreshIndicator);
let prStartY = null, prStartX = null, prArmed = false;
document.addEventListener("touchstart", e => {
  if (e.touches.length !== 1 || sidebarIsOpen() || faqOverlay.classList.contains("open")) return;
  if (window.scrollY > 0) return;
  prStartY = e.touches[0].clientY; prStartX = e.touches[0].clientX; prArmed = false;
}, { passive:true, capture:true });
document.addEventListener("touchmove", e => {
  if (prStartY === null || e.touches.length !== 1) return;
  const dy=e.touches[0].clientY-prStartY, dx=Math.abs(e.touches[0].clientX-prStartX);
  if (dy > 70 && dx < 35) { prArmed=true; refreshIndicator.textContent="Release to refresh"; refreshIndicator.classList.add("show"); }
}, { passive:true, capture:true });
document.addEventListener("touchend", () => {
  if (prStartY === null) return;
  const doRefresh=prArmed; prStartY=null; prArmed=false; refreshIndicator.classList.remove("show");
  if (doRefresh) setTimeout(() => location.reload(), 80);
}, { passive:true, capture:true });

/* ---------- Pinch changes EPUB text size only ---------- */
function installPinchTextZoom(doc) {
  if (!doc || doc.__gesPinchInstalled) return;
  doc.__gesPinchInstalled = true;
  let startDistance=0, startFont=fontSize, pinching=false;
  const dist = touches => Math.hypot(touches[0].clientX-touches[1].clientX, touches[0].clientY-touches[1].clientY);
  doc.addEventListener("touchstart", e => {
    if (e.touches.length !== 2) return;
    pinching=true; startDistance=dist(e.touches); startFont=fontSize;
  }, { passive:true });
  doc.addEventListener("touchmove", e => {
    if (!pinching || e.touches.length !== 2 || !startDistance) return;
    e.preventDefault();
    const scale=dist(e.touches)/startDistance;
    const next=Math.max(70, Math.min(200, Math.round((startFont*scale)/5)*5));
    if (next !== fontSize) { fontSize=next; rendition.themes.fontSize(fontSize+"%"); localStorage.setItem("fontSize", String(fontSize)); }
  }, { passive:false });
  doc.addEventListener("touchend", e => {
    if (!pinching) return;
    if (e.touches.length < 2) { pinching=false; markPreferencesChanged(); }
  }, { passive:true });
}

/* Sync the selected book whenever a book is opened. */
const _openReaderLocal = openReader;
openReader = function() { _openReaderLocal(); setTimeout(syncCurrentBookCloud, 500); };

setAuthMode("login");
initFirebaseFeatures();
