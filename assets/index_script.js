// Redirect from /index.html to /
if (window.location.pathname === "/index.html") {
  window.location.replace("/");
} else if (window.location.pathname === "/en/index.html") {
  window.location.replace("/en/");
}

const navbar = document.querySelector(".navbar");
if (navbar) {
  const updateNavbar = () => {
    navbar.classList.toggle("is-compact", window.scrollY > 40);
  };

  window.addEventListener("scroll", updateNavbar, { passive: true });
  updateNavbar();
}

const isEnglishPage = () => /\/en(?:\/|$)/.test(window.location.pathname);
const assetPath = () => isEnglishPage() ? "../assets/" : "assets/";

// Language loading and switching
window.loadLanguage = function (lang) {
  fetch(`${assetPath()}lang_${lang}.json`)
    .then(response => response.json())
    .then(translations => {
      document.documentElement.lang = lang;
      document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        el.textContent = translations[key] || "";
      });
      // Load prices if on prices page
      if (typeof loadPrices === "function" && document.getElementById("price-tables")) {
        loadPrices(lang);
      }
      // Update language toggle button 
      updateLangToggle();
    });
};

// Language toggle button update
function updateLangToggle() {
  const btn = document.getElementById('lang-toggle');
  const lang = isEnglishPage() ? "en" : "hu";
  if (!btn) return;
  if (lang === 'hu') {
    btn.innerHTML = `<img src="${assetPath()}flag_en.svg" alt="English">`;
    btn.title = 'Switch to English';
  } else {
    btn.innerHTML = `<img src="${assetPath()}flag_hu.svg" alt="Magyar">`;
    btn.title = 'Váltás magyarra';
  }
  btn.onclick = function () {
    const newLang = lang === 'hu' ? 'en' : 'hu';
    const alt = document.querySelector(`link[rel="alternate"][hreflang="${newLang}"]`);
    if (alt && /^https?:$/.test(window.location.protocol)) {
      window.location.assign(new URL(alt.href).pathname);
      return;
    }
    const pathParts = window.location.pathname.split("/");
    const englishIndex = pathParts.indexOf("en");
    if (newLang === "hu" && englishIndex !== -1) {
      pathParts.splice(englishIndex, 1);
    } else if (newLang === "en" && englishIndex === -1) {
      pathParts.splice(pathParts.length - 1, 0, "en");
    }
    window.location.assign(pathParts.join("/") || "/");
  };
}

// Default language follows the page URL, so each language has a stable indexable page.
document.addEventListener('DOMContentLoaded', () => {
  window.loadLanguage(isEnglishPage() ? "en" : "hu");
});
