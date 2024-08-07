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
    console.log('\nNew puzzle won in categories: ' + wonCategories.join(', '));
    console.log(
      '>>> Old --->',
      oldPuzzle.validityData.fullListLength, 'total',
      oldPuzzle.validityData.percentUncommon + '% unc',
      (oldPuzzle.puzzleData.metadata.averageWordLength).toFixed(2), 'avg',
      JSON.stringify(oldPuzzle.validityData.wordLengthAmounts),
      '------->', `${options.dimensions.width}${options.dimensions.height}${oldPuzzle.puzzleData.matrix.flat(2).join('')}`
    ), '\n\n';
    console.log(
      '>>> New --->',
      preferred.validityData.fullListLength, 'total',
      preferred.validityData.percentUncommon + '% unc',
      (preferred.puzzleData.metadata.averageWordLength).toFixed(2), 'avg',
      JSON.stringify(preferred.validityData.wordLengthAmounts),
      '------->', `${options.dimensions.width}${options.dimensions.height}${preferred.puzzleData.matrix.flat(2).join('')}`
    ) + '\n';
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

const stringTo2DArray = (input, width, height) => {
  const result = [];
  let index = 0;
  for (let i = 0; i < height; i++) {
    const row = [];
    for (let j = 0; j < width; j++) {
      row.push(input[index]);
      index++;
    }
    result.push(row);
  }
  return result;
};


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
  console.log('encoding', list, 'with', key);
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

// console.log('------------------------------------>>>>>>>>>>>>>> util ran')

module.exports = { comparePuzzleData, decodeList, encodeList, decodeMatrix, encodeMatrix, shuffleArray, stringTo2DArray };


