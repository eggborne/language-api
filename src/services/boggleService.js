const config = require('../config.json');
const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');
const cliProgress = require('cli-progress');
const colors = require('colors');

const {
  cubeSets,
  letterFrequencyMaps,
  letterKeys,
  syllableUnits,
  commonWordListFilePath,
  defaultOptions,
} = config;

const commonPath = path.resolve(__dirname, commonWordListFilePath);
const commonWords = require(commonPath);
const { comparePuzzleData, shuffleArray, decodeList, encodeList, buildDictionary } = require('../scripts/util');

const letterListFromCubeSet = (cubeSet, totalCubes) => {
  let extendedCubeSet = [...cubeSet];
  while (extendedCubeSet.length < totalCubes) {
    extendedCubeSet = [...extendedCubeSet, ...cubeSet];
  }
  const cubeList = extendedCubeSet.slice(0, totalCubes).map(cube => cube[Math.floor(Math.random() * cube.length)]);
  return cubeList;
};

const getLetterList = (letterDistribution, listLength) => {
  if (cubeSets.hasOwnProperty(letterDistribution)) {
    return letterListFromCubeSet(cubeSets[letterDistribution], listLength);
  } else if (letterDistribution === 'syllableUnits') {
    return generateSyllables(listLength);
  } else {
    const frequencyMap = letterFrequencyMaps[letterDistribution];
    const letters = Object.keys(frequencyMap);
    const cumulativeFrequencies = Object.values(frequencyMap);
    function binarySearch(value) {
      let start = 0;
      let end = cumulativeFrequencies.length - 1;
      while (start <= end) {
        const mid = Math.floor((start + end) / 2);
        if (cumulativeFrequencies[mid] === value) {
          return mid;
        } else if (cumulativeFrequencies[mid] < value) {
          start = mid + 1;
        } else {
          end = mid - 1;
        }
      }
      return Math.min(start, cumulativeFrequencies.length - 1);
    }
    const result = [];
    for (let i = 0; i < listLength; i++) {
      const random = Math.random();
      const index = binarySearch(random);
      result.push(letters[index]);
    }
    return result;
  }
};

function generateSyllables(listLength) {
  const { onsets, nuclei, codas } = syllableUnits;
  const weights = { onset: 3, nucleus: 4, coda: 2 };
  const totalWeight = weights.onset + weights.nucleus + weights.coda;
  const syllables = [];
  for (let i = 0; i < listLength; i++) {
    const randomValue = Math.random() * totalWeight;
    if (randomValue < weights.onset) {
      syllables.push(onsets[Math.floor(Math.random() * onsets.length)]);
    } else if (randomValue < weights.onset + weights.nucleus) {
      syllables.push(nuclei[Math.floor(Math.random() * nuclei.length)]);
    } else {
      syllables.push(codas[Math.floor(Math.random() * codas.length)]);
    }
  }
  return syllables;
}

const findAllWords = (matrix, trie) => {
  const maximumPathLength = 20;
  const validWords = new Set();
  const directions = [
    [0, 1], [1, 0], [0, -1], [-1, 0],
    [-1, -1], [1, 1], [-1, 1], [1, -1]
  ];
  const rows = matrix.length;
  const cols = matrix[0].length;
  const visited = new Array(rows);
  for (let i = 0; i < rows; i++) {
    visited[i] = new Array(cols).fill(false);
  }
  const dfs = (x, y, currentWord, currentNode) => {
    if (currentWord.length >= maximumPathLength) return;
    const cellContent = matrix[x][y];
    let newNode = currentNode;
    for (const char of cellContent) {
      newNode = newNode.children.get(char);
      if (!newNode) return;
    }
    const newWord = currentWord + cellContent;
    if (newWord.length >= 3 && newNode.isEndOfWord) {
      validWords.add(newWord);
    }
    visited[x][y] = true;
    for (let [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < rows && ny < cols && !visited[nx][ny]) {
        dfs(nx, ny, newWord, newNode);
      }
    }
    visited[x][y] = false;
  };
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      dfs(i, j, '', trie.root);
    }
  }

  return validWords;
};

const minimumBoggleUnits = (words) => {
  return Object.entries(
    words.flatMap(word => [...new Set(word)])
      .reduce((acc, unit) => {
        acc[unit] = Math.max(acc[unit] || 0, words.reduce((max, word) => {
          const count = word.filter(u => u === unit).length;
          return Math.max(max, count);
        }, 0));
        return acc;
      }, {})
  ).flatMap(([unit, count]) => Array(count).fill(unit));
};

const generateLetterMatrix = (options) => {
  const { dimensions, letterDistribution, customizations } = options;
  const { width, height } = dimensions;
  const totalCells = width * height;
  let letterList;
  let placedWords = [];

  if (customizations) {
    const { customLetters, requiredWords } = customizations;
    if (customLetters) {
      const { letterList: userLetterList, convertQ, shuffle } = customLetters;
      letterList = userLetterList;
      let userKey = letterKeys[letterDistribution] || convertQ ? { 'q': 'qu' } : {};
      const convertedLetterList = decodeList(userLetterList, userKey);
      if (userLetterList.length > convertedLetterList.length) {
        console.error('length no match!!');
        return;
      } else {
        letterList = convertedLetterList;
      }
      if (shuffle) {
        letterList = shuffleArray(letterList);
      }
    } else if (requiredWords) {
      const { wordList, convertQ } = requiredWords;
      let letterCollectionList = wordList.map(wordString => wordString.toLowerCase().split(''));
      if (convertQ) {
        letterCollectionList = letterCollectionList.map(wordArray => {
          const letterCollection = decodeList(wordArray, { 'q': 'qu' });
          return letterCollection;
        });
      }
      const reqWordLetters = minimumBoggleUnits(letterCollectionList);
      const lettersNeeded = totalCells - reqWordLetters.length;
      letterList = [
        ...getLetterList(letterDistribution, lettersNeeded),
        ...shuffleArray(reqWordLetters)
      ];
    }
  } else {
    let letterKey;
    if (letterKeys.hasOwnProperty(letterDistribution)) {
      letterKey = letterKeys[letterDistribution];
    } else {
      letterKey = letterKeys.default;
    }
    letterList = decodeList(getLetterList(letterDistribution, totalCells), letterKey);
  }

  const matrix = Array.from({ length: height }, () => Array(width).fill(null));

  const directions = [
    [0, 1], [1, 0], [0, -1], [-1, 0],
    [-1, -1], [1, 1], [-1, 1], [1, -1]
  ];

  const canPlaceWordDFS = (matrix, word, x, y, index, visited, path) => {
    if (index === word.length) return true;
    if (x < 0 || y < 0 || x >= height || y >= width || matrix[x][y] && matrix[x][y] !== word[index] || visited.has(`${x},${y}`)) return false;
    visited.add(`${x},${y}`);
    path.push([x, y]);
    const shuffledDirections = shuffleArray(directions.slice());
    for (const [dx, dy] of shuffledDirections) {
      if (canPlaceWordDFS(matrix, word, x + dx, y + dy, index + 1, visited, path)) {
        matrix[x][y] = word[index];
        return true;
      }
    }
    visited.delete(`${x},${y}`);
    path.pop();
    return false;
  };

  const placeWordErratically = (matrix, word) => {
    for (let attempts = 0; attempts < 100; attempts++) {
      const x = Math.floor(Math.random() * height);
      const y = Math.floor(Math.random() * width);
      const path = [];
      if (canPlaceWordDFS(matrix, word, x, y, 0, new Set(), path)) {
        path.forEach(([px, py], i) => {
          matrix[px][py] = word[i];
        });
        return true;
      }
    }
    return false;
  };

  if (customizations && customizations.requiredWords) {
    const { wordList, convertQ } = customizations.requiredWords;
    const remainingLetters = [];
    let wordLetterArrayList = wordList.map(wordString => wordString.toLowerCase().split(''));
    if (convertQ) {
      let letterCollectionList = wordList.map(wordString => wordString.toLowerCase().split('')).map(wordArray => {
        const encodedwordLetterList = encodeList(wordArray, { 'qu': 'q' });
        const letterCollection = decodeList(encodedwordLetterList, { 'q': 'qu' });
        return letterCollection;
      });
      wordLetterArrayList = letterCollectionList;
    }

    for (const word of wordLetterArrayList) {
      if (!placeWordErratically(matrix, word)) {
        return;
      } else {
        placedWords.push(word);
      }
    }
    // Collect all remaining null positions
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        if (!matrix[i][j]) {
          remainingLetters.push({ x: i, y: j });
        }
      }
    }
    // Shuffle the remaining letters list
    const shuffledRemainingLetters = shuffleArray(remainingLetters);
    let letterIndex = 0;
    for (const { x, y } of shuffledRemainingLetters) {
      matrix[x][y] = letterList[letterIndex++];
    }
  } else {
    let letterIndex = 0;
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        if (!matrix[i][j]) {
          matrix[i][j] = letterList[letterIndex++];
        }
      }
    }
  }
  return matrix;
};

const getPuzzleMetadata = (wordList) => {
  const result = {
    dateCreated: Date.now(),
    commonWordAmount: 0,
  };
  for (const wordLength in commonWords) {
    const commonForLengthAmount = commonWords[wordLength].filter(word => wordList.has(word)).length;
    result.commonWordAmount += commonForLengthAmount;
  }
  return result;
};

const getWordLengthAmounts = (wordList) => (
  wordList.reduce((counts, word) => {
    const length = word.length;
    counts[length] = (counts[length] || 0) + 1;
    return counts;
  }, {})
);

const getPuzzleValidityData = (wordList, metadata, options) => {
  const validityData = {
    averageWordLength: wordList.reduce((sum, word) => sum + word.length, 0) / wordList.length,
    fullListLength: wordList.length,
    commonWordAmount: metadata.commonWordAmount,
    wordLengthAmounts: getWordLengthAmounts(wordList),
    valid: true,
  };

  if (options.filters) {
    const { uncommonWordLimit, totalWordLimits, averageWordLengthFilter, wordLengthLimits } = options.filters;
    // pecentage of uncommon words
    if (uncommonWordLimit) {
      const { comparison, value } = uncommonWordLimit;
      const commonRatio = metadata.commonWordAmount / wordList.size;
      const percentCommon = commonRatio * 100;
      const tooMany = comparison === 'lessThan' && percentCommon > value;
      const tooFew = comparison === 'moreThan' && percentCommon < value;
      if (tooMany || tooFew) {
        validityData.valid = false;
      }
    }
    // total amount of words
    if (totalWordLimits) {
      const { min, max } = totalWordLimits;
      if ((min && validityData.fullListLength < min) || (max && validityData.fullListLength > max)) {
        validityData.valid = false;
      }
    }
    // average word length
    if (averageWordLengthFilter) {
      const { comparison, value } = averageWordLengthFilter;
      const average = validityData.averageWordLength;
      if (comparison === 'lessThan' && average > value
        || comparison === 'moreThan' && average <= value
      ) {
        validityData.valid = false;
      }
    }
    // amounts of each word length
    if (wordLengthLimits) {
      for (let i = 0; i < wordLengthLimits.length; i++) {
        const { wordLength, comparison, value } = wordLengthLimits[i];
        const wordsOfLength = validityData.wordLengthAmounts[wordLength] || 0;
        if (comparison === 'lessThan' && wordsOfLength > value
          || comparison === 'moreThan' && wordsOfLength <= value
        ) {
          validityData.valid = false;
        }
      }
    }
  }
  return validityData;
};

const resolvePuzzleOptions = (options) => {
  const resolvedOptions = { ...options };
  const { width: userWidth, height: userHeight } = options.dimensions || {};
  const width = userWidth || defaultOptions.dimensions.width;
  const height = userHeight || defaultOptions.dimensions.height;
  resolvedOptions.dimensions = {
    width: userWidth || height,
    height: userHeight || width
  };
  if (options.customizations) {
    if (options.customizations.customLetters) {
      resolvedOptions.customizations.customLetters = {
        ...defaultOptions.customizations.customLetters,
        ...options.customizations.customLetters
      };
      const { letterList } = options.customizations.customLetters;
      const totalNeeded = resolvedOptions.dimensions.width * resolvedOptions.dimensions.height;
      if (letterList.length !== totalNeeded) {
        console.log('wrong length!');
        return;
      }
    }
    if (options.customizations.requiredWords) {
      options.customizations.requiredWords.wordList = options.customizations.requiredWords.wordList.sort((a, b) => b.length - a.length);
    }
  }

  if (options.filters) {
    if (options.filters.totalWordLimits) {
      resolvedOptions.filters.totalWordLimits = {
        ...defaultOptions.filters.totalWordLimits,
        ...options.filters.totalWordLimits
      };
    }
  }

  return {
    ...resolvedOptions,
    letterDistribution: options.letterDistribution || defaultOptions.letterDistribution,
    maxAttempts: options.maxAttempts || defaultOptions.maxAttempts,
  };
};

const solveBoggle = async (letterString, trie) => {
  let width, height;
  let lettersArray = letterString.trim().toLowerCase().split('');
  lettersArray = decodeList(lettersArray);
  const userWidth = parseInt(lettersArray[0]);
  const userHeight = parseInt(lettersArray[1]);

  if (userWidth && userHeight) {
    width = userWidth;
    height = userHeight;
    lettersArray.shift();
    lettersArray.shift();
  } else if (userWidth) {
    width = userWidth;
    height = userWidth;
    lettersArray.shift();
  } else {
    const sqrt = Math.sqrt(lettersArray.length);
    width = Math.floor(sqrt);
    height = Math.floor(sqrt);
  }

  const matrix = [];
  let index = 0;
  for (let i = 0; i < height; i++) {
    const row = [];
    for (let j = 0; j < width; j++) {
      row.push(lettersArray[index]);
      index++;
    }
    matrix.push(row);
  }

  const wordList = findAllWords(matrix, trie);
  return {
    data: {
      wordList: Array.from(wordList)
    },
    message: `Solved ${width}x${height} ${matrix.flat().join('')} - ${wordList.size}`,
  };
};

const generatePuzzle = async (options, trie, progressCallback, loopNumber) => {
  if (!trie) trie = await buildDictionary();
  // console.log('initial options', options);
  options = resolvePuzzleOptions(options);
  // console.log('resolvePuzzleOptions', options);
  const totalAttempts = options.maxAttempts;
  const maxAttempts = options.chunkSize || options.maxAttempts;
  let bestSoFar;
  let result;
  const serverStats = {
    increases: Object.fromEntries(Object.keys(options.filters || {}).map(key => [key, 0])),
    revisions: 0,
    attempts: 0,
  };
  let { attempts, revisions } = serverStats;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      let matrix = generateLetterMatrix(options);
      if (!matrix) {
        if (options.customizations.requiredWords) {
          while (!matrix && (attempts < maxAttempts)) {
            matrix = generateLetterMatrix(options);
            attempts++;
            progressCallback && progressCallback((attempts * loopNumber) / totalAttempts);            
          }
        }
        if (!matrix) {
          result = {
            ...result,
            message: 'Failed to generate a matrix.'
          };
          return result;
        }
      }
      progressCallback && progressCallback((attempts * loopNumber) / (maxAttempts * options.cores));
      
      const findResultsSet = findAllWords(matrix, trie);
      const metadata = getPuzzleMetadata(findResultsSet, matrix);
      const wordListArray = Array.from(findResultsSet);
      const validityData = getPuzzleValidityData(wordListArray, metadata, options);

      const puzzleData = {
        matrix,
        wordList: wordListArray,
        metadata: {
          ...metadata,
          ...validityData,
          attempts,
          inputParams: options,
          revisions,
        },
      };

      result = {
        data: puzzleData,
      };
      if (validityData.valid) {
        result.valid = true;
        break;
      } else {
        result.valid = false;
        if (options.returnBest) {
          const currentPuzzleData = {
            puzzleData,
            validityData,
          };
          if (!bestSoFar) {
            bestSoFar = currentPuzzleData;
          } else {
            const compareResult = comparePuzzleData(bestSoFar, currentPuzzleData, options);
            bestSoFar = compareResult.preferred;
            if (currentPuzzleData === compareResult.preferred) {
              revisions++;
              bestSoFar.puzzleData.metadata.revisions = revisions;
            }
            if (attempts === maxAttempts) {
              result = {
                data: bestSoFar.puzzleData,
              };
            }
          }
        }
      }
    } catch (error) { console.error('Error generating board:', error); }
  }

  const attString = `${attempts} attempt${attempts > 1 ? 's' : ''}`;
  const revString = `${revisions} revision${revisions > 1 ? 's' : ''}`;

  if (result && result.valid) {
    result = {
      ...result,
      message: `Found valid puzzle after ${attString} and ${revString}`,
    };
  } else {
    if (options.returnBest) {
      result = {
        ...result,
        message: `Returning best puzzle after max ${attString} and ${revString}.`,
        returnBest: true,
      };
    } else {
      result = {
        data: null,
        message: `Failed to produce an acceptable puzzle after max ${attString}`,
      };
    }
  }
  return result;
};


const generatePuzzleMultiThreaded = async (options, trie) => {
  const numCores = options.cores || 1;
  const chunkSize = Math.floor(options.maxAttempts / numCores);

  const workers = [];

  for (let i = 0; i < numCores; i++) {
    const worker = new Worker(path.join(__dirname, '../workers/puzzleWorker.js'), {
      workerData: {
        options: {
          ...options,
          chunkSize,
        },
        trie,
        loopNumber: (workers.length + 1)
      }
    });
    workers.push(worker);
    process.stdout.write(`\rCreated worker ${workers.length}...\r`);
  }

  console.log(numCores, 'x', chunkSize, 'workers starting...\n');

  let progressBar = new cliProgress.SingleBar({
    format: 'M-Collection progress |' + colors.cyan('{bar}') + '| {percentage}% || {value}/{total} Lists || ETA: {eta}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });

  progressBar.start(options.maxAttempts, 0);

  let results = await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
    worker.on('message', (message) => {
      if (message.type === 'progress') {
        progressBar.increment();
      } else if (message.type === 'result') {
        resolve(message.data);
      }
    });
    worker.on('error', reject);
    worker.postMessage({ type: 'generate' });
  })));

  progressBar.stop();

  console.log('Workers done. results x', Object.keys(results).length);

  workers.forEach(worker => worker.terminate());

  let highest = 0;
  let winner;
  let result = {};

  try {
    for (const data of results) {
      const currentAmount = data.data.wordList.length;
      if (currentAmount > highest) {
        console.log(currentAmount, 'beats', highest)
        highest = currentAmount;
        winner = data;
      } else {
        // console.log(currentAmount, 'does not beat', highest)
      }
    }

    let message;

    if (options.returnBest || winner.valid) {
      message = `Got puzzle ${winner.data.matrix.flat().join('')} with words: ${winner.data.wordList.length}`
    } else {
      message = `No valid puzzle found. Highest word count was ${highest}`
    }

    result = {
      data: (options.returnBest || winner.valid) ? winner.data : null,
      message,
    };
  } catch (error) {
    result = {
      data: null,
      message: `Didn't get any puzzles in ${options.maxAttempts}. Highest word count was ${highest}. Error: ${error}`
    };
  }

  console.log(result.message);

  return result;
};

module.exports = { generatePuzzle, generatePuzzleMultiThreaded, getLetterList, solveBoggle };