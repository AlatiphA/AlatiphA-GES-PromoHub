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
    "menuBtn"
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

const bottomThemeBtn =
  document.getElementById(
    "bottomThemeBtn"
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
      "fontSize-beta"
    )
  ) || 100;


const READER_DATA_KEY =
  "epub-beta-reader-data";

const BOOKMARKS_KEY =
  "epub-beta-bookmarks";

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
        BOOKMARKS_KEY
      ) || "[]"
    );

  const chapterName =
    getCurrentChapter(
      currentLocation.start.href
    );

  const percent =
    Math.floor(
      book.locations
        .percentageFromCfi(
          currentLocation.start.cfi
        ) * 100
    );

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
    BOOKMARKS_KEY,
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
        BOOKMARKS_KEY
      ) || "[]"
    );

  if (!bookmarks.length) {
    list.innerHTML =
      '<div class="noBookmarks">No bookmarks yet.<br>Tap 🔖 while reading to add one.</div>';
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

          closeSidebar();

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

      del.textContent = "🗑";

      del.addEventListener(
        "click",
        e => {

          e.stopPropagation();

          const all =
            JSON.parse(
              localStorage.getItem(
                BOOKMARKS_KEY
              ) || "[]"
            );

          all.splice(index, 1);

          localStorage.setItem(
            BOOKMARKS_KEY,
            JSON.stringify(all)
          );

          loadBookmarks();

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
      await fetch(
        "./library/sample.epub"
      );

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

  toggle.textContent =
    hasChildren
      ? "⟩"
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

      closeSidebar();
      
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

        toggle.textContent =
          children.classList.contains(
            "open"
          )
            ? "⌵"
            : "⟩";

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
  
  rendition.themes.fontSize(
    fontSize + "%"
  );

  applyTheme();

  setupNavigationZones();

  hideControls();


  /* RESTORE SAVED LOCATION */
  /*
  const readerData =
   loadReaderData();

  const savedLocation =
   readerData.location;

  rendition.display(
   savedLocation || undefined
); 
*/

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
      loadBookmarks();
    });

    /* Generate locations in background — progress works once ready */
    book.locations
      .generate(1000)
      .catch(err => console.warn("Locations:", err));

  });

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

  function zonesDisabled() {

    if (
      sidebarIsOpen()
    ) {

      return true;

    }

    const iframe =
      viewer.querySelector(
        "iframe"
      );

    if (!iframe) {

      return false;

    }

    try {

      const active =
        iframe.contentDocument
          .activeElement;

      if (!active) {

        return false;

      }

      const tag =
        active.tagName;

      return (
        tag === "A" ||
        tag === "BUTTON" ||
        tag === "INPUT"
      );

    }

    catch {

      return false;

    }

  }

  leftZone.addEventListener(
    "click",
    e => {

      if (
        zonesDisabled()
      ) return;

      const iframe =
        viewer.querySelector(
          "iframe"
        );

      if (!iframe) return;

      try {

        const doc =
          iframe.contentDocument;

        const selection =
          doc.getSelection();

        if (
          selection &&
          selection.toString()
        ) {

          return;

        }

      }

      catch {}

      e.stopPropagation();

      rendition.prev();

      hideControls();

    }
  );

  rightZone.addEventListener(
    "click",
    e => {

      if (
        zonesDisabled()
      ) return;

      const iframe =
        viewer.querySelector(
          "iframe"
        );

      if (!iframe) return;

      try {

        const doc =
          iframe.contentDocument;

        const selection =
          doc.getSelection();

        if (
          selection &&
          selection.toString()
        ) {

          return;

        }

      }

      catch {}

      e.stopPropagation();

      rendition.next();

      hideControls();

    }
  );

  centerZone.addEventListener(
    "click",
    e => {

      if (
        zonesDisabled()
      ) return;

      e.stopPropagation();

      toggleControls();

    }
  );

}


/* =========================
   THEME
========================= */

function applyTheme() {

  const darkMode =
    localStorage.getItem(
      "darkMode-beta"
    ) === "true";

  document.body.classList.toggle(
    "dark",
    darkMode
  );

  /* UPDATE ICONS */

  themeBtn.textContent =
    darkMode
      ? "🌙"
      : "☀️";

  bottomThemeBtn.textContent =
    darkMode
      ? "🌙"
      : "☀️";

  /* SAFETY */

  if (!rendition)
    return;

  /* FORCE EPUB REFRESH */

  rendition.themes.default({

    body: {

      background:
        darkMode
          ? "#111111"
          : "#ffffff",

      color:
        darkMode
          ? "#ffffff"
          : "#111111",

      padding: "20px",

      "line-height": "1.7",

      "font-family":
        "Arial, sans-serif"

    },

    a: {

      color:
        darkMode
          ? "#4dabff"
          : "#1565c0"

    }

  });

  /* RE-APPLY FONT SIZE */

  rendition.themes.fontSize(
    fontSize + "%"
  );

}


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

  sidebar.classList.toggle(
    "active"
  );

  updateMenuButtons();

  hideFooter();

}

/* CLOSE SIDEBAR */

function closeSidebar() {
  sidebar.classList.remove("active");
  
  updateMenuButtons();
  
  hideHeader();

  //showControls();
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

themeBtn.addEventListener(
  "click",
  () => {

    const darkMode =
      localStorage.getItem(
        "darkMode-beta"
      ) === "true";

    localStorage.setItem(
      "darkMode-beta",
      (!darkMode).toString()
    );

    applyTheme();
    updateMenuButtons();

  }
);

nextPage.addEventListener(
  "click",
  () => {

    rendition.next();

    hideHeader();

  }
);

prevPage.addEventListener(
  "click",
  () => {

    rendition.prev();
    
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





bottomThemeBtn.addEventListener(
  "click",
  () => {

    themeBtn.click();
    updateMenuButtons();

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
      "fontSize-beta",
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
      "fontSize-beta",
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

  }
);

closeSearch.addEventListener(
  "click",
  () => {

    searchModal.classList.remove(
      "active"
    );

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
            "./sw-beta.js"
          );

      }

      catch (error) {

        console.error(error);

      }

    }
  );

}

loadBook();

/* =========================
   SIDEBAR TABS
========================= */

document.querySelectorAll(
  ".sidebarTab"
).forEach(tab => {

  tab.addEventListener(
    "click",
    () => {

      /* Update tab buttons */
      document.querySelectorAll(
        ".sidebarTab"
      ).forEach(t =>
        t.classList.remove("active")
      );
      tab.classList.add("active");

      /* Update panels */
      document.querySelectorAll(
        ".tabPanel"
      ).forEach(p =>
        p.classList.remove("active")
      );

      const target =
        document.getElementById(
          tab.dataset.tab === "toc"
            ? "tocPanel"
            : "bookmarksPanel"
        );

      if (target)
        target.classList.add("active");

    }
  );

});
