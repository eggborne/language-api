const { Worker } = require('worker_threads');
const os = require('os');
const cliProgress = require('cli-progress');
const colors = require('colors');
const path = require('path');
const { averageOfValue, buildDictionary, encodeMatrix } = require('./scripts/util');
const { getBestLists, addToBestList, getAboveAverageEntries, getRandomCubes } = require('./scripts/research');
const { generatePuzzleMultiThreaded } = require('./services/boggleService');

let trie;

const workers = [];

const createWorkers = (amount, workerPath) => {
  for (let i = 0; i < amount; i++) {
    const worker = new Worker(workerPath);
    workers.push(worker);
  }
};

const terminateWorkers = () => {
  workers.forEach((worker) => {
    worker.terminate();
    worker.removeAllListeners();
  });
  workers.length = 0; // Clear the array
};


const getTopPuzzles = async (size, repetitions, attributes, cores, letterDistribution, maxAttempts, qualityLimits) => {
  let improvedCycleEntries = 0;
  const workerAmount = cores;
  const chunkSize = Math.min(Math.ceil(repetitions / workerAmount), 50000);
  console.log('Workers:', workerAmount, 'chunkSize:', chunkSize);

  if (!trie) trie = await buildDictionary();

  if (workers.length === 0) {
    createWorkers(workerAmount, path.resolve(__dirname, 'workers/topPuzzlesWorker.js'));
  }

  let progressBar = new cliProgress.SingleBar({
    format: 'Progress |' + colors.cyan('{bar}') + '| {percentage}% || {value}/{total} Puzzles',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });

  let completedTasks = 0;
  let trainingData = [];
  let aboveAverageLetterLists = {};

  // Initialize aboveAverageLetterLists for each attribute
  for (const attribute of attributes) {
    aboveAverageLetterLists[attribute] = {};
  }

  // For each attribute, get currentList and listAverage
  const attributeData = {};
  for (const attribute of attributes) {
    const listFileName = attribute !== 'totalWords' ? `best-${attribute}-${qualityLimits.min}-${qualityLimits.max || 9999}.json` : `best-totalWords.json`;
    let currentList = await getBestLists(size, listFileName);
    let listAverage = currentList ? averageOfValue(currentList, attribute, 5) || 0 : attribute === 'totalWords' ? 50 : 0;
    if (attribute === 'totalWords' && !qualityLimits.max) {
      listAverage = qualityLimits.min;
      console.log('using default average', listAverage);
    }
    if (currentList) {
      let listLength = Object.entries(currentList).length;
      console.log(`Old average ${attribute} for ${listLength} puzzles ---> `, listAverage);
    } else {
      currentList = [];
    }
    attributeData[attribute] = { listFileName, currentList, listAverage };
  }

  const workerRepetitions = Math.ceil(repetitions / workerAmount);

  const workerPromises = workers.map((worker, i) => {
    return new Promise((resolve, reject) => {
      const workerStart = i * workerRepetitions;
      const workerEnd = Math.min(workerStart + workerRepetitions, repetitions);
      worker.postMessage({
        attributes,
        letterDistribution,
        maxAttempts,
        qualityLimits,
        start: workerStart,
        end: workerEnd,
        attributeData,
        size,
        trie,
        chunkSize,
      });

      worker.on('message', ({ type, data }) => {
        if (type === 'progress') {
          completedTasks += 1;
          progressBar.update(completedTasks);
        } else if (type === 'result') {
          // trainingData = trainingData.concat(data.trainingData);
          // Merge aboveAverageLetterLists
          for (const attribute of attributes) {
            Object.assign(aboveAverageLetterLists[attribute], data.saveableLetterLists[attribute]);
          }
          resolve();
        } else if (type === 'error') {
          reject(new Error(data));
        }
      });

      worker.on('error', (error) => {
        console.error(`Worker ${i + 1} error:`, error);
        reject(error);
      });
      process.stdout.write(`\rCreated worker ${i + 1}...\r`);
    });
  });

  if (!progressBar.isActive) {
    progressBar.start(repetitions, 0);
  }

  try {
    await Promise.all(workerPromises);
  } catch (error) {
    console.error('Error in worker execution:', error);
  } finally {
    progressBar.stop();
    terminateWorkers();
  }

  console.log(`Collected data for ${trainingData.length} puzzles.`);

  const approvedEntries = {};
  const topCandidates = {};
  
  for (const attribute of attributes) {
    const { currentList, listFileName, listAverage } = attributeData[attribute];
    const improvedAmount = Object.keys(aboveAverageLetterLists[attribute] || {}).length;

    if (improvedAmount) {
      console.log(colors.yellow(improvedAmount, 'puzzles found over average', attribute, listAverage));
      const override = (attribute === 'totalWords' && !qualityLimits.max) ? qualityLimits.min : undefined;
      const improvedList = getAboveAverageEntries(currentList, aboveAverageLetterLists[attribute], override);
      await addToBestList(size, improvedList, listFileName);
      const approved = Object.keys(improvedList).length;
      approvedEntries[attribute] = approved;
      improvedCycleEntries = approved;
      console.log(colors.green('\nAdded', approved, '/', improvedAmount, 'improved', attribute, 'to', qualityLimits.min, '-', qualityLimits.max));
    } else {
      console.log(colors.red('No initially-above-average new entries found for', attribute));
    }

    // Find top candidate for each attribute
    const topEntry = trainingData.sort((a, b) => b[attribute] - a[attribute])[0];
    if (topEntry) {
      topCandidates[attribute] = {
        [topEntry.matrix.flat().join('')]: {
          [attribute]: topEntry[attribute]
        }
      };
    }
  }

  return { approvedEntries, trainingData, topCandidates, improvedCycleEntries };
};


const getTopPuzzlesMultithreaded = async (size, repetitions, attributes, cores, letterDistribution, maxAttempts, qualityLimits) => {
  
  const attributeData = {};

  const extractSaveableLists = async () => {
    const saveableLetterLists = {};

    // Initialize saveableLetterLists for each attribute
    for (const attribute of attributes) {
      saveableLetterLists[attribute] = {};
    }

    let distribution = letterDistribution || ['boggle', 'bigBoggle', 'superBigBoggle'][size - 4];
    const { letterList } = getRandomCubes(distribution);
    const puzzleOptions = {
      dimensions: { width: size, height: size },
      letterDistribution: distribution,
      customizations: {
        customLetters: {
          letterList,
          convertQ: true,
          shuffle: true,
        }
      },
      filters: {
        totalWordLimits: {
          ...qualityLimits
        }
      },
      maxAttempts,
      returnBest: false,
      cores
    };

    const puzzleResult = await generatePuzzleMultiThreaded(puzzleOptions, trie);

    if (!puzzleResult.data) {
      console.log('\n no puzzle data', puzzleResult.message);
    } else {
      const wordAmount = puzzleResult.data.wordList.length;
      const encodedResultMatrix = encodeMatrix(puzzleResult.data.matrix, { 'q': 'qu' });

      const newItem = {
        matrix: encodedResultMatrix,
        wordAmount
      };
      for (const attribute of attributes) {
        const newAttributeValue = attribute === 'totalWords' ? wordAmount : puzzleResult.data.metadata[attribute];
        newItem[attribute] = newAttributeValue;

        const { listAverage } = attributeData[attribute];

        const itemAboveAverage = newAttributeValue > listAverage;
        const wordAmountWithinLimits = wordAmount >= (qualityLimits.min) && wordAmount < (qualityLimits.max || 9999);

        if (itemAboveAverage && wordAmountWithinLimits) {
          const letterString = encodedResultMatrix.flat().join('');
          saveableLetterLists[attribute][letterString] = newAttributeValue;
        }
      }
      // trainingData.push(newItem);
    }

    return {
      saveableLetterLists,
    };
  };


  let improvedCycleEntries = 0;

  if (!trie) trie = await buildDictionary();

  let aboveAverageLetterLists = {};
  let trainingData = [];

  // Initialize aboveAverageLetterLists for each attribute
  for (const attribute of attributes) {
    aboveAverageLetterLists[attribute] = {};
  }

  // For each attribute, get currentList and listAverage
  for (const attribute of attributes) {
    const listFileName = attribute !== 'totalWords' ? `best-${attribute}-${qualityLimits.min}-${qualityLimits.max || 9999}.json` : `best-totalWords.json`;
    let currentList = await getBestLists(size, listFileName);
    let listAverage = currentList ? averageOfValue(currentList, attribute, 5) || 0 : attribute === 'totalWords' ? 50 : 0;
    if (attribute === 'totalWords' && !qualityLimits.max) {
      listAverage = qualityLimits.min;
      console.log('using default average', listAverage);
    }
    if (currentList) {
      let listLength = Object.entries(currentList).length;
      console.log(`Old average ${attribute} for ${listLength} puzzles ---> `, listAverage);
    } else {
      currentList = [];
    }
    attributeData[attribute] = { listFileName, currentList, listAverage };
  }

  const { saveableLetterLists } = await extractSaveableLists();
  for (const attribute of attributes) {
    Object.assign(aboveAverageLetterLists[attribute], saveableLetterLists[attribute]);
  }

  const approvedEntries = {};
  const topCandidates = {};

  for (const attribute of attributes) {
    const { currentList, listFileName, listAverage } = attributeData[attribute];
    const improvedAmount = Object.keys(aboveAverageLetterLists[attribute] || {}).length;

    if (improvedAmount) {
      console.log(colors.yellow(improvedAmount, 'puzzles found over average', attribute, listAverage));
      const override = (attribute === 'totalWords' && !qualityLimits.max) ? qualityLimits.min : undefined;
      const improvedList = getAboveAverageEntries(currentList, aboveAverageLetterLists[attribute], override);
      await addToBestList(size, improvedList, listFileName);
      const approved = Object.keys(improvedList).length;
      approvedEntries[attribute] = approved;
      improvedCycleEntries = approved;
      console.log(colors.green('\nAdded', approved, '/', improvedAmount, 'improved', attribute, 'to', qualityLimits.min, '-', qualityLimits.max));
    } else {
      console.log(colors.red('No initially-above-average new entries found for', attribute));
    }    
  }

  return { approvedEntries, trainingData, topCandidates, improvedCycleEntries };
};

module.exports = { getTopPuzzles, getTopPuzzlesMultithreaded };