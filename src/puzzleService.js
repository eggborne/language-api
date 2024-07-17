const { Trie } = require('./scripts/trie');
const config = require('./config.json');
const commonWords = require(config.commonWordListFilePath);
const path = require('path');
const fs = require('fs');
const { comparePuzzleData, runTests } = require('./scripts/util');

const decodeMatrix = (matrix, key) => {
  const convertedMatrix = matrix.map(row =>
    row.map(cell => {
      return Object.prototype.hasOwnProperty.call(key, cell) ? key[cell] : cell;
    })
  );
  return convertedMatrix;
};

const encodeMatrix = (matrix, key) => {
  if (!key) return matrix;
  console.log('encoding matrix', matrix);
  console.log('emcoding with', key);
  const reversedKey = Object.fromEntries(
    Object.entries(key).map(([k, v]) => [v, k])
  );

  const unconvertedMatrix = matrix.map(row =>
    row.map(cell => {
      cell = cell.toLowerCase();
      return Object.prototype.hasOwnProperty.call(reversedKey, cell) ? reversedKey[cell] : cell;
    })
  );
  return unconvertedMatrix;
};

const letterListFromCubeSet = (cubeSet, totalCubes) => {
  let extendedCubeSet = [...cubeSet];
  while (extendedCubeSet.length < totalCubes) {
    extendedCubeSet = [...extendedCubeSet, ...cubeSet];
  }
  const cubeList = extendedCubeSet.slice(0, totalCubes).map(cube => cube[Math.floor(Math.random() * cube.length)]);
  return cubeList;
};

const getLetterList = (letterDistribution, listLength) => {
  if (config.cubeSets.hasOwnProperty(letterDistribution)) {
    return letterListFromCubeSet(config.cubeSets[letterDistribution], listLength);
  } else if (letterDistribution === 'syllableUnits') {
    return generateSyllables(listLength);
  } else {
    const frequencyMap = config.letterFrequencyMaps[letterDistribution];
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
  const { onsets, nuclei, codas } = config.syllableUnits;
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

let trie;

const initializeTrie = (wordList) => {
  const trie = new Trie();
  wordList.forEach(word => word.length > 2 && trie.insert(word));
  return trie;
};

const buildDictionary = async () => {
  console.warn('------ FETCHING WORDS AND BUILDING TRIE');
  const startList = Date.now();
  const fullWordList = await JSON.parse(fs.readFileSync(path.join(__dirname, config.fullWordListFilePath), 'utf8'));
  console.warn(`--> Got ${fullWordList.length} words from full list in ${Date.now() - startList}ms`);
  const startTrie = Date.now();
  trie = initializeTrie(fullWordList);
  console.warn(`--> Built trie in ${Date.now() - startTrie}ms`);
  return trie;
};

const findAllWords = (options, matrix, trie) => {
  const { maximumPathLength } = options;
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

const generateLetterMatrix = (options) => {
  const { dimensions, letterDistribution, letters } = options;
  const { width, height } = dimensions;
  const letterList = letters ? letters.split('') : getLetterList(letterDistribution, width * height);
  let matrix = [];
  let index = 0;
  for (let i = 0; i < height; i++) {
    let row = [];
    for (let j = 0; j < width; j++) {
      row.push(letterList[index]);
      index++;
    }
    matrix.push(row);
  }
  let key;
  if (config.letterKeys.hasOwnProperty(letterDistribution)) {
    key = config.letterKeys[letterDistribution];
  } else {
    key = { 'q': 'Qu' };
  }
  matrix = decodeMatrix(matrix, key);
  return { matrix, key };
};

const getPuzzleMetadata = (wordList, matrixData) => {
  const result = {
    dateCreated: Date.now(),
  };
  const commonFromList = [];
  for (const wordLength in commonWords) {
    const commonForLength = commonWords[wordLength].filter(word => wordList.has(word));
    commonFromList.push(commonForLength);
  }
  let commonRatio = commonFromList.flat().length / wordList.size;
  result.percentUncommon = 100 - Math.round(commonRatio * 100);
  matrixData.key && (result.key = matrixData.key);
  return result;
};

const getWordLengthAmounts = (wordList) => (
  wordList.reduce((counts, word) => {
    const length = word.length;
    counts[length] = (counts[length] || 0) + 1;
    return counts;
  }, {})
);

const getValidityData = (wordList, metadata, options) => {

  const validityData = {
    averageWordLength: wordList.reduce((sum, word) => sum + word.length, 0) / wordList.length,
    fullListLength: wordList.length,
    percentUncommon: metadata.percentUncommon,
    wordLengthAmounts: getWordLengthAmounts(wordList),
    valid: true,
  };

  if (options.filters) {
    const { uncommonWordLimit, totalWordLimits, averageWordLengthFilter, wordLengthLimits } = options.filters;

    // pecentage of uncommon words
    if (uncommonWordLimit) {
      const { comparison, value } = uncommonWordLimit;
      const tooMany = comparison === 'lessThan' && metadata.percentUncommon > value;
      const tooFew = comparison === 'moreThan' && metadata.percentUncommon < value;
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
        const wordsOfLength = validityData.wordLengthAmounts[wordLength];
        if (comparison === 'lessThan' && wordsOfLength > value
          || comparison === 'moreThan' && wordsOfLength <= value
        ) {
          // console.log(`wordLengthLimits: bad amount of ${wordLength}-letter words: ${wordsOfLength}`);
          validityData.valid = false;
        } else {
          // console.log(`wordLengthLimits: OK amount of ${wordLength}-letter words: ${wordsOfLength}`);
        }
      }
    }
  }
  return validityData;
};

const resolvePuzzleOptions = (options) => {
  const defaultPuzzleOptions = {
    dimensions: { width: 5, height: 5 },
    letterDistribution: 'scrabble',
    maximumPathLength: 20,
    maxAttempts: 1,
    returnBest: true,
  };
  if (options.letters && options.letters.length !== (options.dimensions.width * options.dimensions.height)) {
    return res.status(500).send('Wrong size letter list for length: ' + mergedOptions.letters.length + ' and dimensions: ' + mergedOptions.dimensions.width + ' by ' + mergedOptions.dimensions.height);
  }
  const maxAttempts = options.maxAttempts || defaultPuzzleOptions.maxAttempts;
  const width = options.dimensions?.width || defaultPuzzleOptions.dimensions.width;
  const height = options.dimensions?.height || defaultPuzzleOptions.dimensions.height;
  const dimensions = {
    width: options.dimensions?.width ? options.dimensions.width : height,
    height: options.dimensions?.height ? options.dimensions.height : width
  };
  return {
    ...defaultPuzzleOptions,
    ...options,
    maxAttempts,
    dimensions,
  };
};

const createEmptyObjectFromKeys = (argumentObject) => Object.fromEntries(Object.keys(argumentObject).map(key => [key, 0]));


const generateBoard = async (options) => {
  // console.log('received options', options);
  options = resolvePuzzleOptions(options);
  console.log('\nGenerating with resolved options\n', options);
  const maxAttempts = options.maxAttempts;
  // const maxAttempts = 500000;
  let bestSoFar;
  let result;
  const serverStats = {
    increases: createEmptyObjectFromKeys(options.filters || {}),
    revisions: 0,
    attempts: 0,
  };
  let { attempts, revisions } = serverStats;

  while (attempts < maxAttempts) {
    attempts++;
    let tickerTime = attempts > 1000 ? 1000 : 100;
    if (attempts % tickerTime === 0)
      console.log(`                                                                                            Attempt ${attempts}`);
    try {
      const matrixData = generateLetterMatrix(options);
      const matrix = matrixData.matrix;
      const findResultsSet = findAllWords(options, matrix, trie);
      const metadata = getPuzzleMetadata(findResultsSet, matrixData);
      const wordListArray = Array.from(findResultsSet);
      const validityData = getValidityData(wordListArray, metadata, options);
      metadata.averageWordLength = validityData.averageWordLength;
      const puzzleData = {
        matrix,
        wordList: wordListArray,
        metadata: { ...metadata, revisions: serverStats ? revisions : 0 },
        attempts,
        revisions,
      };
      if (validityData.valid) {
        result = {
          data: puzzleData,
          valid: true,
        };
        // bestSoFar.puzzleData = puzzleData;
        console.log('>> breaking due to found qualifying word');
        break;
      } else {
        if (options.returnBest) {
          // check if the new invalid puzzle is an improvement over the last one
          // retain it as bestSoFar if so
          const currentPuzzleData = {
            puzzleData,
            validityData,
          };
          if (!bestSoFar) {
            bestSoFar = currentPuzzleData;
          } else {
            const compareResult = comparePuzzleData(bestSoFar, currentPuzzleData, options);
            if (Object.values(compareResult.newIncreases).length) {
              for (const key in compareResult.newIncreases) {
                if (isNaN(serverStats.increases[key])) { serverStats.increases[key] = 0; }
                serverStats.increases[key] += compareResult.newIncreases[key];
              }
            }
            if (currentPuzzleData === compareResult.preferred) {
              revisions++;
              puzzleData.metadata.revisions = revisions;
            }
            bestSoFar = compareResult.preferred;
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

  console.log('broke ---');

  const attString = `${attempts} attempt${attempts > 1 ? 's' : ''}`;
  const revString = `${revisions} revision${revisions > 1 ? 's' : ''}`;

  if (result && result.valid) {
    result = {
      ...result,
      message: `Found valid puzzle after ${attempts} ${attString} and ${revString}.`,
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
        ...result,
        message: `Failed to produce an acceptable puzzle after max ${attString}`,
      };
    }
  }
  console.log(`\nReached the end of the loop.\n`);
  console.log('sending result.message', result.message);
  console.log(`\n\n`);
  return result;
};

if (!trie) buildDictionary();

module.exports = { generateBoard };