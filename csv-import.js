// csv-import.js
import { addPartyRow } from './district-manager.js';
import { qs } from './utils.js';

export function setupCSVImport() {
  const uploadBtn = document.getElementById("upload-csv");
  const input = document.getElementById("csv-import");
  uploadBtn.addEventListener("click", () => input.click());
  input.addEventListener("change", handleCSVUpload);
}

export function handleCSVUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      const rows = results.data;
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
          errors.push(`Invalid row: ${JSON.stringify(row)}`);
          continue;
        }

        if (!districts.has(districtName)) {
          districts.set(districtName, {
            name: districtName,
            seats,
            parties: []
          });
        }

        const d = districts.get(districtName);
        if (d.seats !== seats) {
          errors.push(`District \"${districtName}\" has inconsistent seat counts.`);
          continue;
        }

        d.parties.push({ partyId: party, name: party, votes });

        const stat = partyStats.get(party) || { name: party, totalVotes: 0 };
        stat.totalVotes += votes;
        partyStats.set(party, stat);
      }

      if (errors.length > 0) {
        alert("CSV Errors:\n\n" + errors.join("\n"));
        return;
      }

      previewImport(districts, partyStats);
    },
    error: (err) => {
      alert("CSV Parse Error: " + err.message);
    }
  });
}

function validateParsedCSV(rows) {
  const requiredFields = ["district_name", "seats", "party", "votes"];
  const missing = requiredFields.filter(f => !(f in rows[0]));
  if (missing.length > 0) {
    alert("Missing required columns: " + missing.join(", "));
    return false;
  }
  return true;
}

function previewImport(districts, partyStats) {
  const modal = qs("#import-preview");
  const summary = qs("#import-summary");
  const partyContainer = qs("#import-parties");

  let totalSeats = 0;
  for (const d of districts.values()) totalSeats += d.seats;

  summary.innerHTML = `
    <p><strong>Округов:</strong> ${districts.size}</p>
    <p><strong>Всего мандатов:</strong> ${totalSeats}</p>
    <p><strong>Партий:</strong> ${partyStats.size}</p>
  `;

  partyContainer.innerHTML = "";
  for (const [id, stat] of partyStats.entries()) {
    const div = document.createElement("div");
    div.textContent = `${stat.name} — ${stat.totalVotes} голосов`;
    partyContainer.appendChild(div);
  }

  modal.classList.remove("hidden");

  qs("#cancel-import").onclick = () => modal.classList.add("hidden");
  qs("#confirm-import").onclick = () => {
    const globalSettings = {
      threshold: parseFloat(qs("#import-threshold").value) || 0,
      overAllocRule: qs("#import-overalloc").value,
      tieBreak: qs("#import-tiebreak").value
    };
    createDistrictsFromImport(districts, partyStats, globalSettings);
    modal.classList.add("hidden");
  };
}

// You must implement createDistrictsFromImport in district-manager.js and export it
// export function createDistrictsFromImport(districts, partyStats, globalSettings) { ... }
