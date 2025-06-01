import { PR_METHODS, allocateDistrict, aggregateNation } from "./allocators.js";
import { buildSVG } from "./svg-utils.js";

const METHODS = Object.values(PR_METHODS);
const MAX_DISTRICTS = 100;
let districtsContainer, resultsContainer;
let districtCounter = 0;
const districts = new Map();
const partyRegistry = new Map();

function qs(sel, root = document) {
  return root.querySelector(sel);
}
function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function nextDistrictId() {
  return ++districtCounter;
}

function syncPartyRegistryFromRow(row) {
  const id = row.dataset.partyId;
  if (!id) return;
  const name = row.querySelector(".party-name")?.value.trim();
  const color = row.querySelector(".party-color")?.value;
  const existing = partyRegistry.get(id) || {};
  const changed = existing.name !== name || existing.color !== color;
  if (changed) {
    partyRegistry.set(id, { name, color });
    qsa("tr").forEach((r) => {
      const pid = r.dataset.partyId;
      if (pid === id && r !== row) {
        r.querySelector(".party-name").value = name;
        r.querySelector(".party-color").value = color;
      }
    });
  }
}

function addDistrict(cloneSourceEl = null) {
  if (districts.size >= MAX_DISTRICTS) return;
  const id = nextDistrictId();
  const template = qs("#district-template");
  const districtEl = template.content.firstElementChild.cloneNode(true);
  districtEl.dataset.districtId = id;

  const nameInput = qs(".district-name", districtEl);
  nameInput.value = cloneSourceEl ? `${qs(".district-name", cloneSourceEl).value} (копия)` : `Округ #${id}`;

  const seatsInput = qs(".seats", districtEl);
  if (cloneSourceEl) {
    seatsInput.value = qs(".seats", cloneSourceEl)?.value || 6;
    qs(".threshold", districtEl).value = qs(".threshold", cloneSourceEl)?.value || 0;
    qs(".tie-break", districtEl).value = qs(".tie-break", cloneSourceEl)?.value || "random";
    qs(".over-alloc", districtEl).value = qs(".over-alloc", cloneSourceEl)?.value || "remove-large";
  }

  const partyTbody = qs("tbody", districtEl);
  if (!cloneSourceEl && id === 1) {
    const defaultColors = ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00'];
    const defaultVotes = [100000, 80000, 30000, 20000, 10000];
    for (let i = 0; i < 5; i++) {
      const row = document.createElement("tr");
      const partyId = `P${i + 1}`;
      row.dataset.partyId = partyId;
      row.innerHTML = `
        <td><input type="text" class="party-name w-full border p-1" value="${partyId}" /></td>
        <td><input type="number" class="party-votes w-full border p-1 text-right" value="${defaultVotes[i]}" min="0" /></td>
        <td><input type="color" class="party-color w-full" value="${defaultColors[i]}" /></td>
        <td><button type="button" class="remove-party text-red-600">✕</button></td>`;
      row.querySelector(".remove-party")?.addEventListener("click", () => row.remove());
      partyTbody.appendChild(row);
      syncPartyRegistryFromRow(row);
    }
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
  districts.set(id, { el: districtEl });
}

function removeDistrict(id) {
  const record = districts.get(id);
  if (record) {
    record.el.remove();
    districts.delete(id);
  }
}

function addPartyRow(tbody) {
  const index = tbody.children.length + 1;
  const partyId = `P${index}`;
  const row = document.createElement("tr");
  row.dataset.partyId = partyId;
  row.innerHTML = `
    <td><input type="text" class="party-name w-full border p-1" placeholder="Название" /></td>
    <td><input type="number" class="party-votes w-full border p-1 text-right" min="0" value="0" /></td>
    <td><input type="color" class="party-color w-full" /></td>
    <td><button type="button" class="remove-party text-red-600">✕</button></td>`;
  row.querySelector(".remove-party")?.addEventListener("click", () => row.remove());
  tbody.appendChild(row);
  syncPartyRegistryFromRow(row);
}

function parseDistrict(record) {
  const el = record.el;
  const name = qs(".district-name", el)?.value.trim() || `Округ ${el.dataset.districtId}`;
  const seats = parseInt(qs(".seats", el)?.value, 10);
  const threshold = parseFloat(qs(".threshold", el)?.value);
  const tieBreak = qs(".tie-break", el)?.value;
  const overAlloc = qs(".over-alloc", el)?.value;

  if (!(seats > 0)) throw new Error(`Округ "${name}": число мандатов должно быть > 0`);
  if (threshold < 0 || threshold > 100 || isNaN(threshold)) throw new Error(`Округ "${name}": неверный порог`);

  const parties = [];
  qsa("tbody tr", el).forEach((row, i) => {
    const partyId = row.dataset.partyId || `P${i + 1}`;
    const name = row.querySelector(".party-name")?.value.trim();
    const votesStr = row.querySelector(".party-votes")?.value.trim();
    const color = row.querySelector(".party-color")?.value;
    if (!name || votesStr === "") return;
    const votes = parseInt(votesStr, 10);
    if (isNaN(votes) || votes < 0) return;
    parties.push({ partyId, name, votes, color });
  });

  if (parties.length === 0) throw new Error(`Округ "${name}" не содержит ни одной партии с валидными голосами`);

  return { seats, parties, barrier: threshold / 100, tieBreak, overAlloc, name };
}

function recalculateAll() {
  resultsContainer.innerHTML = "";
  const parsedDistricts = [];
  const nationalTallies = {};

  try {
    districts.forEach(record => {
      const data = parseDistrict(record);
      parsedDistricts.push(data);

      METHODS.forEach(method => {
        const allocation = allocateDistrict(data, method, { overAllocRule: data.overAlloc });
        nationalTallies[method] = nationalTallies[method] || {};
        for (const [id, count] of Object.entries(allocation)) {
          nationalTallies[method][id] = (nationalTallies[method][id] || 0) + count;
        }

        const totalSeats = Object.values(allocation).reduce((a, b) => a + b, 0);
        const seatMap = Object.entries(allocation).map(([id, seats]) => {
          const partyInfo = partyRegistry.get(id) || {};
          return {
            name: partyInfo.name || id,
            color: partyInfo.color || "#ccc",
            seats,
            votePct: 0,
            mandatePct: (seats / totalSeats) * 100,
          };
        });

        const container = document.createElement("div");
        container.className = "bg-white p-4 rounded-xl shadow-md";
        container.appendChild(buildSVG({
          title: `${data.name} — ${method}`,
          seatMap,
          totalSeats,
          legendRows: seatMap,
          mountEl: container
        }));
        resultsContainer.appendChild(container);
      });
    });

    // National diagram
    METHODS.forEach(method => {
      const allocation = nationalTallies[method];
      const totalSeats = Object.values(allocation).reduce((a, b) => a + b, 0);
      const seatMap = Object.entries(allocation).map(([id, seats]) => {
        const partyInfo = partyRegistry.get(id) || {};
        return {
          name: partyInfo.name || id,
          color: partyInfo.color || "#ccc",
          seats,
          votePct: 0,
          mandatePct: (seats / totalSeats) * 100,
        };
      });

      const container = document.createElement("div");
      container.className = "bg-white p-4 rounded-xl shadow-md";
      container.appendChild(buildSVG({
        title: `Национальное распределение — ${method}`,
        seatMap,
        totalSeats,
        legendRows: seatMap,
        mountEl: container
      }));
      resultsContainer.appendChild(container);
    });

  } catch (err) {
    alert(err.message);
  }
}

function generateExample() {
  districts.clear();
  districtsContainer.innerHTML = "";
  addDistrict();
}

export function init() {
  districtsContainer = qs("#districts-container");
  resultsContainer = qs("#results");
  qs("#add-district")?.addEventListener("click", () => addDistrict());
  qs("#generate-example")?.addEventListener("click", generateExample);
  qs("#generate")?.addEventListener("click", recalculateAll);
  generateExample();
}
