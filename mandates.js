// mandates.js

/**
 * Entry point triggered by the "Generate" button/form submission.
 */
function generateAll() {
  console.log("Generate button/form submit triggered");
  const resultsContainer = document.getElementById('results');
  resultsContainer.innerHTML = '<p class="text-center text-lg text-slate-600 py-8 animate-pulse">Generating diagrams...</p>'; // Added animate-pulse

  // Use a try-catch block to catch unexpected errors during data gathering or initial processing
  try {
    const totalSeatsInput = document.getElementById('total-seats');
    const totalSeats = parseInt(totalSeatsInput.value);
    if (!(totalSeats >= 1 && totalSeats <= 3000)) {
      alert('Total seats must be between 1 and 3000.');
      totalSeatsInput.focus();
      resultsContainer.innerHTML = '<p class="text-center text-red-600 py-4">Error: Invalid total seats.</p>';
      return;
    }

    const barrierInput = document.getElementById('barrier');
    const barrier = parseFloat(barrierInput.value) || 0;
    if (barrier < 0 || barrier > 100) {
      alert('Barrier must be between 0 and 100.');
      barrierInput.focus();
      resultsContainer.innerHTML = '<p class="text-center text-red-600 py-4">Error: Invalid barrier %.</p>';
      return;
    }

    const tieBreakRule = document.getElementById('tie-break').value;
    const overAllocRule = document.getElementById('over-alloc').value;

    const partyRows = document.querySelectorAll('#party-list .party-row');
    let partiesDataFromForm = []; 

    partyRows.forEach((row, i) => {
      const nameInput = row.querySelector('.party-name');
      const votesInput = row.querySelector('.party-votes');
      const colorInput = row.querySelector('.party-color');
      
      const name = nameInput.value.trim() || `P${i + 1}`;
      const votesString = votesInput.value.trim();
      const votes = votesString === '' ? 0 : parseInt(votesString); // Treat empty string as 0 votes for barrier calc
      const color = colorInput.value;

      // Add if name is present, or if votes are explicitly entered (even if 0 for now)
      if (nameInput.value.trim() || votesString !== '') {
          partiesDataFromForm.push({ name, votes: isNaN(votes) ? 0 : Math.max(0, votes), color, originalIndex: i });
      }
    });
    
    if (partiesDataFromForm.length === 0){
        alert("Please add at least one party.");
        resultsContainer.innerHTML = '<p class="text-center text-red-600 py-4">Error: No parties added.</p>';
        return;
    }
    
    const partiesWithPositiveVotes = partiesDataFromForm.filter(p => p.votes > 0);
    if (partiesWithPositiveVotes.length === 0) {
      alert("Please enter positive votes for at least one party if you want seats to be allocated.");
      // Allow to proceed if user intentionally wants to see 0 allocation with barrier.
    }

    const totalVotesAllParties = partiesDataFromForm.reduce((sum, p) => sum + p.votes, 0);
    const barrierVotes = totalVotesAllParties * barrier / 100;
    
    const partiesForCalculation = partiesDataFromForm
      .filter(p => p.votes >= barrierVotes)
      .map(p => ({ ...p, index: p.originalIndex }));


    if (partiesForCalculation.length === 0 && totalVotesAllParties > 0 && barrier > 0) {
      alert("No parties passed the electoral barrier.");
      resultsContainer.innerHTML = '<p class="text-center text-orange-600 py-4">Warning: No parties passed the electoral barrier.</p>';
      // Optionally still generate diagrams showing 0 seats for all
    }
    if (partiesForCalculation.length === 0 && totalVotesAllParties === 0 && partiesDataFromForm.length > 0) {
        resultsContainer.innerHTML = '<p class="text-center text-orange-600 py-4">No votes to distribute. All parties have 0 votes or did not pass the barrier.</p>';
        // Generate empty diagrams or just stop
        // For now, let's try to generate empty diagrams
    }


    const imageElementsContainer = document.createElement('div');
    imageElementsContainer.className = 'space-y-8'; 

    const allocationMethods = [
      { name: "Hare Quota", type: "quota", quotaFn: (tv, s) => tv / s },
      { name: "Droop Quota", type: "quota", quotaFn: (tv, s) => Math.floor(tv / (s + 1)) + 1 },
      { name: "Imperiali Quota", type: "quota", quotaFn: (tv, s) => tv / (s + 2) },
      { name: "D'Hondt", type: "divisor", divisorFn: allocatedSeats => allocatedSeats + 1 },           // ✅ ПРАВИЛЬНО
      { name: "Sainte-Laguë", type: "divisor", divisorFn: allocatedSeats => (2 * allocatedSeats) + 1 } // ✅ ПРАВИЛЬНО

    ];

    let processedCount = 0;
    let anyErrorOccurred = false;

    if (allocationMethods.length === 0) { // Should not happen
        resultsContainer.innerHTML = '';
        return;
    }

    allocationMethods.forEach(method => {
      // IMPORTANT: Clone parties for EACH method to prevent modifications (like adding 'Disputed') from affecting others.
      const clonedPartiesForMethod = JSON.parse(JSON.stringify(partiesForCalculation)); 
      
      let seatCounts;
      try {
        if (method.type === "quota") {
          console.log(`Calling ${method.name} with totalSeats: ${totalSeats}`);
          seatCounts = quotaMethod(clonedPartiesForMethod, totalSeats, method.quotaFn, overAllocRule, tieBreakRule);
        } else {
          console.log(`Calling ${method.name} with totalSeats: ${totalSeats}`);
          seatCounts = divisorMethod(clonedPartiesForMethod, totalSeats, method.divisorFn, tieBreakRule);
          if (seatCounts && Array.isArray(seatCounts)) {
            console.log(`${method.name} calculated seatCounts:`, seatCounts, `Sum:`, seatCounts.reduce((a, b) => (a || 0) + (b || 0), 0));
          } else {
            console.log(`${method.name} calculated seatCounts:`, seatCounts, `(Sum not calculable or seatCounts is not an array)`);
          }
        }
      } catch (calcError) {
          console.error(`Error calculating seats for ${method.name}:`, calcError);
          const errorWrapper = document.createElement('div');
          errorWrapper.className = 'bg-white rounded-lg shadow-md p-4 flex flex-col items-center text-red-600';
          errorWrapper.innerHTML = `<h3 class="text-xl font-semibold mb-2">${method.name}</h3><p>Error during seat calculation: ${calcError.message}</p>`;
          imageElementsContainer.appendChild(errorWrapper);
          processedCount++;
          anyErrorOccurred = true;
          if (processedCount === allocationMethods.length) {
              resultsContainer.innerHTML = ''; 
              resultsContainer.appendChild(imageElementsContainer); 
          }
          return; // Skip SVG generation for this method if calculation failed
      }

      // Names and colors should come from clonedPartiesForMethod as it might have been modified (e.g., Disputed party added)
      const partyNames = clonedPartiesForMethod.map(p => p.name);
      const partyColors = clonedPartiesForMethod.map(p => p.color);
      
      const svgString = buildSVG(method.name, seatCounts, partyNames, partyColors);

      svgToImage(svgString, (dataUrl, error) => {
        if (error) {
          console.error(`Failed to generate image for ${method.name}:`, error);
          const errorWrapper = document.createElement('div');
          errorWrapper.className = 'bg-white rounded-lg shadow-md p-4 flex flex-col items-center text-red-600';
          errorWrapper.innerHTML = `<h3 class="text-xl font-semibold mb-2">${method.name}</h3><p>Error generating diagram image: ${error}</p>`;
          imageElementsContainer.appendChild(errorWrapper);
          anyErrorOccurred = true;
        } else if (dataUrl) {
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
          if (imageElementsContainer.children.length > 0 || anyErrorOccurred) {
              resultsContainer.appendChild(imageElementsContainer);
          } else if (!anyErrorOccurred) { // All processed, no errors, but no images (e.g. 0 seats for all)
              resultsContainer.innerHTML = '<p class="text-center text-slate-600 py-4">Diagrams generated. No seats to display or no parties passed criteria.</p>';
          }
        }
      });
    });
  } catch (e) {
    console.error("Critical error in generateAll:", e);
    resultsContainer.innerHTML = `<p class="text-center text-red-600 py-4">A critical error occurred: ${e.message}. Check console for details.</p>`;
  }
}

document.getElementById('inputForm').addEventListener('submit', function(event) {
  event.preventDefault(); 
  generateAll();
});


// --- Core Allocation Logic (refined for robustness and clarity) ---
// ... (applyTieBreak, quotaMethod, divisorMethod - keep the robust versions from previous response) ...
// ... (Make sure shuffle is also present) ...
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

  // Ensure candidates have 'idx' relative to currentMethodParties if they don't already
  // This is important if candidates come directly from sorting quotients etc.
  const processedCandidates = candidates.map(c => {
      if (typeof c.idx !== 'number') { // If idx is missing, try to find it based on originalIndex or name
          const originalParty = currentMethodParties.find(p => p.originalIndex === c.originalIndex || p.name === c.name);
          return originalParty ? { ...c, idx: currentMethodParties.indexOf(originalParty) } : c;
      }
      return c;
  }).filter(c => typeof c.idx === 'number'); // Filter out those that couldn't be mapped


  if (rule === 'disputed') {
    const candidateDetails = processedCandidates.map(c => currentMethodParties[c.idx]);
    const names = candidateDetails.map(p => p.name).join(', ');
    const label = `Disputed Mandates (${names})`;

    let existingDisputedParty = currentMethodParties.find(p => p.name === label);
    let disputedPartyIdx;

    if (!existingDisputedParty) {
      disputedPartyIdx = currentMethodParties.length; 
      currentMethodParties.push({
        name: label,
        votes: 0, 
        color: '#D1D5DB', // Tailwind gray-300 for disputed
        originalIndex: -1 - currentMethodParties.filter(p => p.originalIndex < 0).length, // Unique negative index
        index: -1 - currentMethodParties.filter(p => p.index < 0).length // Unique negative index
      });
      // IMPORTANT: If a new party is added, seat allocation arrays (like baseSeats) in calling functions
      // might need to be expanded or handled carefully.
    } else {
      disputedPartyIdx = currentMethodParties.indexOf(existingDisputedParty);
    }
    return Array(seatsToAward).fill(disputedPartyIdx);
  }

  let sortedCandidates;
  switch (rule) {
    case 'random':
      sortedCandidates = shuffle([...processedCandidates]);
      break;
    case 'most':
      sortedCandidates = [...processedCandidates].sort((a, b) => {
        if (b.votes !== a.votes) return b.votes - a.votes;
        return a.index - b.index; 
      });
      break;
    case 'least':
      sortedCandidates = [...processedCandidates].sort((a, b) => {
        if (a.votes !== b.votes) return a.votes - b.votes;
        return a.index - b.index; 
      });
      break;
    case 'index': // This refers to 'originalIndex' if it's from form, or 'index' if already processed
      sortedCandidates = [...processedCandidates].sort((a, b) => a.index - b.index);
      break;
    default: 
      console.warn("Unknown tie-break rule:", rule, "defaulting to lowest index.");
      sortedCandidates = [...processedCandidates].sort((a, b) => a.index - b.index);
  }
  return sortedCandidates.slice(0, seatsToAward).map(c => c.idx);
}


function quotaMethod(parties, totalSeatsToAllocate, quotaFn, overAllocRule, tieBreakRule) {
  if (!parties || parties.length === 0) return []; // Handle empty parties array
  const totalVotes = parties.reduce((sum, p) => sum + (p.votes || 0), 0);
  
  if (totalSeatsToAllocate <= 0) { // If 0 seats to allocate, all parties get 0
      const initialAllocation = Array(parties.length).fill(0);
      // Ensure allocation array length matches parties array length, especially if 'disputed' adds parties
      while (initialAllocation.length < parties.length) {
        initialAllocation.push(0);
      }
      return initialAllocation;
  }

  if (totalVotes === 0) { // If no votes, all parties get 0
    const initialAllocation = Array(parties.length).fill(0);
    while (initialAllocation.length < parties.length) {
      initialAllocation.push(0);
    }
    return initialAllocation;
  }

  let currentSeats = totalSeatsToAllocate;
  let quota = quotaFn(totalVotes, currentSeats);

  if (quota <= 0 || isNaN(quota) || !isFinite(quota)) {
    console.warn(`Invalid quota (${quota}) in ${quotaFn.name}. TV:${totalVotes}, S:${currentSeats}. Assigning 0 seats.`);
    const initialAllocation = Array(parties.length).fill(0);
    while (initialAllocation.length < parties.length) {
      initialAllocation.push(0);
    }
    return initialAllocation;
  }

  let baseSeats = parties.map(p => Math.floor((p.votes || 0) / quota));
  let allocatedSeatsSum = baseSeats.reduce((sum, s) => sum + s, 0);

  // Ensure baseSeats has an entry for every party that might be added (e.g., by 'disputed')
  const ensureBaseSeatsLength = () => {
    while (baseSeats.length < parties.length) {
        baseSeats.push(0);
    }
  };
  ensureBaseSeatsLength();


  if (allocatedSeatsSum > currentSeats) {
    if (overAllocRule === 'increase') {
      currentSeats = allocatedSeatsSum;
    } else if (overAllocRule === 'adjust-quota') {
      let attempts = 0;
      const maxAttempts = 20000;
      let qOriginal = quota;
      let scaleFactor = 1.0;

      while (allocatedSeatsSum > currentSeats && attempts < maxAttempts) {
        scaleFactor *= (allocatedSeatsSum - currentSeats > parties.length * 0.1) ? 1.01 : 1.0001;
        quota = qOriginal * scaleFactor;

        if (quota <= 0 || isNaN(quota) || !isFinite(quota)) {
             console.warn("Adjust quota resulted in invalid new quota. Stopping adjustment.");
             break;
        }
        baseSeats = parties.map(p => Math.floor((p.votes || 0) / quota));
        ensureBaseSeatsLength();
        allocatedSeatsSum = baseSeats.reduce((sum, s) => sum + s, 0);
        attempts++;
      }
      if (allocatedSeatsSum > currentSeats) {
        console.warn("Quota adjustment failed, fallback to 'remove-large'.");
        overAllocRule = 'remove-large'; 
      }
    }
    
    if (overAllocRule === 'remove-large' || overAllocRule === 'remove-small') {
        const partySortOrder = (a, b) => {
            const voteDiff = (overAllocRule === 'remove-large') ? ((b.obj.votes || 0) - (a.obj.votes || 0)) : ((a.obj.votes || 0) - (b.obj.votes || 0));
            if (voteDiff !== 0) return voteDiff;
            return (a.obj.index || 0) - (b.obj.index || 0);
        };
        
        while (allocatedSeatsSum > currentSeats) {
            let changedInPass = false;
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
  ensureBaseSeatsLength(); // Re-ensure after potential modifications

// mandates.js -> quotaMethod -> часть для распределения remainingSeats

  let remainingSeats = currentSeats - allocatedSeatsSum;
  if (remainingSeats > 0) {
    const remainderDetails = parties.map((p, i) => ({
      idx: i, 
      frac: ((p.votes || 0) / quota) - (baseSeats[i] || 0), 
      votes: (p.votes || 0),
      originalIndex: (p.index === undefined ? i : p.index) // Используем originalIndex из parties
    })).filter(r => r.frac > -1e-9); // Только положительные остатки

    // Группируем партии по уникальным значениям остатков
    const remainderGroups = {};
    remainderDetails.forEach(r => {
      const fracKey = r.frac.toFixed(10); // Ключ для группировки (округляем для стабильности)
      if (!remainderGroups[fracKey]) {
        remainderGroups[fracKey] = [];
      }
      remainderGroups[fracKey].push(r);
    });

    // Сортируем группы остатков по убыванию
    const sortedFracKeys = Object.keys(remainderGroups).sort((a, b) => parseFloat(b) - parseFloat(a));

    for (const fracKey of sortedFracKeys) {
      if (remainingSeats <= 0) break;

      const currentGroup = remainderGroups[fracKey]; // Массив партий с одинаковым остатком
      const quantity_ufp = currentGroup.length;

      if (remainingSeats >= quantity_ufp) {
        // Мест достаточно для всех в этой группе
        console.log(`Quota Remainder: Allocating ${quantity_ufp} seats to parties with frac ${fracKey}`);
        // Сортируем внутри группы по вторичным правилам (голоса, потом индекс) на случай, если это важно,
        // хотя ТЗ не уточняет, но это хорошая практика для детерминизма.
        currentGroup.sort((a,b) => {
            if (b.votes !== a.votes) return b.votes - a.votes;
            return a.originalIndex - b.originalIndex;
        });
        for (const partyInfo of currentGroup) {
          if (remainingSeats <= 0) break; // На всякий случай
          baseSeats[partyInfo.idx]++;
          remainingSeats--;
        }
      } else {
        // Мест НЕ достаточно для всех в этой группе, нужен тай-брейк
        console.log(`Quota Remainder: Tie-break for ${quantity_ufp} parties for ${remainingSeats} seats with frac ${fracKey}. Rule: ${tieBreakRule}`);
        // `applyTieBreak` ожидает кандидатов в формате {idx, votes, index (originalIndex)}
        // `currentGroup` уже в этом формате (нужно только убедиться, что `index` это originalIndex)
        const winnerIndices = applyTieBreak(currentGroup, remainingSeats, tieBreakRule, parties);
        ensureBaseSeatsLength(); // `parties` могли быть изменены

        for (const winnerIdx of winnerIndices) {
            if (baseSeats[winnerIdx] === undefined || isNaN(baseSeats[winnerIdx])) {
                baseSeats[winnerIdx] = 0;
            }
            baseSeats[winnerIdx]++;
        }
        remainingSeats = 0; // Все оставшиеся места были распределены через тай-брейк
        break; // Выходим из цикла по группам остатков
      }
    }
  }
  ensureBaseSeatsLength();
  return baseSeats;
}

// mandates.js -> divisorMethod
function divisorMethod(parties, seatsToAllocate, divisorFn, tieBreakRule) {
  console.log(`DivisorMethod START - Target seats: ${seatsToAllocate}, Parties count: ${parties.length}, DivisorFn: ${divisorFn.toString().substring(0,30)}...`);
  let allocatedThisRun = 0;
  
  if (!parties || parties.length === 0) return [];
  const numParties = parties.length;
  let currentAllocation = Array(numParties).fill(0);

  const ensureAllocationLength = () => {
      while(currentAllocation.length < parties.length) {
          currentAllocation.push(0);
      }
  };
  ensureAllocationLength();
  
  if (seatsToAllocate <= 0) {
      return currentAllocation;
  }
  
  let partyQuotients = parties.map((p, i) => ({
    idx: i, 
    votes: (p.votes || 0),
    index: (p.index === undefined ? i : p.index),
    currentSeatsInternal: 0,
    quotient: (p.votes || 0) / divisorFn(0) 
  })).filter(pq => pq.votes > 0 && isFinite(pq.quotient) && !isNaN(pq.quotient) && pq.quotient > 0);


  // Цикл продолжается, пока не распределены все seatsToAllocate ИЛИ пока есть кому распределять
  while (allocatedThisRun < seatsToAllocate) {
    if (partyQuotients.length === 0) {
        console.warn(`Divisor method: No eligible parties left. Allocated: ${allocatedThisRun}, Target: ${seatsToAllocate}`);
        break;
    }

    partyQuotients.sort((a, b) => {
      if (Math.abs(b.quotient - a.quotient) > 1e-9) return b.quotient - a.quotient;
      if (b.votes !== a.votes) return b.votes - a.votes; // Вторичная сортировка по голосам (если частные равны)
      return a.index - b.index; // Третичная по индексу
    });
    
    // Проверка, если все оставшиеся частные <= 0 (кроме, возможно, первой итерации)
    if (partyQuotients[0].quotient <= 1e-9 && allocatedThisRun > 0) { 
        console.warn(`Divisor method: All remaining quotients are effectively zero or negative. Allocated: ${allocatedThisRun}, Target: ${seatsToAllocate}`);
        break;
    }
    
    const maxQ = partyQuotients[0].quotient;
    // Все кандидаты с максимальным (или очень близким к максимальному) частным
    const topCandidates = partyQuotients.filter(pq => Math.abs(pq.quotient - maxQ) < 1e-9);
    
    const seatsRemainingToAllocateThisStep = seatsToAllocate - allocatedThisRun;

    if (topCandidates.length <= seatsRemainingToAllocateThisStep) {
      // Если количество партий с наивысшим частным МЕНЬШЕ или РАВНО количеству оставшихся мест,
      // отдаем каждой из этих партий по одному месту.
      console.log(`Allocating ${topCandidates.length} seats to ${topCandidates.length} parties directly (enough remaining seats).`);
      for (const candidate of topCandidates) {
        if (allocatedThisRun >= seatsToAllocate) break; // Дополнительная проверка

        const winnerIdx = candidate.idx;
        if (currentAllocation[winnerIdx] === undefined || isNaN(currentAllocation[winnerIdx])) {
            currentAllocation[winnerIdx] = 0;
        }
        currentAllocation[winnerIdx]++;
        allocatedThisRun++;

        // Обновляем частное для этой партии
        const partyInQuotientList = partyQuotients.find(pq => pq.idx === winnerIdx);
        if (partyInQuotientList) {
            partyInQuotientList.currentSeatsInternal++;
            partyInQuotientList.quotient = partyInQuotientList.votes / divisorFn(partyInQuotientList.currentSeatsInternal);
            if (!isFinite(partyInQuotientList.quotient) || isNaN(partyInQuotientList.quotient) || partyInQuotientList.quotient <= 1e-9) {
                partyQuotients = partyQuotients.filter(pq => pq.idx !== partyInQuotientList.idx);
            }
        }
      }
    } else {
      // Если количество партий с наивысшим частным БОЛЬШЕ, чем оставшихся мест,
      // то применяем правило тай-брейка для распределения ОСТАВШИХСЯ МЕСТ.
      console.log(`Tie detected: ${topCandidates.length} parties for ${seatsRemainingToAllocateThisStep} remaining seats. Applying tie-break rule: ${tieBreakRule}`);
      const winnersIndices = applyTieBreak(topCandidates, seatsRemainingToAllocateThisStep, tieBreakRule, parties);
      ensureAllocationLength(); // `parties` могли быть изменены

      if (!winnersIndices || winnersIndices.length === 0) {
          console.warn(`Divisor method: Tie-break returned no winners for ${seatsRemainingToAllocateThisStep} seats. Breaking allocation.`);
          break;
      }
      
      // Распределяем места согласно результатам тай-брейка
      for (const winnerIdx of winnersIndices) {
        if (allocatedThisRun >= seatsToAllocate) break;

        if (currentAllocation[winnerIdx] === undefined || isNaN(currentAllocation[winnerIdx])) {
            currentAllocation[winnerIdx] = 0;
        }
        currentAllocation[winnerIdx]++;
        allocatedThisRun++;

        // Обновляем частное для партии, получившей место (если это не "спорная" партия)
        const partyInQuotientList = partyQuotients.find(pq => pq.idx === winnerIdx);
        if (partyInQuotientList) {
            partyInQuotientList.currentSeatsInternal++;
            partyInQuotientList.quotient = partyInQuotientList.votes / divisorFn(partyInQuotientList.currentSeatsInternal);
            if (!isFinite(partyInQuotientList.quotient) || isNaN(partyInQuotientList.quotient) || partyInQuotientList.quotient <= 1e-9) {
                partyQuotients = partyQuotients.filter(pq => pq.idx !== partyInQuotientList.idx);
            }
        }
      }
      // После разрешения тай-брейка для ОСТАВШИХСЯ мест, цикл должен завершиться,
      // так как allocatedThisRun должно стать равным seatsToAllocate.
      // Поэтому `break;` здесь неявно предполагается основным условием `while`.
    }
  } // Конец while (allocatedThisRun < seatsToAllocate)

  ensureAllocationLength();
  console.log(`DivisorMethod END - Target: ${seatsToAllocate}, Actually allocated: ${allocatedThisRun}, Result:`, currentAllocation, `Parties after:`, JSON.parse(JSON.stringify(parties)));
  return currentAllocation;
}