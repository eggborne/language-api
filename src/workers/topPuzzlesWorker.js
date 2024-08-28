const { parentPort, workerData } = require('worker_threads');
const { generatePuzzle } = require('../services/boggleService');
const { arrayToSquareMatrix } = require('../scripts/util');
const { getRandomCubes } = require('../scripts/research');


const processChunk = async () => {
  const { attribute, qualityLimits, start, end, listAverage, trie, chunkSize } = workerData;
  const trainingData = [];
  const saveableLetterLists = {};

  for (let chunkStart = start; chunkStart < end; chunkStart += chunkSize) {
    const chunkEnd = Math.min(chunkStart + chunkSize, end);

    for (let i = chunkStart; i < chunkEnd; i++) {
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
      const listKey = attribute.replace(/percentUncommon/g, 'percentCommon')
      const newAttributeValue = attribute === 'totalWords' ?
        puzzleResult.data.wordList.length
        : attribute === 'percentUncommon' ?
          (100 - puzzleResult.data.metadata[attribute])
          : puzzleResult.data.metadata[attribute];

      const newItem = {
        matrix: arrayToSquareMatrix(letterList),
        [listKey]: newAttributeValue,
      };
      trainingData.push(newItem);

      const qualifies = attribute === 'percentUncommon' ?
        ((newAttributeValue > listAverage)
          && puzzleResult.data.wordList.length >= (qualityLimits.min || 50)
          && puzzleResult.data.wordList.length < (qualityLimits.max || 9999))
        :
        (newAttributeValue > listAverage);

      if (qualifies) {
        saveableLetterLists[letterList.join('')] = newAttributeValue;
      }

      parentPort.postMessage({ type: 'progress' });
    }
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