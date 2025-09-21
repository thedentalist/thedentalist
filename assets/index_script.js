// Redirect from /index.html to /
if (window.location.pathname === "/index.html") {
  window.location.replace("/");
}

// Language loading and switching
window.loadLanguage = function (lang) {
  fetch(`assets/lang_${lang}.json`)
    .then(response => response.json())
    .then(translations => {
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
  const lang = localStorage.getItem('lang') || 'hu';
  if (!btn) return;
  if (lang === 'hu') {
    btn.innerHTML = '<img src="assets/flag_en.svg" alt="English">';
    btn.title = 'Switch to English';
  } else {
    btn.innerHTML = '<img src="assets/flag_hu.svg" alt="Magyar">';
    btn.title = 'Váltás magyarra';
  }
  btn.onclick = function () {
    const newLang = lang === 'hu' ? 'en' : 'hu';
    localStorage.setItem('lang', newLang);
    window.loadLanguage(newLang);
  };
}

// Default language load based on state
document.addEventListener('DOMContentLoaded', () => {
  window.loadLanguage(localStorage.getItem('lang') || 'hu');
});
