// district-manager.js
import { getNextColor } from './party-utils.js';
import { qs, qsa } from './ui-utils.js';

export const districts = new Map();
export const partyRegistry = new Map();
let nextPartyNumber = 1;
let districtCounter = 0;

export function getNextPartyId() {
  while (partyRegistry.has(`P${nextPartyNumber}`)) nextPartyNumber++;
  return `P${nextPartyNumber++}`;
}

export function nextDistrictId() {
  return ++districtCounter;
}

export function addDistrict({ cloneSourceEl = null, emptyParties = false, example = false } = {}) {
  const id = nextDistrictId();
  const template = qs("#district-template");
  const districtEl = template.content.firstElementChild.cloneNode(true);
  districtEl.dataset.districtId = id;

  qs(".district-name", districtEl).value = cloneSourceEl
    ? qs(".district-name", cloneSourceEl)?.value + " (copy)"
    : `Округ #${id}`;

  if (cloneSourceEl) {
    [".seats", ".threshold", ".tie-break", ".over-alloc"].forEach(selector => {
      const src = qs(selector, cloneSourceEl);
      const dest = qs(selector, districtEl);
      if (src && dest) dest.value = src.value;
    });
  }

  const partyTbody = qs("tbody", districtEl);

  if (cloneSourceEl) {
    qsa("tbody tr", cloneSourceEl).forEach(row => {
      const partyId = row.querySelector(".party-id")?.value.trim();
      const partyName = row.querySelector(".party-name")?.value.trim();
      const partyColor = row.querySelector(".party-color")?.value;
      const partyVotes = parseInt(row.querySelector(".party-votes")?.value, 10) || 0;

      addPartyRow(partyTbody, { id: partyId, name: partyName, color: partyColor, votes: partyVotes });
    });
  } else if (example) {
    [
      { name: "P1", color: "#e41a1c", votes: 10000 },
      { name: "P2", color: "#377eb8", votes: 8000 },
      { name: "P3", color: "#4daf4a", votes: 3000 },
      { name: "P4", color: "#984ea3", votes: 2000 },
      { name: "P5", color: "#ff7f00", votes: 1000 }
    ].forEach(p => addPartyRow(partyTbody, { id: p.name, name: p.name, color: p.color, votes: p.votes }));
  } else if (emptyParties) {
    for (let i = 0; i < 5; i++) addPartyRow(partyTbody);
  }

  qs(".clone-district", districtEl)?.addEventListener("click", () => addDistrict({ cloneSourceEl: districtEl }));
  qs(".remove-district", districtEl)?.addEventListener("click", () => removeDistrict(id));
  qs(".add-party", districtEl)?.addEventListener("click", () => addPartyRow(partyTbody));

  partyTbody.addEventListener("input", (e) => {
    const row = e.target.closest("tr");
    if (row) syncPartyRegistryFromRow(row);
  });

  districts.set(id, { el: districtEl, data: null });
  qs("#districts-container").appendChild(districtEl);
}

export function removeDistrict(id) {
  const record = districts.get(id);
  if (record) {
    record.el.remove();
    districts.delete(id);
  }
}

export function addPartyRow(tbody, { id = "", name = "", color = getNextColor(), votes = 0 } = {}) {
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
    const typed = nameInput.value.trim();
    for (const [existingId, data] of partyRegistry.entries()) {
      if (data.name === typed) {
        row.querySelector(".party-id").value = existingId;
        row.querySelector(".party-color").value = data.color;
        break;
      }
    }
  });

  tbody.appendChild(row);
  syncPartyRegistryFromRow(row);
}

export function syncPartyRegistryFromRow(row) {
  const idInput = row.querySelector(".party-id");
  const nameInput = row.querySelector(".party-name");
  const colorInput = row.querySelector(".party-color");

  let id = idInput?.value.trim();
  const name = nameInput?.value.trim();

  if (!id && name) {
    for (const [existingId, data] of partyRegistry.entries()) {
      if (data.name === name) {
        id = existingId;
        idInput.value = id;
        colorInput.value = data.color;
        break;
      }
    }
  }

  if (!id) {
    id = getNextPartyId();
    idInput.value = id;
  }

  const color = colorInput?.value || "#888888";
  const existing = partyRegistry.get(id) || {};
  const changed = existing.name !== name || existing.color !== color;

  if (changed) {
    partyRegistry.set(id, { name, color });
    qsa("tr").forEach(r => {
      const pidInput = r.querySelector(".party-id");
      if (pidInput?.value.trim() === id && r !== row) {
        const nameField = r.querySelector(".party-name");
        const colorField = r.querySelector(".party-color");
        if (nameField) nameField.value = name;
        if (colorField) colorField.value = color;
      }
    });
  }
  updatePartySuggestions();
}

export function updatePartySuggestions() {
  const datalist = qs("#party-suggestions");
  if (!datalist) return;
  datalist.innerHTML = "";
  for (const { name } of partyRegistry.values()) {
    if (!name) continue;
    const option = document.createElement("option");
    option.value = name;
    datalist.appendChild(option);
  }
}

export function createDistrictsFromImport(importedDistricts, partyStats, globalSettings) {
  const container = qs("#districts-container");
  container.innerHTML = "";
  districts.clear();
  partyRegistry.clear();
  nextPartyNumber = 1;
  districtCounter = 0;

  for (const [id, party] of partyStats.entries()) {
    partyRegistry.set(id, {
      name: party.name,
      color: party.color || getNextColor()
    });
  }

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

    container.appendChild(districtEl);
    districts.set(id, { el: districtEl, data: null });
  }
}
