// ========================
// Mandates Allocation App
// ========================

/**
 * Entry point triggered by the "Generate" button.
 * Gathers form data, filters by barrier, and runs all allocation methods.
 */
function generateAll() {
  console.log("Generate button clicked");

  const totalSeats = parseInt(document.getElementById('total-seats').value);
  const barrier = parseFloat(document.getElementById('barrier').value);
  const tieBreakRule = document.getElementById('tie-break').value;
  const overAlloc = document.getElementById('over-alloc').value;

  const partyElements = document.querySelectorAll('.party-row');
  const parties = [];

  partyElements.forEach((row, i) => {
    const name = row.querySelector('.party-name').value || `P${i + 1}`;
    const votes = parseInt(row.querySelector('.party-votes').value);
    const color = row.querySelector('.party-color').value;
    if (votes > 0) {
      parties.push({ name, votes, color, index: i });
    }
  });

  if (parties.length === 0 || isNaN(totalSeats) || totalSeats <= 0) {
    alert("Please enter valid data.");
    return;
  }

  const totalVotes = parties.reduce((sum, p) => sum + p.votes, 0);
  const barrierVotes = totalVotes * barrier / 100;
  const filtered = parties.filter(p => p.votes >= barrierVotes);

  if (filtered.length === 0) {
    alert("No parties passed the barrier.");
    return;
  }

  const container = document.getElementById('visualizations');
  container.innerHTML = ''; // Clear old results

  const quotaMethods = [
    { name: "Hare Quota", quotaFn: (tv, s) => tv / s },
    { name: "Droop Quota", quotaFn: (tv, s) => Math.floor(tv / (s + 1)) + 1 },
    { name: "Imperiali Quota", quotaFn: (tv, s) => tv / (s + 2) },
  ];

  quotaMethods.forEach(method => {
    const clonedParties = JSON.parse(JSON.stringify(filtered));
    const result = quotaMethod(clonedParties, totalSeats, method.quotaFn, overAlloc, tieBreakRule);
    buildSVG(method.name, result, clonedParties.map(p => p.name), clonedParties.map(p => p.color));
  });

  const divisorMethods = [
    { name: "D’Hondt", divisorFn: i => i + 1 },
    { name: "Sainte-Laguë", divisorFn: i => 2 * i + 1 }
  ];

  divisorMethods.forEach(method => {
    const clonedParties = JSON.parse(JSON.stringify(filtered));
    const result = divisorMethod(clonedParties, totalSeats, method.divisorFn, tieBreakRule);
    buildSVG(method.name, result, clonedParties.map(p => p.name), clonedParties.map(p => p.color));
  });
}

/**
 * Implements quota-based seat allocation (Hare, Droop, Imperiali).
 * Handles over-allocation rules and applies tie-breaks when needed.
 */
function quotaMethod(parties, seats, quotaFn, overAllocRule, tieBreakRule) {
  const totalVotes = parties.reduce((a, b) => a + b.votes, 0);
  let quota = quotaFn(totalVotes, seats);
  let base = parties.map(p => Math.floor(p.votes / quota));
  let allocated = base.reduce((a, b) => a + b, 0);

  // Handle over-allocation
  if (allocated > seats) {
    if (overAllocRule === 'increase') {
      seats = allocated;
    } else if (overAllocRule === 'adjust-quota') {
      let step = 0.000001;
      let attempts = 0;
      let maxAttempts = 100000;
      while (allocated > seats && attempts < maxAttempts) {
        quota += step;
        base = parties.map(p => Math.floor(p.votes / quota));
        allocated = base.reduce((a, b) => a + b, 0);
        step *= 2;
        attempts++;
      }
      if (attempts === maxAttempts) {
        alert("Quota adjustment failed: max iterations reached.");
      }

    } else {
      const sorted = [...parties].sort((a, b) =>
        overAllocRule === 'remove-large' ? b.votes - a.votes : a.votes - b.votes
      );
      while (allocated > seats) {
        for (const p of sorted) {
          const i = parties.indexOf(p);
          if (base[i] > 0) {
            base[i]--;
            allocated--;
            if (allocated === seats) break;
          }
        }
      }
    }
  }

  // Distribute remaining seats by largest remainders
  const remaining = seats - allocated;
  if (remaining > 0) {
    const remainders = parties.map((p, i) => ({
      idx: i,
      frac: p.votes / quota - Math.floor(p.votes / quota),
      votes: p.votes,
      index: p.index
    }));

    remainders.sort((a, b) => b.frac - a.frac);
    const tied = remainders.filter((r, _, arr) => r.frac === arr[0].frac);

    if (tied.length <= remaining) {
      for (let i = 0; i < remaining; i++) base[remainders[i].idx]++;
    } else {
      const selected = applyTieBreak(tied, remaining, tieBreakRule, parties);
      selected.forEach(idx => base[idx]++);
    }
  }

  return base;
}

/**
 * Implements divisor-based seat allocation (D’Hondt, Sainte-Laguë).
 * Handles ties with the selected tie-break rule.
 */
function divisorMethod(parties, seats, divisorFn, tieBreakRule) {
  const n = parties.length;
  const allocation = Array(n).fill(0);
  let distributed = 0;

  let safetyCounter = 0;
  const maxSteps = 10000;

  while (distributed < seats && safetyCounter < maxSteps) {
    const quotients = parties.map((p, i) => {
      const divisor = divisorFn(allocation[i]);
      // Prevent divide-by-zero or NaN issues
      const q = divisor > 0 ? p.votes / divisor : 0;
      return {
        idx: i,
        q,
        votes: p.votes,
        index: p.index
      };
    });

    quotients.sort((a, b) => b.q - a.q);
    const maxQ = quotients[0].q;

    const top = quotients.filter(q => q.q === maxQ);

    if (top.length <= seats - distributed) {
      top.forEach(t => {
        allocation[t.idx]++;
        distributed++;
      });
    } else {
      const selected = applyTieBreak(top, seats - distributed, tieBreakRule, parties);
      selected.forEach(idx => allocation[idx]++);
      distributed = seats;
    }

    safetyCounter++;
  }

  if (safetyCounter === maxSteps) {
    alert("⚠️ Divisor method failed: exceeded maximum steps. Possible infinite loop.");
    console.warn("Divisor method bailed after", maxSteps, "iterations.");
  }

  return allocation;
}

/**
 * Applies a selected tie-break rule to candidates with equal remainder or quotient.
 */
function applyTieBreak(candidates, count, rule, parties) {
  if (rule === 'disputed') {
    const names = candidates.map(c => parties[c.idx].name).join(', ');
    const label = `Disputed Mandates (${names})`;

    let existing = parties.find(p => p.name === label);
    if (!existing) {
      parties.push({
        name: label,
        votes: 0,
        color: '#ffffff',
        index: 9999
      });
      existing = parties[parties.length - 1];
    }

    const idx = parties.indexOf(existing);
    return Array(count).fill(idx);
  }

  const sorters = {
    random: () => shuffle([...candidates]),
    most: () => [...candidates].sort((a, b) => b.votes - a.votes),
    least: () => [...candidates].sort((a, b) => a.votes - b.votes),
    index: () => [...candidates].sort((a, b) => a.index - b.index)
  };

  return (sorters[rule] ? sorters[rule]() : candidates)
    .slice(0, count)
    .map(c => c.idx);
}

/**
 * Fisher-Yates shuffle to randomly reorder elements.
 */
function shuffle(array) {
  let current = array.length, temp, rand;
  while (current) {
    rand = Math.floor(Math.random() * current--);
    temp = array[current];
    array[current] = array[rand];
    array[rand] = temp;
  }
  return array;
}
