// Load and display prices from CSV based on selected language
function loadPrices(lang) {
  const csvFile = lang === "en" ? "assets/pricelist_en.csv" : "assets/pricelist_hu.csv";
  fetch(csvFile)
    .then((response) => response.text())
    .then((data) => {
      document.getElementById("price-tables").innerHTML = "";
      parseCSVtoTables(data, "price-tables");
    });
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
  const categories = {};
  rows.forEach(({ category, service, price }) => {
    if (!categories[category]) categories[category] = [];
    categories[category].push({ service, price });
  });

  Object.keys(categories).forEach(category => {
    const section = document.createElement("section");
    const heading = document.createElement("h4");
    heading.classList.add("section-title", "pt-3");
    heading.innerHTML = formatCategory(category); 
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
  const paren = match[2] ? `<br><span style="font-size: 0.6em;">${match[2].slice(1, -1)}</span>` : '';
  return main + paren;
}
