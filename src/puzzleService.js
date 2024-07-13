const { Trie } = require('./scripts/trie');
const path = require('path');
const fs = require('fs');

// const WORD_LIST_PATH = path.join(__dirname, '..', 'wordsonlylist.json');

const WORD_LIST_PATH = path.join(__dirname, 'wordsonlylist.json');
const BOGGLE_LETTER_KEY = { '0': '', '1': 'In', '2': 'Th', '3': 'Er', '4': 'He', '5': 'An', 'Q': 'Qu' };

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const convertMatrix = (matrix, key = BOGGLE_LETTER_KEY) => {
  const convertedMatrix = matrix.map(row =>
    row.map(cell => {
      return Object.prototype.hasOwnProperty.call(key, cell) ? key[cell] : cell;
    })
  );
  return convertedMatrix;
};
const unconvertMatrix = (matrix, key = BOGGLE_LETTER_KEY) => {
  const reversedKey = Object.fromEntries(
    Object.entries(key).map(([k, v]) => [v, k])
  );
  const unconvertedMatrix = matrix.map(row =>
    row.map(cell => {
      return Object.prototype.hasOwnProperty.call(reversedKey, cell) ? reversedKey[cell] : cell;
    })
  );
  return unconvertedMatrix;
};

const letterFrequencies = {
  standardEnglish: { A: 42, B: 10, C: 23, D: 17, E: 56, F: 9, G: 12, H: 15, I: 38, J: 1, K: 6, L: 27, M: 15, N: 33, O: 36, P: 16, Q: 1, R: 38, S: 29, T: 35, U: 18, V: 5, W: 6, X: 1, Y: 9, Z: 1 },
  modifiedEnglish: { A: 5, E: 5, I: 5, O: 5, U: 5, B: 3, C: 4, D: 3, F: 3, G: 3, H: 3, J: 1, K: 2, L: 4, M: 3, N: 4, P: 3, Q: 1, R: 4, S: 4, T: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1 },
  scrabble: { A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2, N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1 },
  wordsWithFriends: { A: 9, B: 2, C: 2, D: 5, E: 13, F: 2, G: 3, H: 4, I: 8, J: 1, K: 1, L: 4, M: 2, N: 5, O: 8, P: 2, Q: 1, R: 6, S: 5, T: 7, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1 },
  random: Object.fromEntries('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => [letter, 10])),
};

const boggleCubeSets = {
  0: [], 1: [], 2: [], 3: [],
  regular: ['AAEEGN', 'ABBJOO', 'ACHOPS', 'AFFKPS', 'AOOTTW', 'CIMOTU', 'DEILRX', 'DELRVY', 'DISTTY', 'EEGHNW', 'EEINSU', 'EHRTVW', 'EIOSST', 'ELRTTY', 'HIMNUQ', 'HLNNRZ'],
  big: ['AAAFRS', 'AAEEEE', 'AAFIRS', 'ADENNN', 'AEEEEM', 'AEEGMU', 'AEGMNN', 'AFIRSY', 'BJKQXZ', 'CCENST', 'CEIILT', 'CEILPT', 'CEIPST', 'DDHNOT', 'DHHLOR', 'DHLNOR', 'DHLNOR', 'EIIITT', 'EMOTTT', 'ENSSSU', 'FIPRSY', 'GORRVW', 'IPRRRY', 'NOOTUW', 'OOOTTU'],
  superBig: ['AAAFRS', 'AAEEEE', 'AAEEOO', 'AAFIRS', 'ABDEIO', 'ADENNN', 'AEEEEM', 'AEEGMU', 'AEGMNN', 'AEILMN', 'AEINOU', 'AFIRSY', 'Q12345', 'BBJKXZ', 'CCENST', 'CDDLNN', 'CEIITT', 'CEIPST', 'CFGNUY', 'DDHNOT', 'DHHLOR', 'DHHNOW', 'DHLNOR', 'EHILRS', 'EIILST', 'EILPST', 'EIORST', 'EMTTTO', 'ENSSSU', 'GORRVW', 'HIRSTV', 'HOPRST', 'IPRSYY', 'JKQWXZ', 'NOOTUW', 'OOOTTU']
};

const letterListfromFrequencyMap = (frequencyMap) => {
  let letterList = [];
  for (let letter in frequencyMap) {
    for (let i = 0; i < frequencyMap[letter]; i++) {
      letterList.push(letter);
    }
  }
  return letterList;
};

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
      letterList = letterListfromFrequencyMap(letterFrequencies['standardEnglish']);
    } else {
      letterList = letterListfromFrequencyMap(letterFrequencies[letterData]);
    }
  }
  shuffleArray(letterList);
  return letterList;
};

const fetchWords = async () => {
  const data = fs.readFileSync(WORD_LIST_PATH, 'utf8');
  return JSON.parse(data);
};

const initializeTrie = async (wordList) => {
  const trie = new Trie();
  wordList.forEach(word => word.length > 2 && trie.insert(word));
  return trie;
};

const findAllWords2 = (matrix, maximumPathLength, trie) => {
  let validWords = new Set();
  const directions = [
    [0, 1], [1, 0], [0, -1], [-1, 0],
    [-1, -1], [1, 1], [-1, 1], [1, -1]
  ];
  const rows = matrix.length;
  const cols = matrix[0].length;

  const dfs = (x, y, currentWord, currentNode, visited) => {
    const cellContent = (matrix[x][y]).toUpperCase();
    const newPath = currentWord + cellContent;

    if (newPath.length > maximumPathLength) return;

    currentNode = trie.searchPrefix(newPath);
    if (!currentNode) return;

    if (newPath.length >= 3 && currentNode.isEndOfWord) {
      validWords.add(newPath);
    }

    visited[x][y] = true;

    for (let [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < rows && ny < cols && !visited[nx][ny]) {
        dfs(nx, ny, newPath, currentNode, visited);
      }
    }

    visited[x][y] = false;
  };

  // Iterate through the matrix to start searches from each cell
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
      dfs(i, j, '', trie.root, visited); // Start with an empty word and the trie root
    }
  }

  return validWords;
};
const findAllWords = (options, matrix, trie) => {
  const { maximumPathLength } = options;

  let validWords = new Set();
  const directions = [
    [0, 1], [1, 0], [0, -1], [-1, 0],
    [-1, -1], [1, 1], [-1, 1], [1, -1]
  ];
  const rows = matrix.length;
  const cols = matrix[0].length;

  const dfs = (x, y, currentWord, currentNode, visited) => {
    const cellContent = (matrix[x][y]).toUpperCase();
    const newPath = currentWord + cellContent;

    if (newPath.length > maximumPathLength) return;

    currentNode = trie.searchPrefix(newPath);
    if (!currentNode) return;

    if (newPath.length >= 3 && currentNode.isEndOfWord) {
      validWords.add(newPath);
    }

    visited[x][y] = true;

    for (let [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < rows && ny < cols && !visited[nx][ny]) {
        dfs(nx, ny, newPath, currentNode, visited);
      }
    }

    visited[x][y] = false;
  };

  // Iterate through the matrix to start searches from each cell
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
      dfs(i, j, '', trie.root, visited); // Start with an empty word and the trie root
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

let puzzleTries = 0;
let timeoutLimit = 100;

const generateBoard = async (options) => {
  puzzleTries++;
  const { dimensions, letterDistribution, letters } = options;
  const letterList = letters ? letters.split('') : getLetterList(letterDistribution, dimensions);
  const matrix = generateLetterMatrix(letterList, dimensions.width, dimensions.height);
  const fullWordList = await fetchWords();
  const trie = await initializeTrie(fullWordList);
  const wordList = Array.from(findAllWords(options, matrix, trie)).sort((a, b) => a.length - b.length);
  if (options.totalWordLimits) {
    const { min, max } = options.totalWordLimits;
    if ((min && wordList.length < min) || (max && wordList.length > max)) {
      if (puzzleTries === timeoutLimit) {
        console.log('timed out after', puzzleTries);
        puzzleTries = 0;
        return;
      } else {
        // console.log(wordList.length, 'bad total word length, generating again for tryr', puzzleTries);
        return generateBoard(options);
      }
    } else {
      console.log('TOTAL WORDS OK after tries:', puzzleTries, wordList.length);
    }
  }
  if (options.wordLengthLimits) {
    let disqualified;
    for (const wordLength in options.wordLengthLimits) {
      const limits = options.wordLengthLimits[wordLength];
      limits.min = limits.min || 0;
      limits.max = limits.max || 99999999;
      const arrayOfLength = wordList.filter(word => word.length === parseInt(wordLength));
      if (arrayOfLength.length < limits.min || arrayOfLength.length > limits.max) {
        if (puzzleTries === timeoutLimit) {
          console.log('timed out after', puzzleTries);
          puzzleTries = 0;
          return;
        }
        disqualified = true;
        // console.log(wordLength, '-letter', arrayOfLength.length, 'is out of range of length limits for try', puzzleTries);
        return generateBoard(options);
      } else {
        console.log(wordLength, '-LETTER WORD AMOUT', arrayOfLength.length, 'OK after tries', puzzleTries);
      }
    }
  }
  console.log('-----------> FOUND PUZZLE AFTER TRIES:', puzzleTries);
  puzzleTries = 0;
  return { matrix, wordList };
};

module.exports = { generateBoard };