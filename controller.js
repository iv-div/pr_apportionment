import { PR_METHODS, allocateDistrict } from "./allocators.js";
import { buildSVG } from "./svg-utils.js";
const METHODS = Object.values(PR_METHODS);

const MAX_DISTRICTS = 650;
let districtsContainer;
let resultsContainer;
const districts = new Map();
const partyRegistry = new Map();
let districtCounter = 0;

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

function addDistrict(cloneSourceEl = null) {
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
  }

  qs(".clone-district", districtEl)?.addEventListener("click", () => addDistrict(districtEl));
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
    <td><button type="button" class="remove-party text-rose-600">✕</button></td>`;
  row.querySelector(".remove-party")?.addEventListener("click", () => row.remove());
  tbody.appendChild(row);
}

function syncPartyRegistryFromRow(row) {
  const id = row.querySelector(".party-id")?.value.trim();
  if (!id) return;
  const name = row.querySelector(".party-name")?.value.trim();
  const color = row.querySelector(".party-color")?.value;
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
    tieBreak
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
      const allocation = allocateDistrict(d, method);
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
      totalSeats: totalSeats
    });

    const details = document.createElement("details");
    details.className = "border mt-4";
    const summary = document.createElement("summary");
    summary.textContent = "Округа";
    details.appendChild(summary);
    mount.appendChild(details);

    parsedDistricts.forEach((d) => {
      const districtAllocation = allocateDistrict(d, method);
      const allocArr = Object.entries(districtAllocation).map(([partyId, seats]) => ({
        partyId,
        seats,
        color: (partyRegistry.get(partyId) || {}).color || "#888888"
      })).sort((a, b) => b.seats - a.seats);

      const legendArrD = allocArr.map((a) => {
        const partyVotes = d.parties.find((p) => p.partyId === a.partyId)?.votes || 0;
        const votePct = (partyVotes / d.parties.reduce((sum, p) => sum + p.votes, 0)) * 100;
        return {
          partyId: a.partyId,
          name: (partyRegistry.get(a.partyId) || { name: a.partyId }).name,
          color: a.color,
          votePct,
          seatPct: (a.seats / d.seats) * 100
        };
      });

      const placeholder = document.createElement("div");
      placeholder.className = "my-4";
      details.appendChild(placeholder);

      buildSVG({
        mountEl: placeholder,
        title: `${d.name}`,
        seatMap: allocArr,
        legendRows: legendArrD,
        totalSeats: d.seats
      });
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

export function init() {
  districtsContainer = qs("#districts-container");
  resultsContainer = qs("#results");
  qs("#add-district").addEventListener("click", () => addDistrict());
  qs("#generate").addEventListener("click", () => recalculateAll());
  addDistrict();
}
