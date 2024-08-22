const { parentPort, workerData } = require('worker_threads');
const { generatePuzzle } = require('../services/boggleService');
const { encodeList } = require('../scripts/util');
const { attempts, letterLists, startIndex, trie } = workerData;

const processChunk = async () => {
  const listScores = {};
  for (let i = 0; i < letterLists.length; i++) {
    const letterList = letterLists[i].split('');
    const puzzleOptions = {
      maxAttempts: attempts,
      dimensions: { width: 4, height: 4 },
      customizations: {
        customLetters: {
          letterList,
          convertQ: true,
          shuffle: true,
        }
      },
      letterDistribution: 'boggle',
      filters: {
        totalWordLimits: { min: 9999 }
      },
      returnBest: true,
    };

    const puzzleResult = await generatePuzzle(puzzleOptions, trie);
    listScores[encodeList(puzzleResult.data.matrix.flat(), { "qu": "q" }).join('')] = puzzleResult.data.wordList.length;
    parentPort.postMessage({ index: startIndex + i, scores: listScores });
  }
};

processChunk();