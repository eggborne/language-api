const path = require('path');
const fs = require('fs');

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pause = (duration) => new Promise(resolve => setTimeout(resolve, duration));

const comparePuzzleData = (oldPuzzle, newPuzzle, options) => {
  const { uncommonWordLimit, totalWordLimits, averageWordLengthFilter, wordLengthLimits } = options.filters;
  let preferred = oldPuzzle;

  let categoryWinners = {
    uncommonWordLimit: {
      winner: oldPuzzle,
    },
    totalWordLimits: {
      winner: oldPuzzle,
    },
    averageWordLengthFilter: {
      winner: oldPuzzle,
    },
    wordLengthLimits: {
      winner: oldPuzzle,
    },
  };

  let increasesForPuzzle = {
    uncommonWordLimit: 0,
    totalWordLimits: 0,
    averageWordLengthFilter: 0,
    wordLengthLimits: 0,
  };

  if (uncommonWordLimit) {
    const violationAmounts = { oldPuzzle: 0, newPuzzle: 0 };
    const { comparison, value } = uncommonWordLimit;
    const uncommonInA = oldPuzzle.validityData.percentUncommon;
    const uncommonInB = newPuzzle.validityData.percentUncommon;
    if (comparison === 'lessThan') {
      violationAmounts.oldPuzzle = uncommonInA >= value ? Math.abs(uncommonInA - value) : 0;
      violationAmounts.newPuzzle = uncommonInB >= value ? Math.abs(uncommonInB - value) : 0;
    }
    if (comparison === 'moreThan') {
      violationAmounts.oldPuzzle = uncommonInA <= value ? Math.abs(uncommonInA - value) : 0;
      violationAmounts.newPuzzle = uncommonInB <= value ? Math.abs(uncommonInB - value) : 0;
    }
    if (violationAmounts.newPuzzle < violationAmounts.oldPuzzle) {
      // console.log('newPuzzle has better uncommonWordLimit:', 'new', uncommonInB, 'vs old', uncommonInA);
      increasesForPuzzle.uncommonWordLimit++;
      categoryWinners.uncommonWordLimit = newPuzzle;
    }
  }

  if (averageWordLengthFilter) {
    const violationAmounts = { oldPuzzle: 0, newPuzzle: 0 };
    const { comparison, value } = averageWordLengthFilter;
    const averageForA = oldPuzzle.puzzleData.metadata.averageWordLength;
    const averageForB = newPuzzle.puzzleData.metadata.averageWordLength;
    if (comparison === 'lessThan') {
      violationAmounts.oldPuzzle = averageForA >= value ? Math.abs(averageForA - value) : 0;
      violationAmounts.newPuzzle = averageForB >= value ? Math.abs(averageForB - value) : 0;
    }
    if (comparison === 'moreThan') {
      violationAmounts.oldPuzzle = averageForA <= value ? Math.abs(averageForA - value) : 0;
      violationAmounts.newPuzzle = averageForB <= value ? Math.abs(averageForB - value) : 0;
    }
    if (violationAmounts.newPuzzle < violationAmounts.oldPuzzle) {
      // console.log('newPuzzle has better averageWordLengthFilter');
      increasesForPuzzle.averageWordLengthFilter++;
      categoryWinners.averageWordLengthFilter = newPuzzle;

    }
  }

  if (wordLengthLimits) {
    const violationAmounts = { oldPuzzle: 0, newPuzzle: 0 };
    for (let i = 0; i < wordLengthLimits.length; i++) {
      const { wordLength, comparison, value } = wordLengthLimits[i];
      const wordsOfLengthA = oldPuzzle.validityData.wordLengthAmounts[wordLength] || 0;
      const wordsOfLengthB = newPuzzle.validityData.wordLengthAmounts[wordLength] || 0;
      if (comparison === 'lessThan') {
        violationAmounts.oldPuzzle += wordsOfLengthA >= value ? Math.abs(wordsOfLengthA - value) : 0;
        violationAmounts.newPuzzle += wordsOfLengthB >= value ? Math.abs(wordsOfLengthB - value) : 0;
      }
      if (comparison === 'moreThan') {
        violationAmounts.oldPuzzle += wordsOfLengthA <= value ? Math.abs(wordsOfLengthA - value) : 0;
        violationAmounts.newPuzzle += wordsOfLengthB <= value ? Math.abs(wordsOfLengthB - value) : 0;
      }
    }

    if (violationAmounts.newPuzzle < violationAmounts.oldPuzzle) {
      increasesForPuzzle.wordLengthLimits++;
      categoryWinners.wordLengthLimits = newPuzzle;
    }
  }

  if (totalWordLimits) {
    const { min, max } = totalWordLimits;
    const listLengthA = oldPuzzle.validityData.fullListLength;
    const listLengthB = newPuzzle.validityData.fullListLength;
    let disparity = { oldPuzzle: 0, newPuzzle: 0 };
    if (min) {
      if (listLengthA < min) {
        disparity.oldPuzzle = min - listLengthA;
      }
      if (listLengthB < min) {
        disparity.newPuzzle = min - listLengthB;
      }
    }
    if (max) {
      if (listLengthA > max) {
        disparity.oldPuzzle = listLengthA - max;
      }
      if (listLengthB > max) {
        disparity.newPuzzle = listLengthB - max;
      }
    }

    if (disparity.newPuzzle < disparity.oldPuzzle) {
      // console.log('newPuzzle has better totalWordLimits:', 'new', listLengthB, 'vs old', listLengthA);
      increasesForPuzzle.totalWordLimits++;
      categoryWinners.totalWordLimits = newPuzzle;
    }
  }

  const wonCategories = [];
  for (const category in categoryWinners) {
    if (categoryWinners[category] === newPuzzle) {
      wonCategories.push(category);
    }
  }

  if (
    wonCategories.length === Object.values(options.filters).length
  ) {
    preferred = newPuzzle;
    // console.log('\nNew puzzle won in categories: ' + wonCategories.join(', '));
    // console.log(
    //   '>>> Old --->',
    //   oldPuzzle.validityData.fullListLength, 'total',
    //   oldPuzzle.validityData.percentUncommon + '% unc',
    //   (oldPuzzle.puzzleData.metadata.averageWordLength).toFixed(2), 'avg',
    //   JSON.stringify(oldPuzzle.validityData.wordLengthAmounts),
    //   '------->', `${options.dimensions.width}${options.dimensions.height}${oldPuzzle.puzzleData.matrix.flat(2).join('')}`
    // ), '\n\n';
    // console.log(
    //   '>>> New --->',
    //   preferred.validityData.fullListLength, 'total',
    //   preferred.validityData.percentUncommon + '% unc',
    //   (preferred.puzzleData.metadata.averageWordLength).toFixed(2), 'avg',
    //   JSON.stringify(preferred.validityData.wordLengthAmounts),
    //   '------->', `${options.dimensions.width}${options.dimensions.height}${preferred.puzzleData.matrix.flat(2).join('')}`
    // ) + '\n';
  }

  const newIncreases = {};
  if (Object.values(increasesForPuzzle).some(p => p)) {
    for (const key in increasesForPuzzle) {
      if (increasesForPuzzle[key] !== 0) {
        Object.assign(newIncreases, { [key]: increasesForPuzzle[key] });
      }
    }
  }
  return { preferred, newIncreases };
};

const shuffleArray = (arr) => {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const arrayToSquareMatrix = (flatArray) => Array(Math.sqrt(flatArray.length)).fill().map((_, i) => flatArray.slice(i * Math.sqrt(flatArray.length), (i + 1) * Math.sqrt(flatArray.length)));

const decodeMatrix = (matrix, key) => {
  const convertedMatrix = matrix.map(row =>
    row.map(cell => {
      return Object.prototype.hasOwnProperty.call(key, cell) ? key[cell] : cell;
    })
  );
  return convertedMatrix;
};

const decodeList = (list, key) => (list.map(item => key[item] || item));
const encodeList = (list, key) => {
  let encoded = list.join('').replace(
    new RegExp(Object.keys(key).join('|'), 'g'),
    match => key[match]
  ).split('');
  return encoded;
};

const encodeMatrix = (matrix, key) => {
  if (!key) return matrix;
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

async function convertJsonToBinary(jsonFilePath, binaryFilePath) {
  // Read the JSON file
  const jsonData = await fs.promises.readFile(jsonFilePath, 'utf8');

  // Parse the JSON data
  const words = JSON.parse(jsonData);

  // Open a writable stream for the binary file
  const writer = fs.createWriteStream(binaryFilePath);

  // Process each word
  words.forEach(word => {
    // Create a buffer for the length (1 byte) + word
    const wordBuffer = Buffer.from(word, 'utf8');
    const lengthBuffer = Buffer.alloc(1);
    lengthBuffer.writeUInt8(wordBuffer.length, 0);

    // Write the length and the word to the binary file
    writer.write(lengthBuffer);
    writer.write(wordBuffer);
  });

  // Close the stream
  writer.end();
}

const checkStructure = (array) => {
  const keys = Object.keys(array[0]);

  for (let i = 0; i < array.length; i++) {
    const currentKeys = Object.keys(array[i]);

    // Check if the number of keys matches
    if (keys.length !== currentKeys.length) {
      console.log(`Mismatch in the number of keys at index ${i}`);
      return false;
    }

    for (let key of keys) {
      // Check if the key is present
      if (!currentKeys.includes(key)) {
        console.log(`Missing key: ${key} at index ${i}`);
        return false;
      }
      // Check if the value associated with the key is null or undefined
      if (array[i][key] === null || array[i][key] === undefined) {
        console.log(`Null or undefined value for key: ${key} at index ${i}`);
        return false;
      }
    }
  }
  return true;
};

const alphabet = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"];

const enumerateLetterList = (letterList) => {
  return letterList.map(l => alphabet.indexOf(l));
};

const averageOfValues = (obj, decimals = 2) => {
  const values = Object.values(obj);
  const sum = values.reduce((acc, val) => acc + val, 0);
  const average = sum / values.length;
  return Number(average.toFixed(decimals));
};

const averageOfValue = (obj, attribute, decimals = 2) => {
  const values = Object.values(obj);
  const sum = values.reduce((acc, val) => acc + val, 0);
  const average = sum / values.length;
  return Number(average);
};

const convertMilliseconds = ms => ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(0)} seconds` : `${(ms / 60000).toFixed(2)} minutes`;

const getHigherScores = (obj1, obj2) => {
  const entries1 = Object.entries(obj1);
  const entries2 = Object.entries(obj2);

  return Object.fromEntries(
    entries1.map(([key1, value1], index) => {
      if (index < entries2.length) {
        const [key2, value2] = entries2[index];
        return value1 >= value2 ? [key1, value1] : [key2, value2];
      }
      return [key1, value1]; // if no corresponding entry in obj2, keep obj1's entry
    })
  );
};

// Function to compile JSON files based on attributes in their file names
function compileJsonFiles(directory, outputFile) {
  const compiledData = {};

  // Read all files from the specified directory
  fs.readdir(directory, (err, files) => {
    if (err) {
      console.error(`Error reading directory: ${err}`);
      return;
    }

    // Filter and process only JSON files
    files.forEach(file => {
      if (path.extname(file) === '.json') {
        const attributeMatch = file.match(/best-(.*?)(-|\.json)/);
        if (attributeMatch && attributeMatch[1]) {
          const attribute = attributeMatch[1];

          // Read the JSON file
          const filePath = path.join(directory, file);
          const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

          // Add the data to the compiledData object
          Object.entries(fileData).forEach(([key, value]) => {
            if (!compiledData[key]) {
              compiledData[key] = {};
            }
            compiledData[key][attribute] = value;
          });
        }
      }
    });

    // Write the compiled data to the destination file
    fs.writeFile(outputFile, JSON.stringify(compiledData, null, 2), (err) => {
      if (err) {
        console.error(`Error writing to file: ${err}`);
      } else {
        console.log(`Data successfully compiled into ${outputFile}`);
      }
    });
  });
}

const sortObjectByValues = (obj) =>
  Object.fromEntries(
    Object.entries(obj).sort(([, a], [, b]) => b - a)
  );

module.exports = {
  arrayToSquareMatrix,
  averageOfValues,
  averageOfValue,
  checkStructure,
  comparePuzzleData,
  convertMilliseconds,
  decodeList,
  decodeMatrix,
  encodeList,
  encodeMatrix,
  enumerateLetterList,
  getHigherScores,
  pause,
  randomInt,
  sortObjectByValues,
  shuffleArray,
};


