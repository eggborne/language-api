const { Trie } = require('./scripts/trie');
const config = require('./config.json');
const path = require('path');
const {
  cubeSets,
  letterFrequencyMaps,
  letterKeys,
  syllableUnits,
  wordListFilePath,
  commonWordListFilePath,
  defaultOptions,
} = config;
const commonWords = require(commonWordListFilePath);
const { comparePuzzleData, shuffleArray, decodeList, encodeList } = require('./scripts/util');
const filePaths = {
  wordList: path.join(__dirname, wordListFilePath),
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

let trie;

const buildDictionary = async () => {
  const startTrie = Date.now();
  trie = new Trie();
  await trie.loadWordListFromBinary(filePaths.wordList);
  console.warn(`-----> Built trie in ${Date.now() - startTrie}ms`);
  return trie;
};

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
      if (convertQ) {
        const encodedLetterList = encodeList(userLetterList, { 'qu': 'q' });
        const convertedLetterList = decodeList(encodedLetterList, { 'q': 'qu' });
        if (userLetterList.length > convertedLetterList.length) {
          const lettersShort = userLetterList.length - convertedLetterList.length;
          letterList = [
            ...convertedLetterList,
            ...getLetterList(defaultOptions.letterDistribution, lettersShort)
          ];
        } else {
          letterList = convertedLetterList;
        }
      }
      if (shuffle) {
        letterList = shuffleArray(letterList);
      }
    } else if (requiredWords) {
      const { wordList, convertQ } = requiredWords;
      let letterCollectionList = wordList.map(wordString => wordString.toLowerCase().split(''));
      if (convertQ) {
        letterCollectionList = letterCollectionList.map(wordArray => {
          const encodedwordLetterList = encodeList(wordArray, { 'qu': 'q' });
          const letterCollection = decodeList(encodedwordLetterList, { 'q': 'qu' });
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
    if (letterKeys.hasOwnProperty(letterDistribution)) {
      const letterKey = letterKeys[letterDistribution];
      letterList = decodeList(getLetterList(letterDistribution, totalCells), letterKey);
    } else {
      console.log('no key found!');
    }
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
        if (Date.now() % 1000 === 0) {
          console.log(`Failed to place required word: ${word.join('')} - word ${placedWords.length}/${wordList.length}`);
        }

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
  };
  const commonFromList = [];
  for (const wordLength in commonWords) {
    const commonForLength = commonWords[wordLength].filter(word => wordList.has(word));
    commonFromList.push(commonForLength);
  }
  let commonRatio = commonFromList.flat().length / wordList.size;
  result.percentUncommon = 100 - Math.round(commonRatio * 100);
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
        const wordsOfLength = validityData.wordLengthAmounts[wordLength] || 0;
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
  options = { ...defaultOptions, ...options };
  const { width: userWidth, height: userHeight } = options.dimensions;
  const width = userWidth || defaultOptions.dimensions.width;
  const height = userHeight || defaultOptions.dimensions.height;
  options.dimensions = {
    width: userWidth || height,
    height: userHeight || width
  };
  if (options.customizations) {
    if (options.customizations.customLetters) {
      const { letterList, shuffle } = options.customizations.customLetters;
      const totalNeeded = options.dimensions.width * options.dimensions.height;
      if (letterList.length < totalNeeded) {
        let correctedLetterString = '';
        const lettersShort = (totalNeeded > letterList.length) ? (totalNeeded - letterList.length) : 0;
        if (lettersShort) {
          correctedLetterString;
          options.customizations.customLetters.letterList =
            [
              ...letterList,
              ...getLetterList(defaultOptions.letterDistribution, lettersShort)
            ];
        } else {
          options.customizations.customLetters.letterList.length = totalNeeded;
        }
      }
      if (!shuffle) {
        options.returnBest = false;
      }
    }

  }
  return {
    ...defaultOptions,
    ...options,
  };
};

const solveBoggle = async (letterString) => {
  let width, height;
  let lettersArray = letterString.trim().toLowerCase().split('');
  const { userWidth, userHeight } = {
    userWidth: parseInt(lettersArray[0]),
    userHeight: parseInt(lettersArray[1]),
  };

  if (userWidth && userHeight) {
    console.log('TWO lengths provided');
    width = userWidth;
    height = userHeight;
    lettersArray.shift();
    lettersArray.shift();
  } else if (userWidth) {
    console.log('ONE length provided');
    width = userWidth;
    height = userWidth;
    lettersArray.shift();
  } else {
    console.log('no lengths provided');
    const sqrt = Math.sqrt(lettersArray.length);
    width = Math.floor(sqrt);
    height = Math.floor(sqrt);
  }

  console.log('parsed dimensions', width, height);

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
    message: `Solved ${width}x${height} ${matrix.flat().join('')}`,
  };
};

const generateBoard = async (options) => {
  console.log('received options', options);
  options = resolvePuzzleOptions(options);
  console.log('\nGenerating with resolved options\n', options);
  const maxAttempts = options.maxAttempts;
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
    let tickerTime = attempts > 1000 ? 1000 : 100;
    if (attempts % tickerTime === 0)
      console.log(`                                                                                            Attempt ${attempts}`);
    try {
      let matrix = generateLetterMatrix(options);
      if (!matrix) {
        if (options.customizations.requiredWords) {
          while (!matrix && (attempts < maxAttempts)) {
            if (attempts % (attempts > 1000 ? 1000 : 100) === 0) {
              console.log(`Regenerating bad matrix on attempt                      ${attempts}`);
             }
            matrix = generateLetterMatrix(options);
            attempts++;
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
      const findResultsSet = findAllWords(matrix, trie);
      const metadata = getPuzzleMetadata(findResultsSet, matrix);
      const wordListArray = Array.from(findResultsSet);
      const validityData = getValidityData(wordListArray, metadata, options);
      metadata.averageWordLength = validityData.averageWordLength;

      const puzzleData = {
        matrix,
        wordList: wordListArray,
        metadata: {
          ...metadata,
          letterDistribution: options.letterDistribution,
          revisions: serverStats ? revisions : 0,
        },
        attempts,
        revisions,
      };
      //

      if (validityData.valid) {
        result = {
          data: puzzleData,
          valid: true,
        };
        console.log('>> breaking while loop due to found qualifying puzzle');
        break;
      } else {
        if (options.returnBest) {
          // check if the new invalid puzzle is an improvement over the last one and keep it as bestSoFar if so
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

  const attString = `${attempts} attempt${attempts > 1 ? 's' : ''}`;
  const revString = `${revisions} revision${revisions > 1 ? 's' : ''}`;

  if (options.customizations) {
    result.data.customizations = options.customizations;
  }
  if (options.filters) {
    result.data.filters = options.filters;
  }

  if (result && result.valid) {
    result = {
      ...result,
      message: `Found valid puzzle after ${attString} and ${revString}.`,
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

  console.log('Sending result.message:', result.message), '\n';
  return result;
};

if (!trie) buildDictionary();

// console.log('------------------------------------>>>>>>>>>>>>>> boggleService ran')

module.exports = { generateBoard, solveBoggle };