// mandates.js

/**
 * Entry point triggered by the "Generate" button/form submission.
 */
function generateAll() {
  console.log("Generate button/form submit triggered");

  const totalSeatsInput = document.getElementById('total-seats');
  const totalSeats = parseInt(totalSeatsInput.value);
  if (!(totalSeats >= 1 && totalSeats <= 3000)) {
    alert('Total seats must be between 1 and 3000.');
    totalSeatsInput.focus();
    return;
  }

  const barrierInput = document.getElementById('barrier');
  const barrier = parseFloat(barrierInput.value) || 0;
  if (barrier < 0 || barrier > 100) {
    alert('Barrier must be between 0 and 100.');
    barrierInput.focus();
    return;
  }

  const tieBreakRule = document.getElementById('tie-break').value;
  const overAllocRule = document.getElementById('over-alloc').value;

  const partyRows = document.querySelectorAll('#party-list .party-row');
  const partiesDataFromForm = []; 

  partyRows.forEach((row, i) => {
    const nameInput = row.querySelector('.party-name');
    const votesInput = row.querySelector('.party-votes');
    const colorInput = row.querySelector('.party-color');
    
    const name = nameInput.value.trim() || `P${i + 1}`;
    const votes = parseInt(votesInput.value); 
    const color = colorInput.value;

    if (!isNaN(votes) && votes > 0) { 
      partiesDataFromForm.push({ name, votes, color, originalIndex: i }); 
    } else if (nameInput.value.trim() || (!isNaN(votes) && votesInput.value.trim() !== '')) { 
      // Add party if name is entered, even if votes are 0 or invalid, for barrier calculation purposes
      // It will likely be filtered by barrier or if votes are truly 0 by calculation logic.
      partiesDataFromForm.push({ name, votes: 0, color, originalIndex: i });
    }
  });

  if (partyRows.length > 0 && partiesDataFromForm.filter(p => p.votes > 0).length === 0) {
    alert("Please enter positive votes for at least one party.");
    return;
  }
  if (partyRows.length === 0){
    alert("Please add at least one party.");
    return;
  }


  const totalVotesAllParties = partiesDataFromForm.reduce((sum, p) => sum + p.votes, 0);
  
  const barrierVotes = totalVotesAllParties * barrier / 100;
  
  // partiesForCalculation will hold parties that passed the barrier or are otherwise eligible.
  // The 'index' property here is crucial for 'lowest index' tie-breaking and refers to 'originalIndex'.
  const partiesForCalculation = partiesDataFromForm
    .filter(p => p.votes >= barrierVotes)
    .map(p => ({ ...p, index: p.originalIndex })); // Add 'index' for tie-breaking


  if (partiesForCalculation.length === 0 && totalVotesAllParties > 0) {
    alert("No parties passed the electoral barrier.");
    return;
  }
  if (partiesForCalculation.length === 0 && totalVotesAllParties === 0 && partiesDataFromForm.length > 0) {
    alert("No parties have any votes after filtering. Please check your input.");
    return;
  }


  // Prepare for output
  const resultsContainer = document.getElementById('results');
  resultsContainer.innerHTML = '<p class="text-center text-lg text-slate-600 py-8">Generating diagrams...</p>';
  const imageElementsContainer = document.createElement('div');
  imageElementsContainer.className = 'space-y-8'; // Tailwind class for spacing between diagram cards


  const allocationMethods = [
    { name: "Hare Quota", type: "quota", quotaFn: (tv, s) => tv / s },
    { name: "Droop Quota", type: "quota", quotaFn: (tv, s) => Math.floor(tv / (s + 1)) + 1 },
    { name: "Imperiali Quota", type: "quota", quotaFn: (tv, s) => tv / (s + 2) },
    { name: "D’Hondt", type: "divisor", divisorFn: i => i + 1 }, // Divisor for NEXT seat is d(current_seats + 1)
    { name: "Sainte-Laguë", type: "divisor", divisorFn: i => 2 * i + 1 } // Divisor for NEXT seat
  ];

  let processedCount = 0;

  allocationMethods.forEach(method => {
    const clonedPartiesForMethod = JSON.parse(JSON.stringify(partiesForCalculation)); 
    // 'index' property (original input order) is preserved by JSON stringify for simple values.
    
    let seatCounts;
    if (method.type === "quota") {
      seatCounts = quotaMethod(clonedPartiesForMethod, totalSeats, method.quotaFn, overAllocRule, tieBreakRule);
    } else { 
      seatCounts = divisorMethod(clonedPartiesForMethod, totalSeats, method.divisorFn, tieBreakRule);
    }

    const partyNames = clonedPartiesForMethod.map(p => p.name);
    const partyColors = clonedPartiesForMethod.map(p => p.color);
    
    const svgString = buildSVG(method.name, seatCounts, partyNames, partyColors);

    svgToImage(svgString, (dataUrl, error) => {
      if (error) {
        console.error(`Failed to generate image for ${method.name}:`, error);
        // Optionally display an error message in the UI for this specific diagram
        const errorWrapper = document.createElement('div');
        errorWrapper.className = 'bg-white rounded-lg shadow-md p-4 flex flex-col items-center text-red-600';
        errorWrapper.innerHTML = `<h3 class="text-xl font-semibold mb-2">${method.name}</h3><p>Error generating diagram.</p>`;
        imageElementsContainer.appendChild(errorWrapper);
      } else {
        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'bg-white rounded-lg shadow-md p-4 flex flex-col items-center'; 
        
        const methodTitle = document.createElement('h3');
        methodTitle.className = 'text-xl font-semibold mb-3 text-slate-700';
        methodTitle.textContent = method.name;

        const img = document.createElement('img');
        img.src = dataUrl;
        img.alt = `${method.name} Parliament Diagram`;
        img.className = 'max-w-full h-auto mx-auto block border border-slate-200 rounded'; 
        
        const downloadBtn = document.createElement('a');
        downloadBtn.href = dataUrl;
        downloadBtn.download = `parliament-${method.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
        downloadBtn.className = 'inline-block mt-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md px-4 py-2 text-sm transition-colors';
        downloadBtn.textContent = 'Download PNG';
        
        imgWrapper.appendChild(methodTitle); 
        imgWrapper.appendChild(img);
        imgWrapper.appendChild(downloadBtn);
        imageElementsContainer.appendChild(imgWrapper); 
      }
      
      processedCount++;
      if (processedCount === allocationMethods.length) {
        resultsContainer.innerHTML = ''; 
        resultsContainer.appendChild(imageElementsContainer); 
      }
    });
  });
}

document.getElementById('inputForm').addEventListener('submit', function(event) {
  event.preventDefault(); 
  generateAll();
});


// --- Core Allocation Logic (refined for robustness and clarity) ---

function shuffle(array) {
  let current = array.length, temp, rand;
  while (current !== 0) {
    rand = Math.floor(Math.random() * current);
    current--;
    temp = array[current];
    array[current] = array[rand];
    array[rand] = temp;
  }
  return array;
}

function applyTieBreak(candidates, seatsToAward, rule, currentMethodParties) {
  if (seatsToAward <= 0) return [];
  if (candidates.length === 0) return [];

  if (rule === 'disputed') {
    const candidateDetails = candidates.map(c => currentMethodParties[c.idx]);
    const names = candidateDetails.map(p => p.name).join(', ');
    const label = `Disputed Mandates (${names})`;

    let existingDisputedParty = currentMethodParties.find(p => p.name === label);
    let disputedPartyIdx;

    if (!existingDisputedParty) {
      disputedPartyIdx = currentMethodParties.length; // Index for the new party
      currentMethodParties.push({
        name: label,
        votes: 0, 
        color: '#D1D5DB', // Tailwind gray-300 for disputed
        originalIndex: -1, // Special index
        index: -1 // Special index
      });
    } else {
      disputedPartyIdx = currentMethodParties.indexOf(existingDisputedParty);
    }
    return Array(seatsToAward).fill(disputedPartyIdx);
  }

  let sortedCandidates;
  switch (rule) {
    case 'random':
      sortedCandidates = shuffle([...candidates]);
      break;
    case 'most':
      sortedCandidates = [...candidates].sort((a, b) => {
        if (b.votes !== a.votes) return b.votes - a.votes;
        return a.index - b.index; // Lower original index as secondary tie-breaker
      });
      break;
    case 'least':
      sortedCandidates = [...candidates].sort((a, b) => {
        if (a.votes !== b.votes) return a.votes - b.votes;
        return a.index - b.index; // Lower original index as secondary tie-breaker
      });
      break;
    case 'index':
      sortedCandidates = [...candidates].sort((a, b) => a.index - b.index);
      break;
    default: 
      console.warn("Unknown tie-break rule:", rule, "defaulting to lowest index.");
      sortedCandidates = [...candidates].sort((a, b) => a.index - b.index);
  }
  return sortedCandidates.slice(0, seatsToAward).map(c => c.idx);
}


function quotaMethod(parties, totalSeatsToAllocate, quotaFn, overAllocRule, tieBreakRule) {
  if (parties.length === 0) return [];
  const totalVotes = parties.reduce((sum, p) => sum + p.votes, 0);
  if (totalVotes === 0) return Array(parties.length).fill(0);

  let currentSeats = totalSeatsToAllocate;
  let quota = quotaFn(totalVotes, currentSeats);

  if (quota <= 0 || isNaN(quota) || !isFinite(quota)) {
    console.warn(`Invalid quota calculated (${quota}). Method: ${quotaFn.name}. Total votes: ${totalVotes}, Seats: ${currentSeats}. Returning zero allocation.`);
    return Array(parties.length).fill(0);
  }

  let baseSeats = parties.map(p => Math.floor(p.votes / quota));
  let allocatedSeatsSum = baseSeats.reduce((sum, s) => sum + s, 0);

  // Handle Over-allocation
  if (allocatedSeatsSum > currentSeats) {
    if (overAllocRule === 'increase') {
      currentSeats = allocatedSeatsSum;
    } else if (overAllocRule === 'adjust-quota') {
      let attempts = 0;
      const maxAttempts = 20000; // Increased attempts
      let qOriginal = quota; // Keep original for scaling
      let scaleFactor = 1.0;

      while (allocatedSeatsSum > currentSeats && attempts < maxAttempts) {
        // Increase scaleFactor: more aggressively at first, then finer.
        if (allocatedSeatsSum - currentSeats > parties.length * 0.5) { // If many seats overallocated
             scaleFactor *= 1.01; // Larger step
        } else {
             scaleFactor *= 1.0001; // Smaller step
        }
        quota = qOriginal * scaleFactor;

        if (quota <= 0 || isNaN(quota)) break; 
        baseSeats = parties.map(p => Math.floor(p.votes / quota));
        allocatedSeatsSum = baseSeats.reduce((sum, s) => sum + s, 0);
        attempts++;
      }
      if (allocatedSeatsSum > currentSeats) { // If still overallocated after attempts
        console.warn("Quota adjustment failed to fully resolve over-allocation. Applying 'remove-large' as fallback.");
        overAllocRule = 'remove-large'; // Fallback to removal
      }
    }
    // This 'if' block is for 'remove-large' or 'remove-small', or if 'adjust-quota' failed
    if (overAllocRule === 'remove-large' || overAllocRule === 'remove-small') {
        const partySortOrder = (a, b) => {
            const voteDiff = (overAllocRule === 'remove-large') ? (b.votes - a.votes) : (a.votes - b.votes);
            if (voteDiff !== 0) return voteDiff;
            return a.index - b.index; // Original index for tie-breaking removal
        };
        
        // Need to map to original indices because 'parties' can be modified by 'disputed' rule
        const indexedParties = parties.map((p, i) => ({ ...p, originalMapIdx: i }));

        while (allocatedSeatsSum > currentSeats) {
            let changedInPass = false;
            // Sort parties eligible for removal (those with > 0 base seats)
            const eligibleForRemoval = indexedParties
                .filter(p => baseSeats[p.originalMapIdx] > 0)
                .sort(partySortOrder);

            if (eligibleForRemoval.length === 0) break; // No more seats to remove

            for (const partyToRemoveFrom of eligibleForRemoval) {
                if (baseSeats[partyToRemoveFrom.originalMapIdx] > 0) {
                    baseSeats[partyToRemoveFrom.originalMapIdx]--;
                    allocatedSeatsSum--;
                    changedInPass = true;
                    if (allocatedSeatsSum === currentSeats) break;
                }
            }
            if (allocatedSeatsSum === currentSeats || !changedInPass) break;
        }
    }
  }

  // Distribute Remaining Seats (Largest Remainder)
  let remainingSeats = currentSeats - allocatedSeatsSum;
  if (remainingSeats > 0) {
    const remainders = parties.map((p, i) => ({
      idx: i, // Index in 'parties' and 'baseSeats'
      frac: (p.votes / quota) - (baseSeats[i]), // Remainder based on current baseSeats and quota
      votes: p.votes,
      index: p.index // Original input order index
    }));

    for (let k = 0; k < remainingSeats; k++) {
        // Sort by highest fraction, then highest votes, then lowest original index
        remainders.sort((a, b) => {
            if (b.frac !== a.frac) return b.frac - a.frac;
            if (b.votes !== a.votes) return b.votes - a.votes;
            return a.index - b.index;
        });

        if (remainders.length === 0 || remainders[0].frac < -0.5) break; // No valid remainders left or all used

        const highestFrac = remainders[0].frac;
        const tiedForHighestFrac = remainders.filter(r => Math.abs(r.frac - highestFrac) < 1e-9); // Compare with tolerance
        
        let winnerPartyIdx;
        if (tiedForHighestFrac.length === 1) {
            winnerPartyIdx = tiedForHighestFrac[0].idx;
        } else {
            const selectedWinnerIndices = applyTieBreak(tiedForHighestFrac, 1, tieBreakRule, parties);
            if (selectedWinnerIndices.length > 0) {
                winnerPartyIdx = selectedWinnerIndices[0];
            } else { // Fallback if tie-break fails (shouldn't happen)
                console.warn("Tie-break for largest remainder failed. Assigning to first tied.");
                winnerPartyIdx = tiedForHighestFrac[0].idx;
            }
        }
        
        // Ensure the slot exists and is a number
        if (baseSeats[winnerPartyIdx] === undefined || isNaN(baseSeats[winnerPartyIdx])) {
            baseSeats[winnerPartyIdx] = 0;
        }
        baseSeats[winnerPartyIdx]++;
        
        // Mark this party's remainder as used (or very low) to prevent it from winning again unless necessary
        const winnerInRemaindersList = remainders.find(r => r.idx === winnerPartyIdx);
        if (winnerInRemaindersList) {
            winnerInRemaindersList.frac = -1.0; // Mark as used
        }
    }
  }
  // Ensure baseSeats array has an entry for every party, especially if a 'disputed' party was added
  while (baseSeats.length < parties.length) {
    baseSeats.push(0);
  }
  return baseSeats;
}


function divisorMethod(parties, seatsToAllocate, divisorFn, tieBreakRule) {
  if (parties.length === 0) return [];
  const numParties = parties.length;
  const currentAllocation = Array(numParties).fill(0);
  
  // Create a list of party data that can be dynamically sorted
  let partyQuotients = parties.map((p, i) => ({
    idx: i, // Index in 'parties' and 'currentAllocation'
    votes: p.votes,
    index: p.index, // Original input order index
    currentSeats: 0,
    quotient: p.votes / divisorFn(1) // Initial quotient for the first seat
  })).filter(pq => pq.votes > 0 && isFinite(pq.quotient) && !isNaN(pq.quotient)); // Filter out parties with 0 votes or invalid initial quotient


  for (let s = 0; s < seatsToAllocate; s++) {
    if (partyQuotients.length === 0) break; // No more parties eligible

    // Sort by highest quotient, then highest votes, then lowest original index
    partyQuotients.sort((a, b) => {
      if (b.quotient !== a.quotient) return b.quotient - a.quotient;
      if (b.votes !== a.votes) return b.votes - a.votes;
      return a.index - b.index;
    });
    
    const maxQ = partyQuotients[0].quotient;
    // Candidates for the current seat(s)
    const topCandidates = partyQuotients.filter(pq => Math.abs(pq.quotient - maxQ) < 1e-9); // Compare with tolerance

    let winners; // Array of indices (in 'parties' array) of parties that get a seat this round
    if (topCandidates.length === 1) {
      winners = [topCandidates[0].idx];
    } else { // Tie-break needed
      // applyTieBreak wants list of candidates {idx, votes, index...}, and count of seats (1 for this iteration)
      winners = applyTieBreak(topCandidates, 1, tieBreakRule, parties);
    }

    if (winners.length === 0) { // Should not happen if tie-break is robust
        console.warn("Divisor method tie-break returned no winners. Breaking allocation.");
        break;
    }
    
    // Award seat to the winner(s) - typically one winner per iteration 's' unless tie-break handles multiple.
    // Our applyTieBreak is designed for 'seatsToAward', which is 1 here.
    const winnerIdx = winners[0]; // Index in the original 'parties' array

    // Ensure slot exists (if 'disputed' added a party) and is a number
    if (currentAllocation[winnerIdx] === undefined || isNaN(currentAllocation[winnerIdx])) {
        currentAllocation[winnerIdx] = 0;
    }
    currentAllocation[winnerIdx]++;
    
    // Update the quotient for the party that received a seat
    const partyThatWon = partyQuotients.find(pq => pq.idx === winnerIdx);
    if (partyThatWon) {
        partyThatWon.currentSeats++;
        partyThatWon.quotient = partyThatWon.votes / divisorFn(partyThatWon.currentSeats + 1); // Divisor for the *next* seat
        if (!isFinite(partyThatWon.quotient) || isNaN(partyThatWon.quotient)) { // If quotient becomes invalid (e.g. div by zero)
            // Remove this party from further consideration by setting a very low quotient
            partyThatWon.quotient = -Infinity; 
        }
    }
  }
  // Ensure allocation array has an entry for every party
  while (currentAllocation.length < parties.length) {
    currentAllocation.push(0);
  }
  return currentAllocation;
}