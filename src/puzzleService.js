const { Trie } = require('./scripts/trie');
const config = require('./config.json');
const commonWords = require('./commonWords.json');
const path = require('path');
const fs = require('fs');

const decodeMatrix = (matrix, key) => {
  const convertedMatrix = matrix.map(row =>
    row.map(cell => {
      return Object.prototype.hasOwnProperty.call(key, cell) ? key[cell] : cell;
    })
  );
  return convertedMatrix;
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
      return start;
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
  const wordList = await JSON.parse(fs.readFileSync(path.join(__dirname, config.wordListFileName), 'utf8'));
  trie = initializeTrie(wordList);
  return trie;
};

const findAllWords = (options, matrix, trie) => {
  const { maximumPathLength } = options;
  const validWords = new Set();
  const uncommonWords = new Set();
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
      if (!commonWords[newWord.length].includes(newWord)) {
        uncommonWords.add(newWord);
      }
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
  let percentUncommon = Math.round((uncommonWords.size / validWords.size) * 100);
  console.log(`findAllWords found ${uncommonWords.size}/${validWords.size} uncommon words - ${percentUncommon}% are uncommon`);
  return { validWords, percentUncommon };
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
    matrix = decodeMatrix(matrix, key);
  }
  return { matrix, key };
};

const isWordListValid = (wordList, metadata, filters) => {
  if (!filters) return true;
  console.log('------ applying filters', filters);
  const { uncommonWordLimit, totalWordLimits, averageWordLengthFilter, wordLengthLimits } = filters;

  // pecentage of umcommon words
  if (uncommonWordLimit) {
    const { comparison, value } = uncommonWordLimit;
    const tooMany = comparison === 'lessThan' && metadata.percentUncommon > value;
    const tooFew = comparison === 'moreThan' && metadata.percentUncommon < value;
    if (tooMany || tooFew) {
      console.error('too many/few uncommon:', metadata.percentUncommon);
      return false;
    }
  }
  // total amount of words
  if (totalWordLimits) {
    const { min, max } = totalWordLimits;
    if ((min && wordList.length < min) || (max && wordList.length > max)) {
      console.log(`wordList bad length: ${wordList.length}`);
      return false;
    }
  }
  // average word length
  if (averageWordLengthFilter) {
    const { comparison, value } = averageWordLengthFilter;
    const average = wordList.reduce((sum, word) => sum + word.length, 0) / wordList.length;
    if (comparison === 'lessThan' && average > value
      || comparison === 'moreThan' && average < value
    ) {
      console.log('averageWordLengthFilter: ', value, comparison, average);
      return false;
    }
  }
  // amounts of each word length

  for (let i = 0; i < wordLengthLimits.length; i++) {
    const { wordLength, comparison, value } = wordLengthLimits[i];
    const wordsOfLength = wordList.filter(word => word.length === parseInt(wordLength)).length;
    if (comparison === 'lessThan' && wordsOfLength > value) {
      console.log(`wordLengthLimits: bad amount of ${wordLength}-letter words: ${wordsOfLength}`);
      return false;
    } else if (comparison === 'moreThan' && wordsOfLength < value) {
      console.log(`wordLengthLimits: bad amount of ${wordLength}-letter words: ${wordsOfLength}`);
      return false;
    } else {
      console.log(`wordLengthLimits: OK amount of ${wordLength}-letter words: ${wordsOfLength}`);
    }
  }

  return true;
};

const resolvePuzzleOptions = (options) => {
  const defaultPuzzleOptions = {
    dimensions: { width: 5, height: 5 },
    letterDistribution: 'scrabble',
    maximumPathLength: 20,
    maxAttempts: 1,
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

const generateBoard = async (options) => {
  console.log('received options', options);
  options = resolvePuzzleOptions(options);
  console.log('resolved options', options);
  const maxAttempts = options.maxAttempts;
  let attempts = 0;
  if (!trie) await buildDictionary();
  while (attempts < maxAttempts) {
    attempts++;
    console.log(`\nAttempt ${attempts} --------------------------------\n`);
    try {
      const matrixData = generateLetterMatrix(options);
      const matrix = matrixData.matrix;
      const findResults = findAllWords(options, matrix, trie);
      const wordList = Array.from(findResults.validWords);
      const metadata = {
        dateCreated: Date.now(),
        key: matrixData.key,
        percentUncommon: findResults.percentUncommon,
      };
      if (isWordListValid(wordList, metadata, options.filters)) {
        console.log(`Found valid puzzle after ${attempts} attempts`);
        return {
          matrix,
          wordList,
          metadata,
        };
      }
    } catch (error) {
      console.error('Error generating board:', error);
    }
  }
  console.error(`failed after ${attempts} attempts`);
  return undefined;
};

module.exports = { generateBoard };