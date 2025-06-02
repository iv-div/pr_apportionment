// controller.js – полностью переписан с учётом требований
import { PR_METHODS, allocateDistrict } from "./allocators.js";
import { buildSVG } from "./svg-utils.js";
const METHODS = Object.values(PR_METHODS);

const MAX_DISTRICTS = 650;
let districtsContainer;
let resultsContainer;
const districts = new Map();
const partyRegistry = new Map();
let districtCounter = 0;
let nextPartyNumber = 1;

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
  });

  districtsContainer.appendChild(districtEl);
  districts.set(id, { el: districtEl, data: null });
}

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
    const mTotals = new Map();
    parsedDistricts.forEach((d) => {
      const allocation = allocateDistrict(d, method, { overAllocRule: d.overAllocRule });
      for (const [partyId, seats] of Object.entries(allocation)) {
        const prev = mTotals.get(partyId) || 0;
        mTotals.set(partyId, prev + seats);
      }
    });
    nationalSeats.set(method, mTotals);
  });

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
      totalSeats: actualTotalSeats
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
        totalSeats: totalDistrictSeats
      });

      methodWrapper.appendChild(wrapper);
    });

    // Добавляем группировку в результат
    resultsContainer.appendChild(methodWrapper);



  });
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

}
