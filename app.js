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

const increaseFont =
  document.getElementById(
    "increaseFont"
  );

const decreaseFont =
  document.getElementById(
    "decreaseFont"
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

const closeAppBtn =
  document.getElementById(
    "closeAppBtn"
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

let rendition;
let book;

let controlsVisible =
  true;

let fontSize =
  Number(
    localStorage.getItem(
      "fontSize"
    )
  ) || 100;


/* ==============
   DEBOUNCE NAVIGATION (helps with cycling)
============== */

let isNavigating = false;

async function safePrev() {
  if (isNavigating) return;
  isNavigating = true;
  try {
    await rendition.prev();
  } finally {
    setTimeout(() => { isNavigating = false; }, 300);
  }
}

async function safeNext() {
  if (isNavigating) return;
  isNavigating = true;
  try {
    await rendition.next();
  } finally {
    setTimeout(() => { isNavigating = false; }, 300);
  }
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


/* =====================
   START Reader & THEME
===================== */

function startReader() {

  rendition =
    book.renderTo(
      "viewer",
      {
        width: "100%",
        height: "100%",
        spread: "none",
        manager: "default",   // or keep "continuous"
        flow: "paginated",
        snap: True, 
        
        gap: 0,                  // reduce gaps
        minSpreadWidth: 0
      }
    );

  /* ================
     FONT & THEME
  ================ */

  rendition.themes.fontSize(
    fontSize + "%"
  );

  applyTheme();

  setupTapGestures();

  /* =========================
     FAST INITIAL DISPLAY
  ========================= */

  rendition.display();

  /* ===================
     BACKGROUND SETUP
  =================== */

  book.ready
    .then(async () => {

      /* TOC */

      toc.innerHTML = "";

      const navigation =
        book.navigation;

      navigation.toc.forEach(
        chapter => {

          const link =
            document.createElement(
              "a"
            );

          link.textContent =
            chapter.label;

          link.href = "#";

          link.addEventListener(
            "click",
            e => {

              e.preventDefault();

              rendition.display(
                chapter.href
              );

              sidebar.classList.remove(
                "active"
              );

              showControls();

            }
          );

          toc.appendChild(
            link
          );

        }
      );

      /* GENERATE LOCATIONS */

      await book.locations.generate(
        1000
      );

      /* RESTORE POSITION */

      const savedLocation =
        localStorage.getItem(
          "epub-location"
        );

      if (savedLocation) {

        try {

          await rendition.display(
            savedLocation
          );

        }

        catch (error) {

          console.error(
            "Restore failed:",
            error
          );

        }

      }

    });

  /* ==================
     SAVE LOCATION
  ================== */

  rendition.on(
    "relocated",
    location => {

      try {

        localStorage.setItem(
          "epub-location",
          location.start.cfi
        );

        if (
          book.locations.length()
        ) {

          const percentage =
            book.locations
              .percentageFromCfi(
                location.start.cfi
              );

          const percent =
            Math.floor(
              percentage * 100
            );

          progressText.textContent =
            percent + "%";

          progressFill.style.width =
            percent + "%";

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


/* ==================
     TOGGLE CONTROL 
  ================ */
function toggleControls() {

  controlsVisible =
    !controlsVisible;

  if (controlsVisible) {

    header.classList.remove(
      "hideControls"
    );

    footer.classList.remove(
      "hideControls"
    );

  }

  else {

    header.classList.add(
      "hideControls"
    );

    footer.classList.add(
      "hideControls"
    );

  }

}


/* =========================
   GESTURES (Swipe Next/Prev)
========================= */

function sidebarIsOpen() {

  return sidebar.classList.contains(
    "active"
  );

}


/* =========================
   EPUB TAP GESTURES
========================= */

function setupTapGestures() {
  rendition.on("rendered", (section) => {
    const iframe = viewer.querySelector("iframe");
    if (!iframe) return;

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc) return;

    // Prevent duplicate listeners
    if (doc.body.dataset.gestureReady === "true") return;
    doc.body.dataset.gestureReady = "true";

    let startX = 0;
    let startY = 0;

    doc.addEventListener("pointerdown", e => {
      startX = e.clientX;
      startY = e.clientY;
    }, { passive: true });

    doc.addEventListener("pointerup", e => {
      const deltaX = Math.abs(e.clientX - startX);
      const deltaY = Math.abs(e.clientY - startY);

      // Ignore if it was a swipe / drag
      if (deltaX > 15 || deltaY > 15) return;

      // Ignore links, images, form elements
      if (e.target.closest("a, img, button, input, textarea, select")) return;

      // === CRITICAL: Use iframe dimensions ===
      const rect = iframe.getBoundingClientRect();
      const tapX = e.clientX - rect.left;   // relative to iframe

      const zoneWidth = rect.width;         // ← Use iframe width!
      const leftZone  = zoneWidth * 0.25;
      const rightZone = zoneWidth * 0.75;

      if (tapX < leftZone) {
        safePrev();
      } 
      else if (tapX > rightZone) {
        safeNext();
      } 
      else {
        toggleControls();
      }
    }, { passive: true });
  });
}




            






/* ==============
   THEME
============== */

function applyTheme() {

  const darkMode =
    localStorage.getItem(
      "darkMode"
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


/* ============
   SEARCH BOOK
============ */

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

/* ============
   SEARCH RESULTS 
============ */

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

            await rendition.display(
              result.cfi
            );

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


/* =============
   EVENTS
============= */

menuBtn.addEventListener(
  "click",
  () => {

    sidebar.classList.toggle(
      "active"
    );

    const isOpen =
      sidebar.classList.contains(
        "active"
      );

    menuBtn.textContent =
      isOpen
        ? "✕"
        : "☰";

    bottomMenuBtn.textContent =
      isOpen
        ? "✕"
        : "☰";

    showControls();

  }
);

themeBtn.addEventListener(
  "click",
  () => {

    const darkMode =
      localStorage.getItem(
        "darkMode"
      ) === "true";

    localStorage.setItem(
      "darkMode",
      (!darkMode).toString()
    );

    applyTheme();

  }
);

nextPage.addEventListener("click", () => {
  safeNext();
});

prevPage.addEventListener("click", () => {
  safePrev();
});

increaseFont.addEventListener(
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

decreaseFont.addEventListener(
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

bottomThemeBtn.addEventListener(
  "click",
  () => {

    themeBtn.click();

  }
);

bottomDecreaseFont.addEventListener(
  "click",
  () => {

    decreaseFont.click();

  }
);

bottomIncreaseFont.addEventListener(
  "click",
  () => {

    increaseFont.click();

  }
);

bottomMenuBtn.addEventListener(
  "click",
  () => {

    menuBtn.click();

  }
);

closeAppBtn.addEventListener(
  "click",
  () => {

    if (
      window.history.length > 1
    ) {

      history.back();

    }

    else {

      window.close();

    }

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


/* ==================
   SERVICE WORKER
================== */

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

loadBook();
