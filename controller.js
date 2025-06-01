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
      const clone = row.cloneNode(true);
      partyTbody.appendChild(clone);
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
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><input type="text" class="party-id w-full border p-1" value="${p.name}" /></td>
        <td><input type="text" class="party-name w-full border p-1" value="${p.name}" /></td>
        <td><input type="color" class="party-color w-full" value="${p.color}" /></td>
        <td><input type="number" class="party-votes w-full border p-1 text-right" min="0" value="${p.votes}" /></td>
        <td><button type="button" class="remove-party text-red-600">✕</button></td>
      `;
      row.querySelector(".remove-party")?.addEventListener("click", () => row.remove());
      partyTbody.appendChild(row);
      syncPartyRegistryFromRow(row);
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

function addPartyRow(tbody) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><input type="text" class="party-id w-full border p-1" placeholder="ID" /></td>
    <td><input type="text" class="party-name w-full border p-1" placeholder="Name" /></td>
    <td><input type="color" class="party-color w-full" /></td>
    <td><input type="number" class="party-votes w-full border p-1 text-right" min="0" value="0" /></td>
    <td><button type="button" class="remove-party text-red-600">✕</button></td>`;
  row.querySelector(".remove-party")?.addEventListener("click", () => row.remove());
  tbody.appendChild(row);
}

function syncPartyRegistryFromRow(row) {
  let id = row.querySelector(".party-id")?.value.trim();
  const nameInput = row.querySelector(".party-name");
  const colorInput = row.querySelector(".party-color");

  if (!id) {
    id = getNextPartyId();
    row.querySelector(".party-id").value = id;
  }

  const name = nameInput?.value.trim() || id;
  const color = colorInput?.value || "#888888";
  const existing = partyRegistry.get(id) || {};
  const changed = existing.name !== name || existing.color !== color;
  if (changed) {
    partyRegistry.set(id, { name, color });
    qsa("tr").forEach((r) => {
      const pidInput = r.querySelector(".party-id");
      if (pidInput && pidInput.value.trim() === id && r !== row) {
        r.querySelector(".party-name").value = name;
        r.querySelector(".party-color").value = color;
      }
    });
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
        seatPct: ((a.seats / totalSeats) * 100) || 0
      };
    });

    buildSVG({
      mountEl: mount,
      title: `${methodLabel(method)} — Национально`,
      seatMap: allocationArr,
      legendRows: legendArr,
      totalSeats
    });
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
}
