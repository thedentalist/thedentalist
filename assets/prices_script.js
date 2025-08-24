document.addEventListener("DOMContentLoaded", () => {
  fetch("assets/arlista.csv")
    .then((response) => response.text())
    .then((data) => parseCSVtoTables(data, "price-tables"));
});

function parseCSVtoTables(csv, containerId) {
  const lines = csv.trim().split("\n");
  const headers = lines.shift().split(";");
  const rows = lines.map(line => {
    const cells = line.split(";");
    return {
      category: cells[0].trim(),
      service: cells[1].trim(),
      price: cells[2].trim()
    };
  });

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
    heading.textContent = category;
    section.appendChild(heading);

    const table = document.createElement("table");
    table.classList.add("table", "table-striped");
    table.innerHTML = "<thead><tr><th>Szolgáltatás</th><th>Ár</th></tr></thead>";

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
