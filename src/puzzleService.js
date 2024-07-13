const { Trie } = require('./scripts/trie');
const config = require('./config.json');
const path = require('path');
const fs = require('fs');

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const convertMatrix = (matrix, key = BOGGLE_LETTER_KEY) => {
  const convertedMatrix = matrix.map(row =>
    row.map(cell => {
      return Object.prototype.hasOwnProperty.call(key, cell) ? key[cell] : cell;
    })
  );
  return convertedMatrix;
};

const WORD_LIST_PATH = path.join(__dirname, config.wordListFileName);
const BOGGLE_LETTER_KEY = config.letterKeys.boggle;
const letterFrequencies = config.letterFrequencies;
const boggleCubeSets = config.cubeSets.boggle;

const letterPoolFromFrequencyMap = (frequencyMap) => {
  let letterList = [];
  for (let letter in frequencyMap) {
    for (let i = 0; i < frequencyMap[letter]; i++) {
      letterList.push(letter);
    }
  }
  return letterList;
};

const weightedLetterPools = {
  scrabble: letterPoolFromFrequencyMap(letterFrequencies['scrabble']),
  wordsWithFriends: letterPoolFromFrequencyMap(letterFrequencies['wordsWithFriends']),
  standardEnglish: letterPoolFromFrequencyMap(letterFrequencies['standardEnglish']),
  modifiedEnglish: letterPoolFromFrequencyMap(letterFrequencies['modifiedEnglish']),
  random: letterPoolFromFrequencyMap(letterFrequencies['random']),
}

const letterListFromCubeSet = (cubeSet) => {
  return cubeSet.map(cube => cube[randomInt(0, cube.length - 1)]);
};

const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
};

const getLetterList = (letterData, dimensions) => {
  const { width, height } = dimensions;
  let letterList;
  if (letterData === 'boggle' && width === height && width >= 3 && width <= 6) {
    const cubeSet = Object.values(boggleCubeSets)[width];
    letterList = letterListFromCubeSet(cubeSet);
  } else {
    if (letterData === 'boggle') {
      letterList = weightedLetterPools['standardEnglish'];
    } else {
      letterList = weightedLetterPools[letterData];
    }
  }
  shuffleArray(letterList);
  letterList = letterList.slice(0, width * height);
  return letterList;
};

let trie;

const fetchWords = async () => {
  console.warn('------ FETCHING WORD LIST');
  const data = fs.readFileSync(WORD_LIST_PATH, 'utf8');
  return JSON.parse(data);
};

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
  } else {
    console.warn('Reusing built trie')
  }
  return trie;
}

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

    const cellContent = matrix[x][y].toUpperCase();
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

const generateLetterMatrix = (letters, width, height) => {
  let matrix = [];
  let index = 0;

  for (let i = 0; i < height; i++) {
    let row = [];
    for (let j = 0; j < width; j++) {
      row.push(letters[index]);
      index++;
    }
    matrix.push(row);
  }
  return convertMatrix(matrix);
};

const isPuzzleValid = (wordList, options) => {
  if (options.totalWordLimits) {
    const { min, max } = options.totalWordLimits;
    if ((min && wordList.length < min) || (max && wordList.length > max)) {
      console.log(`totalWordLimit: ${wordList.length} < ${min} or ${wordList.length} > ${max}`);
      return false;
    }
    // console.warn('totalWordLimit OK')
  }

  if (options.wordLengthLimits && Object.entries(options.wordLengthLimits).length > 0) {
    for (const [wordLength, limits] of Object.entries(options.wordLengthLimits)) {
      const { min = 0, max = Infinity } = limits;
      const wordsOfLength = wordList.filter(word => word.length === parseInt(wordLength)).length;
      if (wordsOfLength < min || wordsOfLength > max) {
        console.log(`wordLengthLimits: ${wordsOfLength} < ${min} or ${wordsOfLength} > ${max}`);
        return false;
      }
    }
    // console.warn('wordLengthLimits OK')
  }

  if (options.averageWordLengthFilter) {
    const { comparison, value } = options.averageWordLengthFilter;
    const average = wordList.join('').length / wordList.length;
    if (comparison === 'lessThan') {
      if (average > value) {
        console.log('averageWordLengthFilter:', value, comparison, average);
        return false;
      }
    }
    if (comparison === 'moreThan') {
      if (average < value) {
        console.log('averageWordLengthFilter:', value, comparison, average);
        return false;
      }
    }
    // console.warn('averageWordLengthFilter OK');
  }

  return true;
};

const generateBoard = async (options) => {
  const maxAttempts = 100;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const { dimensions, letterDistribution, letters } = options;
      const letterList = letters ? letters.split('') : getLetterList(letterDistribution, dimensions);
      const matrix = generateLetterMatrix(letterList, dimensions.width, dimensions.height);
      await buildDictionary();
      const wordList = Array.from(findAllWords(options, matrix, trie)).sort((a, b) => a.length - b.length);
      if (isPuzzleValid(wordList, options)) {
        console.log(`Found valid puzzle after ${attempts} attempts`);
        return { matrix, wordList };
      }
    } catch (error) {
      console.error('Error generating board:', error);
    }
  }
  console.error('reached end of attempts!');
  return undefined;
};

module.exports = { generateBoard };