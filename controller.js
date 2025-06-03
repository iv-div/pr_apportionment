// controller.js – полностью переписан с учётом требований
import { PR_METHODS, allocateDistrict } from "./allocators.js";
import { buildSVG } from "./svg-utils.js";
const METHODS = Object.values(PR_METHODS);

const MAX_DISTRICTS = 650;
let districtsContainer;
let isCompactView = false;
let resultsContainer;
const districts = new Map();
const partyRegistry = new Map();
let districtCounter = 0;
let nextPartyNumber = 1;
let currentModalClone = null;
let currentModalRecord = null;


const COLOR_PALETTE = [
  "#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00",
  "#ffff33", "#a65628", "#f781bf", "#999999", "#66c2a5",
  "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f",
  "#e5c494", "#b3b3b3", "#1b9e77", "#d95f02", "#7570b3",
  "#e7298a", "#66a61e", "#e6ab02", "#a6761d", "#666666",
  "#8c564b", "#bcbd22", "#17becf", "#ff9896", "#c5b0d5"
];
let nextColorIndex = 0;

function getNextColor() {
  const color = COLOR_PALETTE[nextColorIndex % COLOR_PALETTE.length];
  nextColorIndex++;
  return color;
}


function qs(sel, root = document) {
  const el = root.querySelector(sel);
  if (!el) console.warn(`Element not found: ${sel}`, root);
  return el;
}
function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function nextDistrictId() {
  return ++districtCounter;
}

function getNextPartyId() {
  while (partyRegistry.has(`P${nextPartyNumber}`)) {
    nextPartyNumber++;
  }
  return `P${nextPartyNumber++}`;
}

function addDistrict({ cloneSourceEl = null, emptyParties = false, example = false } = {}) {
  if (districts.size >= MAX_DISTRICTS) {
    alert(`Максимум ${MAX_DISTRICTS} округов.`);
    return;
  }

  const id = nextDistrictId();
  const template = qs("#district-template");
  const districtEl = template.content.firstElementChild.cloneNode(true);
  districtEl.dataset.districtId = id;

  const nameInput = qs(".district-name", districtEl);
  const sourceName = cloneSourceEl ? qs(".district-name", cloneSourceEl)?.value : null;
  nameInput.value = sourceName ? sourceName + " (copy)" : `Округ #${id}`;

  const seatsInput = qs(".seats", districtEl);
  if (cloneSourceEl) {
    seatsInput.value = qs(".seats", cloneSourceEl)?.value || 10;
    qs(".threshold", districtEl).value = qs(".threshold", cloneSourceEl)?.value || 0;
    qs(".tie-break", districtEl).value = qs(".tie-break", cloneSourceEl)?.value || "random";
  }

  const partyTbody = qs("tbody", districtEl);
  if (cloneSourceEl) {
    qsa("tbody tr", cloneSourceEl).forEach((row) => {
      const partyId = row.querySelector(".party-id")?.value.trim();
      const partyName = row.querySelector(".party-name")?.value.trim();
      const partyColor = row.querySelector(".party-color")?.value;
      const partyVotes = parseInt(row.querySelector(".party-votes")?.value, 10) || 0;

      addPartyRow(partyTbody, {
        id: partyId,
        name: partyName,
        color: partyColor,
        votes: partyVotes
      });
    });

  } else if (example) {
    const exampleData = [
      { name: "P1", color: "#e41a1c", votes: 10000 },
      { name: "P2", color: "#377eb8", votes: 8000 },
      { name: "P3", color: "#4daf4a", votes: 3000 },
      { name: "P4", color: "#984ea3", votes: 2000 },
      { name: "P5", color: "#ff7f00", votes: 1000 },
    ];
    exampleData.forEach(p => {
      addPartyRow(partyTbody, {
        id: p.name,
        name: p.name,
        color: p.color,
        votes: p.votes
      });
    });

  } else if (emptyParties) {
    for (let i = 0; i < 5; i++) {
      addPartyRow(partyTbody);
    }
  }

  qs(".clone-district", districtEl)?.addEventListener("click", () => addDistrict({ cloneSourceEl: districtEl }));
  qs(".remove-district", districtEl)?.addEventListener("click", () => removeDistrict(id));
  qs(".add-party", districtEl)?.addEventListener("click", () => addPartyRow(partyTbody));

  partyTbody.addEventListener("input", (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    syncPartyRegistryFromRow(row);
    const record = districts.get(id);
    if (record) {
      try {
        record.data = parseDistrict(record);
      } catch (e) {
        // ничего, пока округ невалидный
      }
    }

  });


  districts.set(id, { el: districtEl, data: null });
  renderDistrictsView();
}

function renderDistrictsView() {
  districts.forEach((record, id) => {
    try {
      record.data = parseDistrict(record);
    } catch (e) {
      // округ пока невалидный — можно не показывать
      record.data = null;
    }
  });
  districtsContainer.className = isCompactView
    ? "grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    : "flex flex-col gap-4";

  districtsContainer.innerHTML = "";
  districts.forEach((record) => {
    if (isCompactView && record.data) {
      const card = renderDistrictCompact(record);
      districtsContainer.appendChild(card);
    } else if (!isCompactView) {
      districtsContainer.appendChild(record.el);
    }

  });
}

function renderDistrictCompact(record) {
  const data = record.data || parseDistrict(record); // на случай если данные не сохранены
  const topParties = [...data.parties]
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 5);
  const maxVotes = topParties[0]?.votes || 1;

  const card = document.createElement("div");
  card.className = "district-card border p-4 rounded bg-white shadow hover:shadow-md transition cursor-pointer space-y-2";
  card.innerHTML = `
    <div class="font-bold text-lg">${data.name}</div>
    <div class="text-sm text-gray-600">Мандатов: ${data.seats}</div>
    <div class="flex items-end gap-1 h-16">
      ${topParties.map(p => {
        const height = Math.round((p.votes / maxVotes) * 100);
        const color = (partyRegistry.get(p.partyId)?.color || "#888");
        return `<div title="${p.name}: ${p.votes} голосов" style="height: ${height}%; background: ${color}" class="w-4 rounded-sm"></div>`;
      }).join('')}
    </div>
  `;

  card.addEventListener("click", () => openDistrictModal(record));
  return card;
}

function openDistrictModal(record) {
  const modal = document.getElementById("district-modal");
  const content = document.getElementById("district-modal-content");

  content.innerHTML = "";

  // создаём клон, но "реактивно" пересвязываем события
  const clone = record.el.cloneNode(true);
  const tbody = qs("tbody", clone);

  // обработка событий
  qsa(".add-party", clone).forEach(btn =>
    btn.addEventListener("click", () => addPartyRow(tbody))
  );
  qsa(".remove-district", clone).forEach(btn =>
    btn.addEventListener("click", () => {
      removeDistrict(record.el.dataset.districtId);
      closeDistrictModal();
    })
  );
  qsa(".clone-district", clone).forEach(btn =>
    btn.addEventListener("click", () => addDistrict({ cloneSourceEl: record.el }))
  );
  tbody.addEventListener("input", (e) => {
    const row = e.target.closest("tr");
    if (row) syncPartyRegistryFromRow(row);
  });

  content.appendChild(clone);

  // сохраняем клон в переменную
  currentModalClone = clone;
  currentModalRecord = record;
}


document.getElementById("close-modal").addEventListener("click", () => {
  document.getElementById("district-modal").classList.add("hidden");
});



function removeDistrict(id) {
  const record = districts.get(id);
  if (record) {
    record.el.remove();
    districts.delete(id);
  }
}

function addPartyRow(tbody, { id = "", name = "", color = getNextColor(), votes = 0 } = {}) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>
      <input type="hidden" class="party-id" value="${id}" />
      <input type="text" class="party-name w-full border p-1" value="${name}" placeholder="Название партии" list="party-suggestions" />
    </td>
    <td><input type="number" class="party-votes w-full border p-1 text-right" min="0" value="${votes}" /></td>
    <td><input type="color" class="party-color w-full" value="${color}" /></td>
    <td><button type="button" class="remove-party text-red-600">✕</button></td>
  `;
  row.querySelector(".remove-party")?.addEventListener("click", () => row.remove());
  const nameInput = row.querySelector(".party-name");
  nameInput?.addEventListener("change", () => {
    const name = nameInput.value.trim();
    for (const [existingId, data] of partyRegistry.entries()) {
      if (data.name === name) {
        row.querySelector(".party-id").value = existingId;
        row.querySelector(".party-color").value = data.color;
        break;
      }
    }
  });
  tbody.appendChild(row);
  syncPartyRegistryFromRow(row);
}


function syncPartyRegistryFromRow(row) {
  const idInput = row.querySelector(".party-id");
  const nameInput = row.querySelector(".party-name");
  const colorInput = row.querySelector(".party-color");

  let id = idInput?.value.trim();
  const typedName = nameInput?.value.trim();

  // Если ID ещё не задан, ищем по имени
  if (!id && typedName) {
    for (const [existingId, data] of partyRegistry.entries()) {
      if (data.name === typedName) {
        id = existingId;
        if (idInput) idInput.value = id;
        // Подставляем существующий цвет
        if (colorInput) colorInput.value = data.color;
        break;
      }
    }
  }

  // Если всё ещё нет ID — создаём новый
  if (!id) {
    id = getNextPartyId();
    if (idInput) idInput.value = id;
  }

  const name = typedName || id;
  const color = colorInput?.value || "#888888";

  const existing = partyRegistry.get(id) || {};
  const changed = existing.name !== name || existing.color !== color;

  if (changed) {
    partyRegistry.set(id, { name, color });

    // Обновляем все строки с таким же ID
    qsa("tr").forEach((r) => {
      const pidInput = r.querySelector(".party-id");
      if (pidInput && pidInput.value.trim() === id && r !== row) {
        const nameField = r.querySelector(".party-name");
        const colorField = r.querySelector(".party-color");
        if (nameField) nameField.value = name;
        if (colorField) colorField.value = color;
      }
    });
  }

  updatePartySuggestions();
}

function updatePartySuggestions() {
  const datalist = document.getElementById("party-suggestions");
  if (!datalist) return;

  // Удалим старые опции
  datalist.innerHTML = "";

  for (const { name } of partyRegistry.values()) {
    if (!name) continue;
    const option = document.createElement("option");
    option.value = name;
    datalist.appendChild(option);
  }
}


function parseDistrict(record) {
  const el = record.el;
  const name = qs(".district-name", el)?.value.trim() || `Округ ${record.el.dataset.districtId}`;
  const seats = parseInt(qs(".seats", el)?.value, 10) || 0;
  const threshold = parseFloat(qs(".threshold", el)?.value) || 0;
  const tieBreak = qs(".tie-break", el)?.value || "random";
  const overAllocRule = qs(".over-alloc", el)?.value || "remove-large";


  const parties = [];
  qsa("tbody tr", el).forEach((row) => {
    const partyId = row.querySelector(".party-id")?.value.trim();
    const votes = parseInt(row.querySelector(".party-votes")?.value, 10) || 0;
    if (!partyId || votes <= 0) return;
    const { name: partyName = partyId, color = "#888888" } = partyRegistry.get(partyId) || {};
    parties.push({ partyId, votes, name: partyName, color });
  });

  if (seats <= 0) throw new Error(`Округ "${name}": число мандатов должно быть > 0`);
  if (parties.length === 0) throw new Error(`Округ "${name}" не содержит ни одной партии с голосами`);

  return {
    id: record.el.dataset.districtId,
    name,
    seats,
    parties,
    barrier: threshold / 100,
    tieBreak,
    overAllocRule
  };
}

function recalculateAll() {
  resultsContainer.innerHTML = "";

  const parsedDistricts = [];
  try {
    districts.forEach((record) => {
      const data = parseDistrict(record);
      record.data = data;
      parsedDistricts.push(data);
    });
  } catch (err) {
    alert(err.message);
    return;
  }

  const nationalSeats = new Map();
  const nationalVotes = new Map();
  let totalVotes = 0;
  let totalSeats = 0;

  parsedDistricts.forEach((d) => {
    d.parties.forEach((p) => {
      totalVotes += p.votes;
      const cur = nationalVotes.get(p.partyId) || 0;
      nationalVotes.set(p.partyId, cur + p.votes);
    });
    totalSeats += d.seats;
  });
  

  METHODS.forEach((method) => {
    const rawTotals = new Map();

    parsedDistricts.forEach((d) => {
      const allocation = allocateDistrict(d, method, { overAllocRule: d.overAllocRule });
      for (const [partyId, seats] of Object.entries(allocation)) {
        const prev = rawTotals.get(partyId) || 0;
        rawTotals.set(partyId, prev + seats);
      }
    });

    // 🔧 Объединяем DISPUTED_... в одну DISPUTED
    const mTotals = new Map();
    for (const [partyId, seats] of rawTotals.entries()) {
      const key = partyId.startsWith("DISPUTED_") ? "DISPUTED" : partyId;
      mTotals.set(key, (mTotals.get(key) || 0) + seats);
    }

    // ✅ Регистрируем для визуализации
    if (mTotals.has("DISPUTED")) {
      partyRegistry.set("DISPUTED", {
        name: "Спорные мандаты",
        color: "#D1D5DB"
      });
    }

    nationalSeats.set(method, mTotals);
  });

  
  renderSummaryTable({ METHODS, nationalSeats, nationalVotes, totalVotes, totalSeats });

  METHODS.forEach((method) => {
    const mount = document.createElement("div");
    mount.className = "mb-8";
    resultsContainer.appendChild(mount);

    const mTotals = nationalSeats.get(method);
    const allocationArr = Array.from(mTotals.entries()).map(([partyId, seats]) => ({
      partyId,
      seats,
      color: (partyRegistry.get(partyId) || {}).color || "#888888"
    })).sort((a, b) => b.seats - a.seats);

    const legendArr = allocationArr.map((a) => {
      const votes = nationalVotes.get(a.partyId) || 0;
      return {
        partyId: a.partyId,
        name: (partyRegistry.get(a.partyId) || { name: a.partyId }).name,
        color: a.color,
        votePct: ((votes / totalVotes) * 100) || 0,
        seatPct: ((a.seats / totalSeats) * 100) || 0,
        seats: a.seats
      };
    });

    const actualTotalSeats = Array.from(mTotals.values()).reduce((a, b) => a + b, 0);

    buildSVG({
      mountEl: mount,
      title: `${methodLabel(method)} — national parliament`,
      seatMap: allocationArr,
      legendRows: legendArr,
      totalSeats: actualTotalSeats,
      isNational: true
    });

    // Создаем общий раскрывающийся блок для всех округов по текущему методу
    const methodWrapper = document.createElement("details");
    methodWrapper.className = "mb-6 border rounded p-3 bg-gray-50";
    methodWrapper.open = false;

    const methodSummary = document.createElement("summary");
    methodSummary.className = "cursor-pointer font-bold";
    methodSummary.textContent = `Диаграммы по округам — метод ${methodLabel(method)}`;
    methodWrapper.appendChild(methodSummary);

    parsedDistricts.forEach((district) => {
      const allocation = allocateDistrict(district, method, { overAllocRule: district.overAllocRule });

      const allocationArr = Object.entries(allocation).map(([partyId, seats]) => ({
        partyId,
        seats,
        color: (partyRegistry.get(partyId) || {}).color || "#888888"
      })).sort((a, b) => b.seats - a.seats);

      const totalDistrictSeats = allocationArr.reduce((sum, p) => sum + p.seats, 0);
      const totalDistrictVotes = district.parties.reduce((sum, p) => sum + p.votes, 0);

      const legendRows = allocationArr.map(({ partyId, seats, color }) => {
        const partyData = partyRegistry.get(partyId) || { name: partyId };
        const partyVotes = district.parties.find(p => p.partyId === partyId)?.votes || 0;
        return {
          name: partyData.name,
          color,
          votePct: (partyVotes / totalDistrictVotes) * 100,
          seatPct: (seats / totalDistrictSeats) * 100,
          seats
        };
      });

      const wrapper = document.createElement("details");
      wrapper.className = "mb-4 border rounded p-2 bg-white";

      const summary = document.createElement("summary");
      summary.className = "cursor-pointer font-semibold";
      summary.textContent = `Округ: ${district.name}`;
      wrapper.appendChild(summary);

      const mount = document.createElement("div");
      wrapper.appendChild(mount);
      buildSVG({
        mountEl: mount,
        title: `${methodLabel(method)} — ${district.name}`,
        seatMap: allocationArr,
        legendRows,
        totalSeats: totalDistrictSeats,
        isNational: false,
        partyIdToNameMap: Object.fromEntries(
          district.parties.map(p => [p.partyId, p.name])
        )
      });

      methodWrapper.appendChild(wrapper);
    });

    // Добавляем группировку в результат
    resultsContainer.appendChild(methodWrapper);



  });
}




function renderSummaryTable({ METHODS, nationalSeats, nationalVotes, totalVotes, totalSeats }) {
  const wrapper = document.createElement("div");
  wrapper.className = "overflow-x-auto mb-6";

  const table = document.createElement("table");
  table.className = "min-w-full border-collapse border border-gray-400 text-sm";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr class="bg-slate-200">
      <th class="border border-gray-400 px-2 py-1 text-left">Партия</th>
      <th class="border border-gray-400 px-2 py-1 text-right">Голоса (%)</th>
      ${METHODS.map(m => `<th class="border border-gray-400 px-2 py-1 text-right">${methodLabel(m)}</th>`).join('')}
    </tr>`;
  table.appendChild(thead);

  // Собираем список всех партий, включая "DISPUTED"
  const allPartyIds = new Set();
  METHODS.forEach(method => {
    const mTotals = nationalSeats.get(method);
    mTotals.forEach((_, partyId) => allPartyIds.add(partyId));
  });

  const rows = [];
  for (const partyId of allPartyIds) {
    const party = partyRegistry.get(partyId) || { name: partyId, color: "#888888" };
    const votes = nationalVotes.get(partyId) || 0;
    const votePct = totalVotes ? ((votes / totalVotes) * 100).toFixed(1) : "0.0";

    const methodCells = METHODS.map(method => {
      const seats = nationalSeats.get(method).get(partyId) || 0;
      const pct = totalSeats ? ((seats / totalSeats) * 100).toFixed(1) : "0.0";
      return `<td class="border border-gray-400 px-2 py-1 text-right">${seats} (${pct}%)</td>`;
    }).join("");

    const row = `
      <tr>
        <td class="border border-gray-400 px-2 py-1" style="color: ${party.color}">${party.name}</td>
        <td class="border border-gray-400 px-2 py-1 text-right">${votePct}%</td>
        ${methodCells}
      </tr>`;
    rows.push(row);
  }

  const tbody = document.createElement("tbody");
  tbody.innerHTML = rows.join("");
  table.appendChild(tbody);
  wrapper.appendChild(table);
  resultsContainer.appendChild(wrapper);
}



function methodLabel(method) {
  switch (method) {
    case "hare": return "Hare";
    case "droop": return "Droop";
    case "imperiali": return "Imperiali";
    case "dhondt": return "D’Hondt";
    case "saintelague": return "Sainte‑Laguë";
    default: return method;
  }
}

function generateExample() {
  districts.clear();
  districtsContainer.innerHTML = "";
  addDistrict({ example: true });
}

function handleCSVUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      const rows = results.data;

      // ✅ Сначала валидация
      if (!validateParsedCSV(rows)) return;

      const districts = new Map();
      const partyStats = new Map();
      const errors = [];

      for (const row of rows) {
        const districtName = row["district_name"]?.trim();
        const seats = parseInt(row["seats"], 10);
        const party = row["party"]?.trim();
        const votes = parseInt(row["votes"], 10);

        if (!districtName || !party || isNaN(seats) || isNaN(votes)) {
          errors.push(`Строка с данными пропущена из-за некорректных значений: ${JSON.stringify(row)}`);
          continue;
        }

        if (!districts.has(districtName)) {
          districts.set(districtName, {
            name: districtName,
            seats: seats,
            parties: []
          });
        }

        const district = districts.get(districtName);
        if (district.seats !== seats) {
          errors.push(`Округ "${districtName}" указан с разным числом мандатов: ${district.seats} и ${seats}`);
          continue;
        }

        district.parties.push({
          partyId: party,
          name: party,
          votes: votes
        });

        const stat = partyStats.get(party) || { name: party, totalVotes: 0 };
        stat.totalVotes += votes;
        partyStats.set(party, stat);
      }

      if (errors.length > 0) {
        alert("⚠️ Обнаружены ошибки при загрузке CSV:\n\n" + errors.join("\n"));
        return;
      }

      // ✅ Показываем предпросмотр
      previewImport(districts, partyStats);
    },

    error: (err) => {
      alert("Ошибка при чтении CSV: " + err.message);
    }
  });
}


function createDistrictsFromImport(importedDistricts, partyStats, globalSettings) {
  // Очищаем интерфейс и состояние
  districtsContainer.innerHTML = "";
  districts.clear();
  partyRegistry.clear();
  nextPartyNumber = 1;
  districtCounter = 0;
  nextColorIndex = 0;

  // Регистрируем партии
  for (const [id, party] of partyStats.entries()) {
    partyRegistry.set(id, {
      name: party.name,
      color: party.color
    });
  }

  // Создаем округа
  for (const imported of importedDistricts.values()) {
    const id = nextDistrictId();
    const template = qs("#district-template");
    const districtEl = template.content.firstElementChild.cloneNode(true);
    districtEl.dataset.districtId = id;

    qs(".district-name", districtEl).value = imported.name;
    qs(".seats", districtEl).value = imported.seats;
    qs(".threshold", districtEl).value = globalSettings.threshold;
    qs(".tie-break", districtEl).value = globalSettings.tieBreak;
    qs(".over-alloc", districtEl).value = globalSettings.overAllocRule;

    const tbody = qs("tbody", districtEl);
    for (const p of imported.parties) {
      addPartyRow(tbody, {
        id: p.partyId,
        name: p.name,
        votes: p.votes,
        color: partyStats.get(p.partyId)?.color || getNextColor()
      });
    }

    qs(".clone-district", districtEl)?.addEventListener("click", () =>
      addDistrict({ cloneSourceEl: districtEl })
    );
    qs(".remove-district", districtEl)?.addEventListener("click", () =>
      removeDistrict(id)
    );
    qs(".add-party", districtEl)?.addEventListener("click", () =>
      addPartyRow(tbody)
    );

    tbody.addEventListener("input", (e) => {
      const row = e.target.closest("tr");
      if (!row) return;
      syncPartyRegistryFromRow(row);
    });

    districtsContainer.appendChild(districtEl);
    districts.set(id, { el: districtEl, data: null });
  }
}




function previewImport(districts, partyStats) {
  const modal = qs("#import-preview");
  const summary = qs("#import-summary");
  const partyContainer = qs("#import-parties");

  // Заполняем сводку
  let totalSeats = 0;
  for (const d of districts.values()) totalSeats += d.seats;

  summary.innerHTML = `
    <p><strong>Округов:</strong> ${districts.size}</p>
    <p><strong>Всего мандатов:</strong> ${totalSeats}</p>
    <p><strong>Партий:</strong> ${partyStats.size}</p>
  `;

  // Отрисовываем список партий
  partyContainer.innerHTML = "";
  for (const [id, party] of partyStats.entries()) {
    const color = getNextColor();
    party.color = color;

    const div = document.createElement("div");
    div.className = "flex items-center gap-2";
    div.innerHTML = `
      <input type="color" class="party-color-picker border" value="${color}" data-party-id="${id}">
      <span class="flex-1 truncate">${party.name}</span>
      <span class="text-gray-500 text-xs">(${party.totalVotes} голосов)</span>
    `;
    partyContainer.appendChild(div);
  }

  // Показываем модалку
  modal.classList.remove("hidden");

  // Кнопки
  qs("#cancel-import").onclick = () => {
    modal.classList.add("hidden");
    qs("#csv-import").value = "";
  };

  qs("#confirm-import").onclick = () => {
    const threshold = parseFloat(qs("#import-threshold").value) || 0;
    const overAllocRule = qs("#import-overalloc").value;
    const tieBreak = qs("#import-tiebreak").value;

    // Обновим цвета
    qsa(".party-color-picker").forEach((input) => {
      const id = input.dataset.partyId;
      const party = partyStats.get(id);
      if (party) party.color = input.value;
    });

    modal.classList.add("hidden");
    createDistrictsFromImport(districts, partyStats, { threshold, overAllocRule, tieBreak });
    qs("#csv-import").value = "";
  };
}

function validateParsedCSV(rows) {
  const errors = [];
  const seatCountByDistrict = new Map();
  const seenRows = new Set();

  rows.forEach((row, i) => {
    const line = i + 2; // учитываем заголовок

    const d = row["district_name"]?.trim();
    const seats = row["seats"];
    const party = row["party"]?.trim();
    const votes = row["votes"];

    if (!d || !seats || !party || !votes) {
      errors.push(`Строка ${line}: отсутствуют обязательные поля.`);
      return;
    }

    const seatNum = parseInt(seats, 10);
    const voteNum = parseInt(votes, 10);

    if (isNaN(seatNum) || seatNum <= 0) {
      errors.push(`Строка ${line}: некорректное значение мандатов "${seats}".`);
    }

    if (isNaN(voteNum) || voteNum < 0) {
      errors.push(`Строка ${line}: некорректное значение голосов "${votes}".`);
    }

    if (seatCountByDistrict.has(d)) {
      const prevSeats = seatCountByDistrict.get(d);
      if (prevSeats !== seatNum) {
        errors.push(`Округ "${d}" указан с разным числом мандатов (${prevSeats} и ${seatNum}).`);
      }
    } else {
      seatCountByDistrict.set(d, seatNum);
    }

    // ✅ Проверка на дубликаты строк
    const rowKey = `${d}|${seatNum}|${party}|${voteNum}`;
    if (seenRows.has(rowKey)) {
      errors.push(`Строка ${line}: дубликат строки (округ "${d}", партия "${party}", голоса: ${voteNum})`);
    } else {
      seenRows.add(rowKey);
    }
  });

  if (errors.length > 0) {
    alert("Ошибка в CSV:\n\n" + errors.join("\n"));
    return false;
  }

  return true;
}



export function init() {
  districtsContainer = qs("#districts-container");
  resultsContainer = qs("#results");
  qs("#add-district").addEventListener("click", () => addDistrict());
  qs("#generate-example").addEventListener("click", generateExample);
  qs("#generate").addEventListener("click", () => recalculateAll());
  addDistrict({ emptyParties: true });

    // 🔒 Блокировка scroll и стрелок ↑/↓ на всех number-полях
  document.addEventListener("wheel", (e) => {
    if (document.activeElement.type === "number" && document.activeElement === e.target) {
      e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener("keydown", (e) => {
    if (document.activeElement.type === "number" &&
        (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
    }
  });
  qs("#upload-csv")?.addEventListener("click", () => {
    qs("#csv-import")?.click();
  });

  qs("#csv-import")?.addEventListener("change", handleCSVUpload);

  document.getElementById("toggle-compact-view").addEventListener("change", (e) => {
    isCompactView = e.target.checked;
    renderDistrictsView();
  });

function closeDistrictModal() {
  const modal = document.getElementById("district-modal");
  modal.classList.add("hidden");
  currentModalClone = null;
  currentModalRecord = null;
}

qs("#close-modal").addEventListener("click", closeDistrictModal);

qs("#confirm-modal").addEventListener("click", () => {
  if (!currentModalClone || !currentModalRecord) return;

  const orig = currentModalRecord.el;
  const updated = currentModalClone;

  // переносим содержимое (включая значения input) из клона обратно в оригинал
  orig.innerHTML = updated.innerHTML;

  // повторно назначаем все события, как будто округ был только что создан
  bindDistrictEvents(currentModalRecord);

  // пересчитываем данные
  try {
    currentModalRecord.data = parseDistrict(currentModalRecord);
  } catch (e) {
    console.warn("Invalid district after modal edit:", e);
  }

  closeDistrictModal();
});

}
