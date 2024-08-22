const { parentPort, workerData } = require('worker_threads');
const { generatePuzzle } = require('../services/boggleService');
const { arrayToSquareMatrix } = require('../scripts/util');
const { getRandomCubes } = require('../scripts/research');

const { start, end, listAverage, trie } = workerData;

const processChunk = async () => {
  const trainingData = [];
  const saveableLetterLists = {};

  for (let i = start; i < end; i++) {
    let letterDistribution = 'boggle';
    const { letterList } = getRandomCubes(letterDistribution);
    const puzzleOptions = {
      maxAttempts: 1,
      dimensions: { width: 4, height: 4 },
      letterDistribution,
      customizations: {
        customLetters: {
          letterList,
          convertQ: true,
          shuffle: false,
        }
      },
    };
    
    const puzzleResult = await generatePuzzle(puzzleOptions, trie);

    trainingData.push({
      matrix: arrayToSquareMatrix(letterList),
      totalWords: puzzleResult.data.wordList.length,
    });

    const newLength = puzzleResult.data.wordList.length;
    if (newLength > listAverage) {
      saveableLetterLists[letterList.join('')] = newLength;
    }

    parentPort.postMessage({ type: 'progress' });
  }

  parentPort.postMessage({
    type: 'result',
    data: {
      trainingData,
      saveableLetterLists,
    }
  });
};

processChunk().catch(error => {
  console.error('Worker error:', error);
  process.exit(1);
});