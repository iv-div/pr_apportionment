// =============================================================
//  ui/controller.js — orchestrates DOM ↔ core ↔ svg utilities
//  Handles up to 650 districts, global party registry, aggregation
// =============================================================

import { PR_METHODS, allocateDistrict } from "./allocators.js";
import { buildSVG } from "./svg-utils.js";
const METHODS = Object.values(PR_METHODS);   

/*************************
 * Module‑level state
 *************************/
const MAX_DISTRICTS = 650;

// HTML containers
let districtsContainer;       // <div id="districts-container">
let resultsContainer;          // <div id="results">

// Internal stores
const districts = new Map();   // id → {el, data}
const partyRegistry = new Map(); // partyId → {name, color}
let districtCounter = 0;       // incremental id

/*************************
 * Helper: generate unique IDs
 *************************/
function nextDistrictId() {
  return ++districtCounter; // start from 1
}

/*************************
 * DOM helpers
 *************************/
function qs(sel, root = document) {
  return root.querySelector(sel);
}
function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

/*************************
 * District DOM creation
 *************************/
function addDistrict(cloneSourceEl = null) {
  if (districts.size >= MAX_DISTRICTS) {
    alert(`Максимум ${MAX_DISTRICTS} округов.`);
    return;
  }
  const id = nextDistrictId();
  const template = qs("#district-template");
  const districtEl = template.content.firstElementChild.cloneNode(true);
  districtEl.dataset.districtId = id;
  // Update heading label
  qs(".district-name", districtEl).value = cloneSourceEl
    ? qs(".district-name", cloneSourceEl).value + " (copy)"
    : `Округ #${id}`;

  // seats input
  if (cloneSourceEl) {
    qs(".district-seats", districtEl).value = qs(".district-seats", cloneSourceEl).value;
  }

  // parties table — copy rows from source or leave empty
  const partyTbody = qs("tbody", districtEl);
  if (cloneSourceEl) {
    qsa("tbody tr", cloneSourceEl).forEach((row) => {
      const clone = row.cloneNode(true);
      partyTbody.appendChild(clone);
    });
  }

  // add listeners for clone / remove / add party row
  qs(".clone-district-btn", districtEl).addEventListener("click", () => addDistrict(districtEl));
  qs(".remove-district-btn", districtEl).addEventListener("click", () => removeDistrict(id));
  qs(".add-party-btn", districtEl).addEventListener("click", () => addPartyRow(partyTbody));

  // sync party edits
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
  if (!record) return;
  record.el.remove();
  districts.delete(id);
}

function addPartyRow(tbody) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><input type="text" class="party-id w-24 border" placeholder="ID" /></td>
    <td><input type="text" class="party-name w-32 border" placeholder="Название" /></td>
    <td><input type="color" class="party-color w-16 border" /></td>
    <td><input type="number" min="0" class="party-votes w-24 border text-right" placeholder="0" /></td>
    <td><button type="button" class="delete-party-row text-red-600">✕</button></td>`;
  row.querySelector(".delete-party-row").addEventListener("click", () => row.remove());
  tbody.appendChild(row);
}

/*************************
 * Party registry sync
 *************************/
function syncPartyRegistryFromRow(row) {
  const id = row.querySelector(".party-id").value.trim();
  if (!id) return;
  const name = row.querySelector(".party-name").value.trim();
  const color = row.querySelector(".party-color").value;
  const existing = partyRegistry.get(id) || {};
  const changed = existing.name !== name || existing.color !== color;
  if (changed) {
    partyRegistry.set(id, { name, color });
    // propagate change to all rows with same partyId
    qsa(`tr`).forEach((r) => {
      const pidInput = r.querySelector(".party-id");
      if (pidInput && pidInput.value.trim() === id && r !== row) {
        r.querySelector(".party-name").value = name;
        r.querySelector(".party-color").value = color;
      }
    });
  }
}

/*************************
 * Parsing district DOM → JS object
 *************************/
function parseDistrict(record) {
  const el = record.el;
  const name = qs(".district-name", el).value.trim() || `Округ ${record.el.dataset.districtId}`;
  const seats = parseInt(qs(".district-seats", el).value, 10) || 0;
  const parties = [];
  qsa("tbody tr", el).forEach((row) => {
    const partyId = row.querySelector(".party-id").value.trim();
    const votes = parseInt(row.querySelector(".party-votes").value, 10) || 0;
    if (!partyId || votes <= 0) return; // skip incomplete
    const { name: partyName = partyId, color = "#888888" } = partyRegistry.get(partyId) || {};
    parties.push({ partyId, votes, name: partyName, color });
  });
  // Basic validation
  if (seats <= 0) {
    throw new Error(`Округ "${name}": число мандатов должно быть > 0`);
  }
  if (parties.length === 0) {
    throw new Error(`Округ "${name}" не содержит ни одной партии с голосами`);
  }
  // settings — пока берём глобальные из формы advanced (TODO)
  const settings = {
    threshold: parseFloat(qs("#threshold-input").value) || 0,
    tieBreak: qs("#tiebreak-select").value || "votes",
    disputedMode: qs("#disputed-checkbox").checked
  };
  return { id: record.el.dataset.districtId, name, seats, parties, settings };
}

/*************************
 * Recalculate & Render
 *************************/
function recalculateAll() {
  // Clear previous results
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

  // -------- Aggregate national results --------
  const nationalSeats = new Map(); // method → partyId → seats
  const nationalVotes = new Map(); // partyId → votes (sum of votes across districts)
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

  // For each method collect seats
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

  // -------- Render national and per‑district --------

  METHODS.forEach((method) => {
    const mount = document.createElement("div");
    mount.className = "mb-8";
    resultsContainer.appendChild(mount);

    const mTotals = nationalSeats.get(method);
    const allocationArr = Array.from(mTotals.entries())
      .map(([partyId, seats]) => ({
        partyId,
        seats,
        color: (partyRegistry.get(partyId) || {}).color || "#888888"
      }))
      .sort((a, b) => b.seats - a.seats);

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
      allocation: allocationArr,
      legend: legendArr,
      showDownload: true
    });

    // Collapsible districts list
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
        allocation: allocArr,
        legend: legendArrD,
        showDownload: false
      });
    });
  });
}

function methodLabel(method) {
  switch (method) {
    case "hare":
      return "Hare";
    case "droop":
      return "Droop";
    case "imperiali":
      return "Imperiali";
    case "dhondt":
      return "D’Hondt";
    case "saintelague":
      return "Sainte‑Laguë";
    default:
      return method;
  }
}

/*************************
 * Init – called from main.js once DOM is ready
 *************************/
export function init() {
  districtsContainer = qs("#districts-container");
  resultsContainer = qs("#results");

  qs("#add-district-btn").addEventListener("click", () => addDistrict());
  qs("#generate-btn").addEventListener("click", () => recalculateAll());

  // create first empty district by default
  addDistrict();
}
