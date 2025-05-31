import { syncPartyRegistryFromRow } from './allocators.js';

let districtCounter = 0;
const defaultColors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#999999'];

export function init() {
  const addDistrictButton = document.getElementById('add-district');
  const generateExampleButton = document.getElementById('generate-example');
  const districtsContainer = document.getElementById('districts-container');

  addDistrictButton.addEventListener('click', () => addDistrict(districtsContainer));
  generateExampleButton.addEventListener('click', () => {
    const section = addDistrict(districtsContainer);
    section.querySelector('.district-name').value = 'Пример';
    section.querySelector('.seats').value = 6;
    section.querySelector('.threshold').value = 5;
    const tbody = section.querySelector('tbody');
    const exampleVotes = [32000, 24000, 9000, 7000, 6000];
    for (let i = 0; i < 5; i++) {
      const row = addParty(tbody);
      row.querySelector('.party-votes').value = exampleVotes[i];
    }
  });

  addDistrict(districtsContainer);
}

function addDistrict(container) {
  const template = document.getElementById('district-template');
  const clone = template.content.cloneNode(true);
  const section = clone.querySelector('section');
  const tbody = section.querySelector('tbody');

  section.dataset.index = districtCounter++;

  const addPartyBtn = section.querySelector('.add-party');
  addPartyBtn.addEventListener('click', () => addParty(tbody));

  section.querySelector('.remove-district').addEventListener('click', () => section.remove());
  section.querySelector('.clone-district').addEventListener('click', () => {
    const newSection = addDistrict(container);
    newSection.querySelector('.district-name').value = section.querySelector('.district-name').value + ' (копия)';
    newSection.querySelector('.seats').value = section.querySelector('.seats').value;
    newSection.querySelector('.threshold').value = section.querySelector('.threshold').value;
    newSection.querySelector('.tie-break').value = section.querySelector('.tie-break').value;

    const originalRows = section.querySelectorAll('tbody tr');
    originalRows.forEach((oldRow) => {
      const newRow = addParty(newSection.querySelector('tbody'));
      newRow.querySelector('.party-name').value = oldRow.querySelector('.party-name').value;
      newRow.querySelector('.party-color').value = oldRow.querySelector('.party-color').value;
      newRow.querySelector('.party-votes').value = oldRow.querySelector('.party-votes').value;
    });
  });

  container.appendChild(clone);

  return container.lastElementChild;
}

let partyCounter = 1;

function addParty(tbody) {
  const color = defaultColors[(partyCounter - 1) % defaultColors.length];
  const row = document.createElement('tr');
  row.innerHTML = `
    <td class="text-center">${partyCounter}</td>
    <td><input type="text" class="party-name w-full border p-1" value="P${partyCounter}" /></td>
    <td><input type="color" class="party-color w-full" value="${color}" /></td>
    <td><input type="number" class="party-votes w-full border p-1 text-right" min="0" value="0" /></td>
    <td><button type="button" class="remove-party text-rose-600">✕</button></td>
  `;
  row.querySelector(".remove-party")?.addEventListener("click", () => row.remove());
  tbody.appendChild(row);
  syncPartyRegistryFromRow(row);
  partyCounter++;
  return row;
}
