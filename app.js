<script>
// All your element declarations (unchanged)
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

// Removed unused zone elements: leftZone, centerZone, rightZone

let rendition;
let book;

let controlsVisible = true;
let fontSize = Number(localStorage.getItem("fontSize")) || 100;

/* ==============
   DEBOUNCE NAVIGATION
============== */
let isNavigating = false;

async function safePrev() {
  if (isNavigating) return;
  isNavigating = true;
  try {
    await rendition.prev();
  } finally {
    setTimeout(() => { isNavigating = false; }, 350);
  }
}

async function safeNext() {
  if (isNavigating) return;
  isNavigating = true;
  try {
    await rendition.next();
  } finally {
    setTimeout(() => { isNavigating = false; }, 350);
  }
}

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
   START Reader
===================== */
function startReader() {
  rendition = book.renderTo("viewer", {
    width: "100%",
    height: "100%",
    spread: "none",
    manager: "continuous",
    flow: "paginated",
    snap: true,
    gap: 0,
    minSpreadWidth: 0
  });

  rendition.themes.fontSize(fontSize + "%");
  applyTheme();
  setupGestures();           // ← Updated name for clarity

  rendition.display();

  book.ready.then(async () => {
    // TOC code (unchanged)
    toc.innerHTML = "";
    const navigation = book.navigation;
    navigation.toc.forEach(chapter => {
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

    await book.locations.generate(1000);

    const savedLocation = localStorage.getItem("epub-location");
    if (savedLocation) {
      try {
        await rendition.display(savedLocation);
      } catch (error) {
        console.error("Restore failed:", error);
      }
    }
  });

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

/* ==================
   CONTROLS
================== */
function hideControls() {
  controlsVisible = false;
  header.classList.add("hideControls");
  footer.classList.add("hideControls");
}

function showControls() {
  controlsVisible = true;
  header.classList.remove("hideControls");
  footer.classList.remove("hideControls");
}

function toggleControls() {
  controlsVisible ? hideControls() : showControls();
}

/* =========================
   GESTURES - Swipe Only
========================= */
function setupGestures() {
  rendition.on("rendered", () => {
    const iframe = viewer.querySelector("iframe");
    if (!iframe) return;

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc) return;

    if (doc.body.dataset.gestureReady === "true") return;
    doc.body.dataset.gestureReady = "true";

    let startX = 0;
    let startY = 0;

    doc.addEventListener("pointerdown", e => {
      startX = e.clientX;
      startY = e.clientY;
    }, { passive: true });

    doc.addEventListener("pointerup", e => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      // Ignore tiny movements
      if (absDeltaX < 10 && absDeltaY < 10) return;

      // Horizontal Swipe - Page Navigation
      if (absDeltaX > 50 && absDeltaX > absDeltaY * 1.2) {
        if (deltaX < -50) safeNext();
        else if (deltaX > 50) safePrev();
        return;
      }

      // Vertical Swipe - Controls
      if (absDeltaY > 50 && absDeltaY > absDeltaX * 1.2) {
        if (deltaY < 0) {
          hideControls();   // Swipe Up   → Hide
        } else {
          showControls();   // Swipe Down → Show
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
   SEARCH BOOK (unchanged)
============ */
async function searchBook(query) { /* ... your existing search code ... */ }
function renderSearchResults(results) { /* ... your existing function ... */ }

/* =============
   EVENTS
============= */
// Menu Button
menuBtn.addEventListener("click", () => {
  sidebar.classList.toggle("active");
  const isOpen = sidebar.classList.contains("active");
  menuBtn.textContent = isOpen ? "✕" : "☰";
  bottomMenuBtn.textContent = isOpen ? "✕" : "☰";
  showControls();
});

// Theme
themeBtn.addEventListener("click", () => {
  const darkMode = localStorage.getItem("darkMode") === "true";
  localStorage.setItem("darkMode", (!darkMode).toString());
  applyTheme();
});

// Navigation Buttons
nextPage.addEventListener("click", safeNext);
prevPage.addEventListener("click", safePrev);

// Font Size (unchanged)
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

// Bottom buttons
bottomThemeBtn.addEventListener("click", () => themeBtn.click());
bottomDecreaseFont.addEventListener("click", () => decreaseFont.click());
bottomIncreaseFont.addEventListener("click", () => increaseFont.click());
bottomMenuBtn.addEventListener("click", () => menuBtn.click());

// Other buttons (unchanged)
closeAppBtn.addEventListener("click", () => { /* ... */ });
searchBtn.addEventListener("click", () => { /* ... */ });
closeSearch.addEventListener("click", () => { /* ... */ });
searchInput.addEventListener("keydown", e => { /* ... */ });

/* Service Worker */
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
</script>
