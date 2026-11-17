// Load and display prices from CSV based on selected language
function loadPrices(lang) {
  const assetsPath = /\/en\//.test(window.location.pathname) ? "../assets" : "assets";
  const csvFile = `${assetsPath}/pricelist_${lang}.csv`;
  fetch(csvFile, { cache: "no-cache" })
    .then((response) => response.text())
    .then((data) => {
      document.getElementById("price-tables").innerHTML = "";
      parseCSVtoTables(data, "price-tables");
    });
}

function loadTreatmentPricePreviews(lang) {
  const previews = document.querySelectorAll(".treatment-price-preview");
  if (!previews.length) return;

  const assetsPath = /\/en\//.test(window.location.pathname) ? "../assets" : "assets";
  fetch(`${assetsPath}/pricelist_${lang}.csv`, { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`Price list request failed: ${response.status}`);
      return response.text();
    })
    .then((data) => {
      const pricesByCategory = new Map();
      parsePriceRows(data).forEach(({ category, service, price }) => {
        const categoryNumber = category.split(".")[0];
        if (!pricesByCategory.has(categoryNumber)) pricesByCategory.set(categoryNumber, []);
        pricesByCategory.get(categoryNumber).push({ service, price });
      });

      previews.forEach((preview) => {
        const wantedCategories = preview.dataset.priceCategory.split(",");
        const rows = wantedCategories.flatMap((category) => (pricesByCategory.get(category) || []).slice(0, 5));
        preview.replaceChildren();

        rows.forEach(({ service, price }) => {
          const item = document.createElement("li");
          const serviceName = document.createElement("span");
          const servicePrice = document.createElement("span");
          serviceName.textContent = service;
          servicePrice.textContent = price;
          item.append(serviceName, servicePrice);
          preview.appendChild(item);
        });

        if (!rows.length) {
          const item = document.createElement("li");
          item.textContent = lang === "en" ? "Prices are unavailable." : "Az árak nem érhetők el.";
          preview.appendChild(item);
        }
      });
    })
    .catch((error) => {
      console.error("Unable to load treatment price previews.", error);
      previews.forEach((preview) => {
        preview.textContent = lang === "en" ? "Prices could not be loaded." : "Az árakat nem sikerült betölteni.";
      });
    });
}

function loadHomepagePriceCards(lang) {
  const cards = document.querySelectorAll(".home-price-list");
  if (!cards.length) return;

  const assetsPath = /\/en\//.test(window.location.pathname) ? "../assets" : "assets";
  fetch(`${assetsPath}/pricelist_${lang}.csv`, { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`Price list request failed: ${response.status}`);
      return response.text();
    })
    .then((data) => {
      const pricesByCategory = new Map();
      parsePriceRows(data).forEach(({ category, service, price }) => {
        const categoryNumber = category.split(".")[0];
        if (!pricesByCategory.has(categoryNumber)) pricesByCategory.set(categoryNumber, []);
        pricesByCategory.get(categoryNumber).push({ service, price });
      });

      cards.forEach((card) => {
        const category = card.dataset.homePriceCategory;
        const limit = Number.parseInt(card.dataset.homePriceLimit || "2", 10);
        const rows = (pricesByCategory.get(category) || []).slice(0, limit);
        card.replaceChildren();

        rows.forEach(({ service, price }) => {
          const item = document.createElement("li");
          const serviceName = document.createElement("span");
          const servicePrice = document.createElement("span");
          serviceName.textContent = service;
          servicePrice.textContent = price;
          item.append(serviceName, servicePrice);
          card.appendChild(item);
        });

        if (!rows.length) {
          const item = document.createElement("li");
          item.textContent = lang === "en" ? "Prices are unavailable." : "Az árak nem érhetők el.";
          card.appendChild(item);
        }
      });
    })
    .catch((error) => {
      console.error("Unable to load homepage price cards.", error);
      cards.forEach((card) => {
        card.textContent = lang === "en" ? "Prices could not be loaded." : "Az árakat nem sikerült betölteni.";
      });
    });
}

function parsePriceRows(csv) {
  return csv.trim().split(/\r?\n/).slice(1).map((line) => {
    const [category, service, price] = line.split(";").map((cell) => cell.trim());
    if (!category || !service || !price) return null;
    return { category, service, price };
  }).filter(Boolean);
}

// Parse CSV and generate HTML tables
function parseCSVtoTables(csv, containerId) {
  const lines = csv.trim().split("\n");
  const headers = lines.shift().split(";");
  const rows = lines.map(line => {
    const cells = line.split(";");
    if (cells.length < 3) return null;
    return {
      category: cells[0].trim(),
      service: cells[1].trim(),
      price: cells[2].trim()
    };
  })
    .filter(Boolean);

  const container = document.getElementById(containerId);
  const wanted = (container.dataset.priceCats || "").split(",").map(s => s.trim()).filter(Boolean);
  const categories = {};
  rows.forEach(({ category, service, price }) => {
    if (wanted.length && !wanted.includes(category.split(".")[0])) return;
    if (!categories[category]) categories[category] = [];
    categories[category].push({ service, price });
  });

  Object.keys(categories).forEach(category => {
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    heading.classList.add("section-title", "pt-3", "prices-category-title");
    heading.innerHTML = `${formatCategory(category.replace(/^\d+\.\s*/, ""))}:`;
    section.appendChild(heading);

    const table = document.createElement("table");
    table.classList.add("table", "table-striped");
    table.innerHTML = `<thead><tr><th>${headers[1]}</th><th>${headers[2]}</th></tr></thead>`;

    const tbody = document.createElement("tbody");
    categories[category].forEach(({ service, price }) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${service}</td><td>${price}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    section.appendChild(table);
    container.appendChild(section);
  });
}

// Format category with optional parentheses on new line
function formatCategory(category) {
  const match = category.match(/^([^(]+)\s*(\([^)]+\))?/);
  if (!match) return category;
  const main = match[1].trim();
  const subtitle = match[2]?.slice(1, -1)
    .replace(/^crowns,\s*bridges$/i, "Crowns and Bridges")
    .replace(/^koronák,\s*hidak$/i, "Koronák és Hidak");
  const paren = subtitle ? `<br><span class="category-subtitle">${subtitle}</span>` : '';
  return main + paren;
}
