// controller.js
import { districts, partyRegistry } from './district-manager.js';
import { addDistrict } from './district-manager.js';
import { setupCSVImport } from './csv-import.js';
import { qs } from './ui-utils.js';
import { allocateDistrict, PR_METHODS } from './allocators.js';
import { buildSVG } from './svg-utils.js';

const METHODS = Object.values(PR_METHODS);

export function init() {
  qs("#add-district").addEventListener("click", () => addDistrict({ emptyParties: true }));
  qs("#generate-example").addEventListener("click", () => {
    districts.clear();
    qs("#districts-container").innerHTML = "";
    addDistrict({ example: true });
  });
  qs("#generate").addEventListener("click", recalculateAll);
  setupCSVImport();
}

export function parseDistrict(record) {
  const el = record.el;
  const name = qs(".district-name", el)?.value.trim() || `Округ ${record.el.dataset.districtId}`;
  const seats = parseInt(qs(".seats", el)?.value, 10) || 0;
  const threshold = parseFloat(qs(".threshold", el)?.value) || 0;
  const tieBreak = qs(".tie-break", el)?.value || "random";
  const overAllocRule = qs(".over-alloc", el)?.value || "remove-large";

  const parties = [];
  document.querySelectorAll("tbody tr", el).forEach(row => {
    const partyId = row.querySelector(".party-id")?.value.trim();
    const votes = parseInt(row.querySelector(".party-votes")?.value, 10) || 0;
    if (!partyId || votes <= 0) return;
    const { name: partyName = partyId, color = "#888888" } = partyRegistry.get(partyId) || {};
    parties.push({ partyId, votes, name: partyName, color });
  });

  if (seats <= 0) throw new Error(`Округ \"${name}\": число мандатов должно быть > 0`);
  if (parties.length === 0) throw new Error(`Округ \"${name}\" не содержит ни одной партии с голосами`);

  return { id: record.el.dataset.districtId, name, seats, parties, barrier: threshold / 100, tieBreak, overAllocRule };
}

export function recalculateAll() {
  const resultsContainer = qs("#results");
  resultsContainer.innerHTML = "";

  const parsedDistricts = [];
  try {
    districts.forEach(record => {
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
  let totalVotes = 0, totalSeats = 0;

  parsedDistricts.forEach(d => {
    d.parties.forEach(p => {
      totalVotes += p.votes;
      nationalVotes.set(p.partyId, (nationalVotes.get(p.partyId) || 0) + p.votes);
    });
    totalSeats += d.seats;
  });

  METHODS.forEach(method => {
    const rawTotals = new Map();

    parsedDistricts.forEach(d => {
      const before = JSON.stringify(d);
      const allocation = allocateDistrict(d, method, { overAllocRule: d.overAllocRule });
      const after = JSON.stringify(d);
      if (before !== after) {
        console.warn("District was mutated by allocation function!", d.name);
      }


      for (const [partyId, seats] of Object.entries(allocation)) {
        rawTotals.set(partyId, (rawTotals.get(partyId) || 0) + seats);
      }
    });

    const mTotals = new Map();
    for (const [partyId, seats] of rawTotals.entries()) {
      const key = partyId.startsWith("DISPUTED_") ? "DISPUTED" : partyId;
      mTotals.set(key, (mTotals.get(key) || 0) + seats);
    }

    if (mTotals.has("DISPUTED")) {
      partyRegistry.set("DISPUTED", {
        name: "Спорные мандаты",
        color: "#D1D5DB"
      });
    }

    nationalSeats.set(method, mTotals);
  });

  renderSummaryTable({ METHODS, nationalSeats, nationalVotes, totalVotes, totalSeats });

  METHODS.forEach(method => {
    const mount = document.createElement("div");
    mount.className = "mb-8";
    resultsContainer.appendChild(mount);

    const mTotals = nationalSeats.get(method);
    const allocationArr = Array.from(mTotals.entries()).map(([partyId, seats]) => ({
      partyId,
      seats,
      color: (partyRegistry.get(partyId) || {}).color || "#888888"
    })).sort((a, b) => b.seats - a.seats);

    const legendArr = allocationArr.map(a => {
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

    buildSVG({
      mountEl: mount,
      title: `${methodLabel(method)} — national parliament`,
      seatMap: allocationArr,
      legendRows: legendArr,
      totalSeats,
      isNational: true
    });

    const methodWrapper = document.createElement("details");
    methodWrapper.className = "mb-6 border rounded p-3 bg-gray-50";
    methodWrapper.open = false;

    const methodSummary = document.createElement("summary");
    methodSummary.className = "cursor-pointer font-bold";
    methodSummary.textContent = `Диаграммы по округам — метод ${methodLabel(method)}`;
    methodWrapper.appendChild(methodSummary);

    parsedDistricts.forEach(district => {
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
        partyIdToNameMap: Object.fromEntries(district.parties.map(p => [p.partyId, p.name]))
      });

      methodWrapper.appendChild(wrapper);
    });

    qs("#results").appendChild(methodWrapper);
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

  const allPartyIds = new Set();
  METHODS.forEach(method => {
    nationalSeats.get(method).forEach((_, partyId) => allPartyIds.add(partyId));
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

    rows.push(`
      <tr>
        <td class="border border-gray-400 px-2 py-1" style="color: ${party.color}">${party.name}</td>
        <td class="border border-gray-400 px-2 py-1 text-right">${votePct}%</td>
        ${methodCells}
      </tr>`);
  }

  const tbody = document.createElement("tbody");
  tbody.innerHTML = rows.join("");
  table.appendChild(tbody);
  wrapper.appendChild(table);
  qs("#results").appendChild(wrapper);
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
