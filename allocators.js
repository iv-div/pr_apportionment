// =============================
// File: src/core/allocators.js
// =============================
// Pure arithmetic – NO DOM here
// Re‑exports the five existing PR algorithms and utility helpers .
// LOGIC PORTED FROM mandates.js

/*
  Pure arithmetic module.  NO DOM access allowed.
  Exports:
    – PR_METHODS: enum of method identifiers
    – allocateDistrict(districtCfg, method, opts?): PartySeatsMap
    – aggregateNation(districtCfgArray, methods?): { [method]: PartySeatsMap }

  districtCfg  := {
      seats: Number,                // total seats to assign (>0)
      parties: [
        { partyId: String, votes: Number }, // votes *before* barrier check
        ...
      ],
      barrier: Number|null,         // e.g. 0.05 for 5 %, null ⇒ none
      tieBreak: 'largestVotes' | 'leastVotes' | 'partyIndex' | 'random' | 'disputed',
      // opts can also include overAllocRule for quota methods, defaulting to 'remove-large'
  }

  PartySeatsMap := { [partyId: string]: number }  // may include 'DISPUTED'

  All helpers live inside this file to keep the public surface tiny.
*/

export const PR_METHODS = Object.freeze({
  HARE: 'hare',
  DROOP: 'droop',
  IMPERIALI: 'imperiali',
  DHONDT: 'dhondt',
  SAINT_LAGUE: 'saintelague'
});

const DISPUTED_PARTY_ID = 'DISPUTED'; // Standardized ID for disputed seats

// ---------------------------
// Main public API
// ---------------------------

/**
 * Allocate seats for *one* district using the selected PR method.
 * @param {Object} district  – see JSDoc above
 * @param {string} method    – one of PR_METHODS values (case‑insensitive)
 * @param {Object} [opts]    – override default tieBreak / barrier, mainly for tests.
 *                           Can also include `overAllocRule` for quota methods (internal default: 'remove-large').
 * @returns {Record<string,number>} – map partyId → seats (may include DISPUTED)
 */
export function allocateDistrict (district, method, opts = {}) {
  const cfg = { ...district, ...opts };
  // Make a deep clone of parties to ensure original data isn't mutated by reference
  // and to allow functions to potentially add properties.
  const initialParties = deepClone(cfg.parties);

  // 1. Apply barrier and collect total valid votes
  const totalVotesAllParties = initialParties.reduce((sum, p) => sum + p.votes, 0);
  const barrierThreshold = (cfg.barrier ?? 0) * totalVotesAllParties;

  let eligiblePartiesInternal = initialParties
    .map((p, originalIndex) => ({
      ...p, // Contains partyId, votes
      name: p.partyId, // mandates.js uses 'name', let's map partyId to it
      color: '#000000', // Dummy color, mandates.js might use it
      originalIndex,    // Preserve original order for 'partyIndex' tie-breaking
      // 'idx' will be assigned after filtering if needed, or functions can use array index
    }))
    .filter(p => (totalVotesAllParties === 0 ? true : p.votes >= barrierThreshold));

  // Assign 'idx' based on the current filtered list. Some mandates.js functions expect 'idx'.
  eligiblePartiesInternal.forEach((p, i) => p.idx = i);
  
  // The `parties` array passed to allocation methods can be mutated by `applyTieBreak`
  // (e.g., by adding a 'Disputed' party). So, we use this `eligiblePartiesInternal` directly.

  let seatCountsArray;
  method = method.toLowerCase();

  // Default overAllocRule for quota methods if not specified in opts
  const overAllocRule = opts.overAllocRule || 'remove-large'; // mandates.js default behavior matching

  if ([PR_METHODS.HARE, PR_METHODS.DROOP, PR_METHODS.IMPERIALI].includes(method)) {
    let quotaFn;
    switch (method) {
      case PR_METHODS.HARE: quotaFn = (tv, s) => tv / s; break;
      case PR_METHODS.DROOP: quotaFn = (tv, s) => Math.floor(tv / (s + 1)) + 1; break;
      case PR_METHODS.IMPERIALI: quotaFn = (tv, s) => tv / (s + 2); break;
      default: throw new Error(`Unknown quota method: ${method}`);
    }
    seatCountsArray = quotaMethodInternal(
      eligiblePartiesInternal,
      cfg.seats,
      quotaFn,
      overAllocRule,
      cfg.tieBreak || 'largestVotes' // Default tieBreak
    );
  } else if ([PR_METHODS.DHONDT, PR_METHODS.SAINT_LAGUE].includes(method)) {
    let divisorFn;
    switch (method) {
      case PR_METHODS.DHONDT: divisorFn = allocatedSeats => allocatedSeats + 1; break;
      case PR_METHODS.SAINT_LAGUE: divisorFn = allocatedSeats => (2 * allocatedSeats) + 1; break;
      default: throw new Error(`Unknown divisor method: ${method}`);
    }
    seatCountsArray = divisorMethodInternal(
      eligiblePartiesInternal,
      cfg.seats,
      divisorFn,
      cfg.tieBreak || 'largestVotes' // Default tieBreak
    );
  } else {
    throw new Error(`Unknown method: ${method}`);
  }

  // Convert seatCountsArray back to PartySeatsMap
  // `eligiblePartiesInternal` might have been expanded by applyTieBreak (e.g. for disputed seats)
  const seatsMap = Object.create(null);
  seatCountsArray.forEach((seats, i) => {
    if (seats > 0) {
      const partyInfo = eligiblePartiesInternal[i];
      if (!partyInfo) {
        // This case should ideally not happen if lengths are managed correctly.
        // Could occur if 'disputed' adds a party and seatCountsArray is longer.
        console.warn(`allocateDistrict: No party info for index ${i}, seats ${seats}. This might be a new 'Disputed' party not fully registered in eligiblePartiesInternal.`);
        // If partyInfo is undefined, it implies a party added by applyTieBreak (e.g. Disputed)
        // and `eligiblePartiesInternal` was correctly updated.
        // The logic in applyTieBreak now ensures the party has `partyId: DISPUTED_PARTY_ID`.
        // This branch might be redundant if applyTieBreak correctly sets partyId.
        seatsMap[DISPUTED_PARTY_ID] = (seatsMap[DISPUTED_PARTY_ID] || 0) + seats;

      } else if (partyInfo.partyId === DISPUTED_PARTY_ID || (partyInfo.name && partyInfo.name.startsWith('Disputed Mandates'))) {
         seatsMap[DISPUTED_PARTY_ID] = (seatsMap[DISPUTED_PARTY_ID] || 0) + seats;
      } else {
         seatsMap[partyInfo.partyId] = (seatsMap[partyInfo.partyId] || 0) + seats;
      }
    }
  });
  
  // Ensure all parties from the input (even if they got 0 seats) are in the map if they were eligible
  eligiblePartiesInternal.forEach(p => {
      if (p.partyId !== DISPUTED_PARTY_ID && !(p.name && p.name.startsWith('Disputed Mandates'))) {
          if (!(p.partyId in seatsMap)) {
              seatsMap[p.partyId] = 0;
          }
      }
  });
  // If a disputed party was added and got 0 seats, it won't be in map yet.
  if (eligiblePartiesInternal.some(p => p.partyId === DISPUTED_PARTY_ID) && !(DISPUTED_PARTY_ID in seatsMap)) {
      seatsMap[DISPUTED_PARTY_ID] = 0;
  }


  return seatsMap;
}

/**
 * Aggregate results from many districts into national parliament for the given methods.
 * @param {Array<Object>} districtResultsArray - list of objects, where each object is a result from `allocateDistrict` for ONE district,
 *                                            but structured as { methodName1: PartySeatsMap1, methodName2: PartySeatsMap2, ... }
 *                                            Typically, this would be an array where each element is the output of calling
 *                                            `methods.map(m => ({[m]: allocateDistrict(districtCfg, m, opts)}))` for ONE district,
 *                                            then reducing/merging these into one object per district.
 *                                            OR, more simply, an array of `districtCfg` to be processed.
 *                                            The original `aggregateNation` took `districtResults` which was already structured as:
 *                                            `[ { hare: {PA:1, PB:2}, dHondt: {PA:2, PB:1} }, ... ]` for each district.
 *                                            Let's assume `districtCfgArray` is an array of district configurations.
 * @param {Array<string>} [methodsToRun]   – subset of PR_METHODS to process; default all
 * @returns {Object}                      – { methodName: PartySeatsMap }
 */
export function aggregateNation (districtCfgArray, methodsToRun = Object.values(PR_METHODS)) {
  const nationalResults = Object.create(null);
  methodsToRun.forEach(m => (nationalResults[m] = Object.create(null)));

  districtCfgArray.forEach(districtCfg => {
    methodsToRun.forEach(method => {
      // Allocate for the current district and method
      const districtSeatsMap = allocateDistrict(districtCfg, method, districtCfg.opts || {}); // Pass opts if they are per-district
      
      // Aggregate into national results
      for (const partyId in districtSeatsMap) {
        nationalResults[method][partyId] = (nationalResults[method][partyId] || 0) + districtSeatsMap[partyId];
      }
    });
  });

  return nationalResults;
}


// ---------------------------------------------------------------------------
// Internal helpers - Ported and Adapted from mandates.js
// `parties` array elements are expected to have at least:
// { partyId: string, votes: number, name: string (can be partyId), originalIndex: number, idx: number, color: string (dummy) }
// These functions may MUTATE the `parties` array (e.g. by adding a 'Disputed' party via applyTieBreak).
// They return an array of seat counts, indexed according to the (potentially mutated) `parties` array.
// ---------------------------------------------------------------------------

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

/**
 * @param {Array<Object>} candidates - Array of party objects { idx, votes, originalIndex, ...} eligible for tie-break
 * @param {number} seatsToAward - How many seats to award among candidates
 * @param {string} rule - Tie-break rule ('largestVotes', 'leastVotes', 'partyIndex', 'random', 'disputed')
 * @param {Array<Object>} currentMethodParties - The full list of party objects being processed by the current allocation method.
 *                                              This array MAY BE MUTATED if 'disputed' rule adds a new party.
 * @returns {Array<number>} - Array of indices (from `currentMethodParties`) of parties that won the tie-break.
 */
function applyTieBreakInternal(candidates, seatsToAward, rule, currentMethodParties) {
  if (seatsToAward <= 0) return [];
  if (candidates.length === 0) return [];

  // Ensure candidates have 'idx' relative to currentMethodParties if they don't already
  const processedCandidates = candidates.map(c => {
      // In our setup, 'idx' should already be the index in currentMethodParties
      // If it's missing, this is an issue, but let's proceed assuming it's there.
      // The 'originalIndex' is for 'partyIndex' tie-breaking based on input order.
      // The 'idx' here refers to the index within the `currentMethodParties` array.
      return c;
  });


  if (rule === 'disputed') {
    // `mandates.js` creates a descriptive name. Here, we'll use a standard DISPUTED_PARTY_ID.
    // We need to add this "Disputed" party to `currentMethodParties` if it doesn't exist.
    let disputedPartyEntry = currentMethodParties.find(p => p.partyId === DISPUTED_PARTY_ID);
    let disputedPartyIdx;

    if (!disputedPartyEntry) {
      disputedPartyIdx = currentMethodParties.length;
      currentMethodParties.push({
        partyId: DISPUTED_PARTY_ID,
        name: DISPUTED_PARTY_ID, // For consistency if name is used
        votes: 0,
        color: '#D1D5DB', // Default color for disputed
        originalIndex: -1, // Indicates a synthetic party
        idx: disputedPartyIdx, // Its index in currentMethodParties
        isDisputed: true,
      });
    } else {
      disputedPartyIdx = disputedPartyEntry.idx; // or currentMethodParties.indexOf(disputedPartyEntry);
    }
    // Award all seatsToAward to this single disputed party index
    return Array(seatsToAward).fill(disputedPartyIdx);
  }

  let sortedCandidates;
  switch (rule) {
    case 'random':
      sortedCandidates = shuffle([...processedCandidates]);
      break;
    case 'largestVotes': // 'most' in mandates.js
      sortedCandidates = [...processedCandidates].sort((a, b) => {
        if (b.votes !== a.votes) return b.votes - a.votes;
        // Fallback to originalIndex for consistent ordering if votes are same
        return (a.originalIndex === undefined ? a.idx : a.originalIndex) - (b.originalIndex === undefined ? b.idx : b.originalIndex);
      });
      break;
    case 'leastVotes': // 'least' in mandates.js
      sortedCandidates = [...processedCandidates].sort((a, b) => {
        if (a.votes !== b.votes) return a.votes - b.votes;
        return (a.originalIndex === undefined ? a.idx : a.originalIndex) - (b.originalIndex === undefined ? b.idx : b.originalIndex);
      });
      break;
    case 'partyIndex': // 'index' in mandates.js, refers to original input order
      sortedCandidates = [...processedCandidates].sort((a, b) => {
          // Use originalIndex if available, otherwise current index (idx)
          const idxA = a.originalIndex !== undefined ? a.originalIndex : a.idx;
          const idxB = b.originalIndex !== undefined ? b.originalIndex : b.idx;
          return idxA - idxB;
      });
      break;
    default:
      console.warn("Unknown tie-break rule:", rule, "defaulting to 'partyIndex' (original order).");
      sortedCandidates = [...processedCandidates].sort((a, b) => {
          const idxA = a.originalIndex !== undefined ? a.originalIndex : a.idx;
          const idxB = b.originalIndex !== undefined ? b.originalIndex : b.idx;
          return idxA - idxB;
      });
  }
  // Return the 'idx' (index in currentMethodParties) of the winners
  return sortedCandidates.slice(0, seatsToAward).map(c => c.idx);
}


function quotaMethodInternal(parties, totalSeatsToAllocate, quotaFn, overAllocRule, tieBreakRule) {
  if (!parties || parties.length === 0) return [];
  const totalVotes = parties.reduce((sum, p) => sum + (p.votes || 0), 0);

  if (totalSeatsToAllocate <= 0) {
      const initialAllocation = Array(parties.length).fill(0);
      return initialAllocation;
  }

  if (totalVotes === 0) {
    const initialAllocation = Array(parties.length).fill(0);
    return initialAllocation;
  }

  let currentSeats = totalSeatsToAllocate; // This might change if overAllocRule === 'increase'
  let quota = quotaFn(totalVotes, currentSeats);

  if (quota <= 0 || isNaN(quota) || !isFinite(quota)) {
    // console.warn(`Invalid quota (${quota}) in quota method. TV:${totalVotes}, S:${currentSeats}. Assigning 0 seats.`);
    const initialAllocation = Array(parties.length).fill(0);
    return initialAllocation;
  }

  let baseSeats = parties.map(p => Math.floor((p.votes || 0) / quota));
  let allocatedSeatsSum = baseSeats.reduce((sum, s) => sum + s, 0);

  const ensureBaseSeatsLength = () => {
    while (baseSeats.length < parties.length) { // `parties` array might grow if 'disputed' adds a party
        baseSeats.push(0);
    }
  };
  ensureBaseSeatsLength();


  if (allocatedSeatsSum > currentSeats) {
    if (overAllocRule === 'increase') {
      currentSeats = allocatedSeatsSum; // The total number of seats effectively increases
    } else if (overAllocRule === 'adjust-quota') {
      let attempts = 0;
      const maxAttempts = 20000; // mandates.js has 20000
      let qOriginal = quota;
      let scaleFactor = 1.0;

      while (allocatedSeatsSum > currentSeats && attempts < maxAttempts) {
        // mandates.js uses 1.01 or 1.0001 based on difference
        scaleFactor *= (allocatedSeatsSum - currentSeats > parties.length * 0.1) ? 1.01 : 1.0001;
        quota = qOriginal * scaleFactor;

        if (quota <= 0 || isNaN(quota) || !isFinite(quota)) {
             // console.warn("Adjust quota resulted in invalid new quota. Stopping adjustment.");
             break;
        }
        baseSeats = parties.map(p => Math.floor((p.votes || 0) / quota));
        ensureBaseSeatsLength();
        allocatedSeatsSum = baseSeats.reduce((sum, s) => sum + s, 0);
        attempts++;
      }
      if (allocatedSeatsSum > currentSeats) {
        // console.warn("Quota adjustment failed, fallback to 'remove-large'.");
        overAllocRule = 'remove-large'; // Fallback if adjustment fails
      }
    }
    
    // This block handles 'remove-large' or 'remove-small' (if overAllocRule was or became one of these)
    if (overAllocRule === 'remove-large' || overAllocRule === 'remove-small') {
        const partySortOrder = (a, b) => { // a, b are { obj: party, originalMapIdx: number, currentBaseSeats: number }
            const voteDiff = (overAllocRule === 'remove-large') ? ((b.obj.votes || 0) - (a.obj.votes || 0)) : ((a.obj.votes || 0) - (b.obj.votes || 0));
            if (voteDiff !== 0) return voteDiff;
            // Fallback to originalIndex for consistent ordering
            const idxA = a.obj.originalIndex !== undefined ? a.obj.originalIndex : a.obj.idx;
            const idxB = b.obj.originalIndex !== undefined ? b.obj.originalIndex : b.obj.idx;
            return idxA - idxB;
        };
        
        while (allocatedSeatsSum > currentSeats) {
            let changedInPass = false;
            // `parties` elements now have `idx` as their index in the `parties` array itself.
            const eligibleForRemoval = parties
                .map((p, i) => ({ obj: p, originalMapIdx: i, currentBaseSeats: baseSeats[i] }))
                .filter(pItem => pItem.currentBaseSeats > 0)
                .sort(partySortOrder);

            if (eligibleForRemoval.length === 0) break; 

            for (const partyToRemoveFrom of eligibleForRemoval) {
                if (baseSeats[partyToRemoveFrom.originalMapIdx] > 0) {
                    baseSeats[partyToRemoveFrom.originalMapIdx]--;
                    allocatedSeatsSum--;
                    changedInPass = true;
                    if (allocatedSeatsSum <= currentSeats) break;
                }
            }
            if (allocatedSeatsSum <= currentSeats || !changedInPass) break;
        }
    }
  }
  ensureBaseSeatsLength();

  let remainingSeats = currentSeats - allocatedSeatsSum;
  if (remainingSeats > 0) {
    const remainderDetails = parties.map((p, i) => ({
      idx: i, // Index in the `parties` array
      frac: ((p.votes || 0) / quota) - (baseSeats[i] || 0),
      votes: (p.votes || 0),
      originalIndex: p.originalIndex, // Preserve original index for tie-breaking
      // Add other properties applyTieBreakInternal might expect from `p`
      partyId: p.partyId, name: p.name, color: p.color
    })).filter(r => r.frac > -1e-9); // Filter for positive remainders (within a tolerance)

    const remainderGroups = {};
    remainderDetails.forEach(r => {
      const fracKey = r.frac.toFixed(10); // Group by frac value
      if (!remainderGroups[fracKey]) remainderGroups[fracKey] = [];
      remainderGroups[fracKey].push(r);
    });

    const sortedFracKeys = Object.keys(remainderGroups).sort((a, b) => parseFloat(b) - parseFloat(a));

    for (const fracKey of sortedFracKeys) {
      if (remainingSeats <= 0) break;

      const currentGroup = remainderGroups[fracKey]; // Array of parties (detail objects) with same frac
      
      if (remainingSeats >= currentGroup.length) {
        // Sort within group for determinism, though all get a seat
        currentGroup.sort((a,b) => {
            if (b.votes !== a.votes) return b.votes - a.votes;
            return (a.originalIndex === undefined ? a.idx : a.originalIndex) - (b.originalIndex === undefined ? b.idx : b.originalIndex);
        });
        for (const partyInfo of currentGroup) {
          if (remainingSeats <= 0) break;
          baseSeats[partyInfo.idx]++; // partyInfo.idx is the index in `parties` and thus `baseSeats`
          remainingSeats--;
        }
      } else {
        // Not enough seats for all in this group, use tie-break
        // `applyTieBreakInternal` expects candidate objects to have properties of parties from `currentMethodParties`
        // `currentGroup` elements are suitable here.
        const winnerIndices = applyTieBreakInternal(currentGroup, remainingSeats, tieBreakRule, parties);
        ensureBaseSeatsLength(); // `parties` might have been modified by applyTieBreakInternal

        for (const winnerIdx of winnerIndices) { // winnerIdx is an index into `parties`
            if (baseSeats[winnerIdx] === undefined || isNaN(baseSeats[winnerIdx])) {
                baseSeats[winnerIdx] = 0; // Should already be initialized
            }
            baseSeats[winnerIdx]++;
        }
        remainingSeats = 0;
        break; 
      }
    }
  }
  ensureBaseSeatsLength();
  return baseSeats;
}

function divisorMethodInternal(parties, seatsToAllocate, divisorFn, tieBreakRule) {
  let allocatedThisRun = 0;
  
  if (!parties || parties.length === 0) return [];
  
  let currentAllocation = Array(parties.length).fill(0);
  const ensureAllocationLength = () => {
      while(currentAllocation.length < parties.length) { // `parties` might grow
          currentAllocation.push(0);
      }
  };
  ensureAllocationLength();
  
  if (seatsToAllocate <= 0) {
      return currentAllocation;
  }
  
  // `parties` elements have `idx` (their index in `parties`), `originalIndex`
  let partyQuotients = parties.map((p, i) => ({
    ...p, // Spread all properties of p, including partyId, name, originalIndex, color
    idx: i, // Crucially, idx here is the index in the `parties` array
    currentSeatsInternal: 0, // Seats allocated in this run of divisor method
    quotient: (p.votes || 0) / divisorFn(0) // Initial quotient
  })).filter(pq => pq.votes > 0 && isFinite(pq.quotient) && !isNaN(pq.quotient) && pq.quotient > 0);


  while (allocatedThisRun < seatsToAllocate) {
    if (partyQuotients.length === 0) {
        // console.warn(`Divisor method: No eligible parties left. Allocated: ${allocatedThisRun}, Target: ${seatsToAllocate}`);
        break;
    }

    partyQuotients.sort((a, b) => {
      if (Math.abs(b.quotient - a.quotient) > 1e-9) return b.quotient - a.quotient;
      if (b.votes !== a.votes) return b.votes - a.votes;
      const idxA = a.originalIndex !== undefined ? a.originalIndex : a.idx;
      const idxB = b.originalIndex !== undefined ? b.originalIndex : b.idx;
      return idxA - idxB;
    });
    
    if (partyQuotients[0].quotient <= 1e-9 && allocatedThisRun > 0) { 
        // console.warn(`Divisor method: All remaining quotients are effectively zero. Allocated: ${allocatedThisRun}, Target: ${seatsToAllocate}`);
        break;
    }
    
    const maxQ = partyQuotients[0].quotient;
    const topCandidates = partyQuotients.filter(pq => Math.abs(pq.quotient - maxQ) < 1e-9);
    
    const seatsRemainingToAllocateThisStep = seatsToAllocate - allocatedThisRun;

    if (topCandidates.length <= seatsRemainingToAllocateThisStep) {
      for (const candidate of topCandidates) { // candidate is an object from partyQuotients
        if (allocatedThisRun >= seatsToAllocate) break;

        const winnerPartyListIndex = candidate.idx; // This is the index in the `parties` array
        
        // Ensure currentAllocation is long enough if parties were added
        ensureAllocationLength();
        if (currentAllocation[winnerPartyListIndex] === undefined || isNaN(currentAllocation[winnerPartyListIndex])) {
            currentAllocation[winnerPartyListIndex] = 0;
        }
        currentAllocation[winnerPartyListIndex]++;
        allocatedThisRun++;

        // Update quotient for this party (which is `candidate` itself as it's from `partyQuotients`)
        candidate.currentSeatsInternal++;
        candidate.quotient = candidate.votes / divisorFn(candidate.currentSeatsInternal);
        if (!isFinite(candidate.quotient) || isNaN(candidate.quotient) || candidate.quotient <= 1e-9) {
            // Remove party from further consideration if quotient is no longer valid
            partyQuotients = partyQuotients.filter(pq => pq.idx !== candidate.idx);
        }
      }
    } else {
      // Tie-break needed for `seatsRemainingToAllocateThisStep` among `topCandidates`
      // `topCandidates` elements are suitable for `applyTieBreakInternal`
      const winnerIndices = applyTieBreakInternal(topCandidates, seatsRemainingToAllocateThisStep, tieBreakRule, parties);
      
      ensureAllocationLength(); // `parties` might have been modified

      if (!winnerIndices || winnerIndices.length === 0) {
          // console.warn(`Divisor method: Tie-break returned no winners for ${seatsRemainingToAllocateThisStep} seats. Breaking.`);
          break;
      }
      
      for (const winnerPartyListIndex of winnerIndices) { // winnerPartyListIndex is an index into `parties`
        if (allocatedThisRun >= seatsToAllocate) break;

        if (currentAllocation[winnerPartyListIndex] === undefined || isNaN(currentAllocation[winnerPartyListIndex])) {
            currentAllocation[winnerPartyListIndex] = 0;
        }
        currentAllocation[winnerPartyListIndex]++;
        allocatedThisRun++;

        // Update quotient for the party that won a seat
        const partyInQuotientList = partyQuotients.find(pq => pq.idx === winnerPartyListIndex);
        if (partyInQuotientList) { // Could be a 'Disputed' party not in partyQuotients
            partyInQuotientList.currentSeatsInternal++;
            partyInQuotientList.quotient = partyInQuotientList.votes / divisorFn(partyInQuotientList.currentSeatsInternal);
            if (!isFinite(partyInQuotientList.quotient) || isNaN(partyInQuotientList.quotient) || partyInQuotientList.quotient <= 1e-9) {
                partyQuotients = partyQuotients.filter(pq => pq.idx !== partyInQuotientList.idx);
            }
        }
      }
    }
  }
  ensureAllocationLength();
  return currentAllocation;
}

// ---------------------------
// Utils
// ---------------------------

function deepClone (obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  // Handle Date
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  // Handle Array
  if (Array.isArray(obj)) {
    const clonedArray = [];
    for (let i = 0; i < obj.length; i++) {
      clonedArray[i] = deepClone(obj[i]);
    }
    return clonedArray;
  }
  // Handle Object
  const clonedObject = Object.create(Object.getPrototypeOf(obj));
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clonedObject[key] = deepClone(obj[key]);
    }
  }
  return clonedObject;
}