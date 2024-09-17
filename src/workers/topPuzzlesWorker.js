const { parentPort } = require('worker_threads');
const { generatePuzzle } = require('../services/boggleService');
const { encodeMatrix } = require('../scripts/util');
const { getRandomCubes } = require('../scripts/research');

const processChunk = async (workerData) => {
  const { size, attributes, letterDistribution, maxAttempts, qualityLimits, start, end, attributeData, trie, chunkSize } = workerData;
  const trainingData = [];
  const saveableLetterLists = {};

  // Initialize saveableLetterLists for each attribute
  for (const attribute of attributes) {
    saveableLetterLists[attribute] = {};
  }

  for (let chunkStart = start; chunkStart < end; chunkStart += chunkSize) {
    const chunkEnd = Math.min(chunkStart + chunkSize, end);

    for (let i = chunkStart; i < chunkEnd; i++) {
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
        returnBest: false
      };

      const puzzleResult = await generatePuzzle(puzzleOptions, trie);

      if (!puzzleResult.data) {
        // console.log('\n', i, puzzleResult.message);
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

      parentPort.postMessage({ type: 'progress' });
    }
  }

  return {
    trainingData,
    saveableLetterLists,
  };
};

parentPort.on('message', async (workerData) => {
  try {
    const result = await processChunk(workerData);
    parentPort.postMessage({
      type: 'result',
      data: result
    });
  } catch (error) {
    console.error('Worker error:', error);
    parentPort.postMessage({
      type: 'error',
      data: error.message
    });
  }
});
