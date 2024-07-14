const { Trie } = require('./scripts/trie');
const config = require('./config.json');
const path = require('path');
const fs = require('fs');

const convertMatrix = (matrix, key = config.letterKeys.boggle) => {
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
  const cubeList = extendedCubeSet.slice(0, totalCubes).map(cube => cube[Math.floor(Math.random() * cube.length)])
  return cubeList;
};

const getLetterList = (letterDistribution, listLength) => {
  if (config.cubeSets.hasOwnProperty(letterDistribution)) {
    return letterListFromCubeSet(config.cubeSets[letterDistribution], listLength);
  } else if (letterDistribution === 'syllables') {
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
  const { onsets, nuclei, codas} = config.syllableUnits;
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

const fetchWords = async () => {
  console.warn('------ FETCHING WORD LIST');
  const data = fs.readFileSync(path.join(__dirname, config.wordListFileName), 'utf8');
  return JSON.parse(data);
};

let trie;
const initializeTrie = async (wordList) => {
  const trie = new Trie();
  wordList.forEach(word => word.length > 2 && trie.insert(word));
  return trie;
};

const buildDictionary = async () => {
  if (!trie) {
    console.warn('------ FETCHING WORDS AND BUILDING TRIE');
    const wordList = await fetchWords();
    trie = await initializeTrie(wordList);
  }
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
  return convertMatrix(matrix);
};

const isWordListValid = (wordList, options) => {
  if (options.totalWordLimits) {
    const { min, max } = options.totalWordLimits;
    if ((min && wordList.length < min) || (max && wordList.length > max)) {
      console.log(`totalWordLimit: bad wordList.length: ${wordList.length}`);
      return false;
    }
  }

  if (options.wordLengthLimits && Object.entries(options.wordLengthLimits).length > 0) {
    for (const [wordLength, limits] of Object.entries(options.wordLengthLimits)) {
      const { min = 0, max = Infinity } = limits;
      const wordsOfLength = wordList.filter(word => word.length === parseInt(wordLength)).length;
      if (wordsOfLength < min || wordsOfLength > max) {
        console.log(`wordLengthLimits: bad amount of ${wordLength}-letter words: ${wordsOfLength}`);
        return false;
      }
    }
  }

  if (options.averageWordLengthFilter) {
    const { comparison, value } = options.averageWordLengthFilter;
    const average = wordList.join('').length / wordList.length;
    if (comparison === 'lessThan') {
      if (average > value) {
        console.log('averageWordLengthFilter: ', value, comparison, average);
        return false;
      }
    }
    if (comparison === 'moreThan') {
      if (average < value) {
        console.log('averageWordLengthFilter:', value, comparison, average);
        return false;
      }
    }
  }
  return true;
};

const generateBoard = async (options) => {
  const maxAttempts = 1;
  let attempts = 0;

  await buildDictionary();

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const matrix = generateLetterMatrix(options);
      const wordList = Array.from(findAllWords(options, matrix, trie));
      if (isWordListValid(wordList, options)) {
        console.log(`Found valid puzzle after ${attempts} attempts`);
        return {
          matrix,
          wordList,
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