const viewer = document.getElementById("viewer");
const toc = document.getElementById("toc");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const sidebar = document.getElementById("sidebar");
const menuBtn = document.getElementById("menuBtn");
const themeBtn = document.getElementById("themeBtn");
const nextPage = document.getElementById("nextPage");
const prevPage = document.getElementById("prevPage");
const increaseFont = document.getElementById("increaseFont");
const decreaseFont = document.getElementById("decreaseFont");
const bottomThemeBtn = document.getElementById("bottomThemeBtn");
const bottomDecreaseFont = document.getElementById("bottomDecreaseFont");
const bottomIncreaseFont = document.getElementById("bottomIncreaseFont");
const bottomMenuBtn = document.getElementById("bottomMenuBtn");
const closeAppBtn = document.getElementById("closeAppBtn");
const searchBtn = document.getElementById("searchBtn");
const searchModal = document.getElementById("searchModal");
const searchInput = document.getElementById("searchInput");
const closeSearch = document.getElementById("closeSearch");
const searchResults = document.getElementById("searchResults");
const header = document.querySelector("header");
const footer = document.querySelector("footer");

let rendition;
let book;
let controlsVisible = true;
let controlsTimer;

let fontSize = Number(localStorage.getItem("fontSize")) || 100;


/* ==============
   LOAD BOOK
============== */

async function loadBook() {
  try {
    const response = await fetch("./library/sample.epub");
    if (!response.ok) throw new Error("EPUB file not found.");
    const blob = await response.blob();
    book = ePub(blob);
    startReader();
  } catch (error) {
    console.error(error);
    alert("Failed to load EPUB.");
  }
}


/* =====================
   START READER
===================== */

function startReader() {

  rendition = book.renderTo("viewer", {
    width: "100%",
    height: "100%",
    spread: "none",
    manager: "default",
    flow: "paginated",
    snap: true
  });

  rendition.themes.fontSize(fontSize + "%");
  applyTheme();
  setupTapGestures();

  rendition.display();

  book.ready.then(async () => {

    /* TOC */
    toc.innerHTML = "";
    book.navigation.toc.forEach(chapter => {
      const link = document.createElement("a");
      link.textContent = chapter.label;
      link.href = "#";
      link.addEventListener("click", e => {
        e.preventDefault();
        rendition.display(chapter.href);
        sidebar.classList.remove("active");
        showControls();
      });
      toc.appendChild(link);
    });

    /* LOCATIONS */
    await book.locations.generate(1000);

    /* RESTORE POSITION */
    const savedLocation = localStorage.getItem("epub-location");
    if (savedLocation) {
      try {
        await rendition.display(savedLocation);
      } catch (error) {
        console.error("Restore failed:", error);
      }
    }

  });

  /* SAVE LOCATION + PROGRESS */
  rendition.on("relocated", location => {
    try {
      localStorage.setItem("epub-location", location.start.cfi);
      if (book.locations.length()) {
        const percentage = book.locations.percentageFromCfi(location.start.cfi);
        const percent = Math.floor(percentage * 100);
        progressText.textContent = percent + "%";
        progressFill.style.width = percent + "%";
      }
    } catch (error) {
      console.error(error);
    }
  });

}


/* =========================
   CONTROLS
========================= */

function showControls() {
  clearTimeout(controlsTimer);
  header.classList.remove("hideControls");
  footer.classList.remove("hideControls");
  controlsVisible = true;

  // Auto-hide after 2.5s unless sidebar/search is open
  controlsTimer = setTimeout(() => {
    if (sidebar.classList.contains("active")) return;
    if (searchModal.classList.contains("active")) return;
    header.classList.add("hideControls");
    footer.classList.add("hideControls");
    controlsVisible = false;
  }, 2500);
}

function toggleControls() {
  if (controlsVisible) {
    clearTimeout(controlsTimer);
    header.classList.add("hideControls");
    footer.classList.add("hideControls");
    controlsVisible = false;
  } else {
    showControls();
  }
}


/* =========================
   TAP GESTURES — fixed
========================= */

function setupTapGestures() {

  // WeakSet tracks actual body instances — survives iframe reuse
  const attachedBodies = new WeakSet();

  rendition.on("rendered", () => {

    const iframe = viewer.querySelector("iframe");
    if (!iframe?.contentDocument?.body) return;

    const doc = iframe.contentDocument;

    // Guard by object identity, not dataset flag
    if (attachedBodies.has(doc.body)) return;
    attachedBodies.add(doc.body);

    let startX = 0;
    let startY = 0;

    // touchstart/touchend are more reliable than pointer events inside epub iframes
    doc.addEventListener("touchstart", e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    doc.addEventListener("touchend", e => {
      if (!e.changedTouches?.length) return;

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const deltaX = endX - startX;
      const deltaY = endY - startY;

      // Ignore if vertical scroll dominated
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) return;

      // Ignore links, images, form elements
      if (e.target.closest("a, img, button, input, textarea, select")) return;

      const absDeltaX = Math.abs(deltaX);

      // Swipe gestures (> 60px horizontal)
      if (absDeltaX > 60) {
        if (deltaX < 0) {
          safeNext();
        } else {
          safePrev();
        }
        showControls();
        return;
      }

      // Tap (< 10px movement) — zone-based
      if (absDeltaX < 10 && Math.abs(deltaY) < 10) {
        const width = doc.documentElement.clientWidth;
        const tapX = e.changedTouches[0].clientX;

        if (tapX < width * 0.25) {
          safePrev();
          showControls();
        } else if (tapX > width * 0.75) {
          safeNext();
          showControls();
        } else {
          toggleControls();
        }
      }

    }, { passive: true });

  });

}


/* ==============
   THEME
============== */

function applyTheme() {
  const darkMode = localStorage.getItem("darkMode") === "true";

  document.body.classList.toggle("dark", darkMode);
  themeBtn.textContent = darkMode ? "🌙" : "☀️";
  bottomThemeBtn.textContent = darkMode ? "🌙" : "☀️";

  if (!rendition) return;

  rendition.themes.default({
    body: {
      background: darkMode ? "#111111" : "#ffffff",
      color: darkMode ? "#ffffff" : "#111111",
      padding: "20px",
      "line-height": "1.7",
      "font-family": "Arial, sans-serif"
    },
    a: {
      color: darkMode ? "#4dabff" : "#1565c0"
    }
  });

  rendition.themes.fontSize(fontSize + "%");
}


/* ============
   SEARCH
============ */

async function searchBook(query) {
  searchResults.innerHTML = "Searching...";
  const results = [];

  try {
    for (const item of book.spine.spineItems) {
      await item.load(book.load.bind(book));
      const doc = item.document;
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent;
        const index = text.toLowerCase().indexOf(query.toLowerCase());
        if (index !== -1) {
          const range = doc.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + query.length);
          results.push({
            cfi: item.cfiFromRange(range),
            excerpt: text.substring(Math.max(0, index - 40), index + 80)
          });
        }
      }
      item.unload();
    }
    renderSearchResults(results);
  } catch (error) {
    console.error(error);
    searchResults.innerHTML = "Search failed.";
  }
}

function renderSearchResults(results) {
  searchResults.innerHTML = "";
  if (!results.length) {
    searchResults.innerHTML = "No results found.";
    return;
  }
  results.forEach(result => {
    const div = document.createElement("div");
    div.className = "searchItem";
    div.textContent = result.excerpt;
    div.addEventListener("click", async () => {
      try {
        await rendition.display(result.cfi);
        searchModal.classList.remove("active");
      } catch (error) {
        console.error(error);
        alert("Could not open result.");
      }
    });
    searchResults.appendChild(div);
  });
}


/* =============
   EVENTS
============= */

menuBtn.addEventListener("click", () => {
  sidebar.classList.toggle("active");
  const isOpen = sidebar.classList.contains("active");
  menuBtn.textContent = isOpen ? "✕" : "☰";
  bottomMenuBtn.textContent = isOpen ? "✕" : "☰";
  showControls();
});

themeBtn.addEventListener("click", () => {
  const darkMode = localStorage.getItem("darkMode") === "true";
  localStorage.setItem("darkMode", String(!darkMode));
  applyTheme();
});

nextPage.addEventListener("click", () => {
  safeNext();
  showControls();
});

prevPage.addEventListener("click", () => {
  safePrev();
  showControls();
});

increaseFont.addEventListener("click", () => {
  fontSize += 10;
  rendition.themes.fontSize(fontSize + "%");
  localStorage.setItem("fontSize", fontSize);
});

decreaseFont.addEventListener("click", () => {
  if (fontSize <= 70) return;
  fontSize -= 10;
  rendition.themes.fontSize(fontSize + "%");
  localStorage.setItem("fontSize", fontSize);
});

bottomThemeBtn.addEventListener("click", () => themeBtn.click());
bottomDecreaseFont.addEventListener("click", () => decreaseFont.click());
bottomIncreaseFont.addEventListener("click", () => increaseFont.click());
bottomMenuBtn.addEventListener("click", () => menuBtn.click());

closeAppBtn.addEventListener("click", () => {
  if (window.history.length > 1) history.back();
  else window.close();
});

searchBtn.addEventListener("click", () => {
  searchModal.classList.add("active");
  searchInput.focus();
});

closeSearch.addEventListener("click", () => {
  searchModal.classList.remove("active");
});

searchInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const query = searchInput.value.trim();
    if (!query) return;
    searchBook(query);
  }
});


/* ==================
   SERVICE WORKER
================== */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (error) {
      console.error(error);
    }
  });
}

loadBook();
