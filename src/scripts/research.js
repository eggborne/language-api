const path = require('path');
const axios = require('axios');
const fs = require('fs/promises');
const { cubeSets, trainingDataLocalPath, trainingDataRemotePath } = require('../config.json');
const { arrayToSquareMatrix, randomInt, decodeList, encodeList, encodeMatrix, buildDictionary } = require('./util');
const { generatePuzzle } = require('../services/boggleService');

const listDataDir = path.resolve(__dirname, `../${trainingDataLocalPath}/research`);

const objHasDuplicate = (obj) => {
  const seen = new Set();
  for (const key in obj) {
    const sortedKey = key.split('').sort().join('');
    if (seen.has(sortedKey)) {
      return true;
    }
    seen.add(sortedKey);
  }
  return false;
};

const sendFileToRemote = async (data, directory, fileName) => {
  console.log('sendFileToRemote saving in dir', directory);
  console.log('sendFileToRemote fileName', fileName);
  try {
    const response = await axios.post(trainingDataRemotePath, {
      data,
      directory,
      fileName
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    console.log(`\nSuccessfully sent ${directory}/${fileName}. Server responded with:`, response.status, response.statusText, '\n');
  } catch (error) {
    console.error('Error sending JSON file:', error.message);
    throw (error);
  }
};

const sendListToRemote = async (data, fileName) => {
  try {
    const response = await axios.post(trainingDataRemotePath, {
      data,
      fileName
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    console.log(`\nSuccessfully sent ${fileName}. Server responded with ${response.status}: ${response.statusText}\n`);
  } catch (error) {
    console.error('Error sending JSON file:', error.message);
    throw (error);
  }
};


const addToBestList = async (size, newItem, fileName, overwrite) => {
  const localDir = `${listDataDir}/${size}/${fileName.split('-')[1].split('.')[0]}`;
  const localPath = path.join(localDir, fileName);
  try {
    let finalObj;
    if (!overwrite) {
      const existingObj = await getBestLists(size, fileName);
      finalObj = { ...existingObj, ...newItem };
    } else {
      finalObj = newItem;
    }
    const sortedList = Object.fromEntries(
      Object.entries(finalObj).sort(([, a], [, b]) => b - a)
    );    
    const unique = !objHasDuplicate(sortedList);
    if (unique) {
      console.log('all ids unique! Writing as', fileName);
      await fs.writeFile(localPath, JSON.stringify(sortedList, null, 2));
    } else {
      console.log(`\nWait! it's not unique!\n`);
    }
    return sortedList;
  } catch (error) {
    console.error('Error updating best list:', error);
    throw error;
  }
};

const getBestLists = async (size, fileName) => {
  fileName = fileName;
  const localDir = `${listDataDir}/${size}/${fileName.split('-')[1].split('.')[0]}`;
  const localPath = path.join(localDir, fileName);
  try {
    const list = await fs.readFile(localPath, 'utf8');
    let parsedList = JSON.parse(list);
    return parsedList;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Create the file with an empty object if it doesn't exist
      console.log('No best list found for', fileName, '- creating directory if necessary.');
      await fs.mkdir(localDir, { recursive: true });
      return null;
    } else {
      console.error('Error reading best lists:', error);
      throw error;
    }
  }
};

const getAboveAverageEntries = (originalObj, testObj, overrideAverage) => {
  const obj1Entries = Object.entries(originalObj);
  const obj2Entries = Object.entries(testObj);
  obj2Entries.sort(([, scoreA], [, scoreB]) => scoreB - scoreA);
  let currentAverage;
  const calculateAverage = (entries) => {
    const totalScore = entries.reduce((sum, [, score]) => sum + score, 0);
    return entries.length ? totalScore / entries.length : 0;
  };
  currentAverage = overrideAverage || calculateAverage(obj1Entries);
  const insertedEntries = {};

  for (const [uid, score] of obj2Entries) {
    if (score > currentAverage) {
      insertedEntries[uid] = score;
      obj1Entries.push([uid, score]);
      currentAverage = overrideAverage || calculateAverage(obj1Entries);
    } else {
      break;
    }
  }
  return insertedEntries;
};

const getRandomCubes = (cubeSetName) => {
  const cubeSet = [...cubeSets[cubeSetName]];
  const cubeIndexes = Array.from({ length: cubeSet.length }, (_, i) => i);
  const cubeRollMatrix = arrayToSquareMatrix(new Array(cubeSet.length).fill([], -1));
  const letterList = [];
  for (let r = 0; r < cubeRollMatrix.length; r++) {
    const row = cubeRollMatrix[r];
    for (let c = 0; c < row.length; c++) {
      const randomCubeIndex = cubeIndexes.splice(randomInt(0, cubeIndexes.length - 1), 1)[0];
      const cubeLetters = cubeSet[randomCubeIndex].split('');
      const cubeRoll = randomInt(0, cubeLetters.length - 1);
      cubeRollMatrix[r][c] = { index: randomCubeIndex, roll: cubeRoll };
      const cubeSelection = cubeLetters[cubeRoll];
      letterList.push(cubeSelection);
    }
  }
  return { letterList };
};

const saveResearchFile = async (data, directory, fileName) => {
  try {
    const actualPath = `${listDataDir}${directory ? `/${directory}` : ''}`;
    const fullLocalPath = path.join(actualPath, fileName);
    try {
      await fs.access(actualPath, fs.constants.F_OK);
    } catch (error) {
      await fs.mkdir(actualPath, { recursive: true });
    }
    await fs.writeFile(fullLocalPath, JSON.stringify(data, null, 2));
    console.log(`Saved ${fileName} locally in ${directory}.`);
    sendFileToRemote(data, directory, fileName);
  } catch (error) {
    console.error('An error occurred:', error);
  }
};

const compileResearchFiles = async (destinationFileName = 'puzzle_stats.json', size = 4) => {
  const compiledData = {};
  try {
    const sizeDir = `${listDataDir}/${size}`;
    const subdirs = await fs.readdir(sizeDir, { withFileTypes: true });
    for (const subdir of subdirs) {
      if (subdir.isDirectory()) {
        const attribute = subdir.name;
        const attributePath = path.join(sizeDir, attribute);
        const files = await fs.readdir(attributePath);
        for (const file of files) {
          if (file.startsWith('best-') && file.endsWith('.json')) {
            const filePath = path.join(attributePath, file);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            let jsonData = JSON.parse(fileContent);
            const originalListLength = Object.keys({ ...jsonData }).length;
            for (const id in jsonData) {
              const correctLength = id.length === size * size;
              if (!correctLength) {
                console.log('compileResearchFiles deleting', id);
                delete jsonData[id];
              }
            }
            const prunedListLength = Object.keys(jsonData).length;
            if (prunedListLength > 1) {
              if (prunedListLength < originalListLength) {
                console.log(prunedListLength, ' length prunedList differs from originalListLength ->', originalListLength);
                console.log('overwriting with obj', jsonData);
                await fs.writeFile(filePath, JSON.stringify(jsonData));
                console.log('Replaced old stats file!');
              }
              for (const [key, value] of Object.entries(jsonData)) {
                if (!compiledData[key]) {
                  compiledData[key] = {};
                }
                compiledData[key][attribute] = value;
              }
            }
          }
        }
      }
    }

    const fullFileName = `${size}_${destinationFileName}`;
    const fullLocalPath = path.join(listDataDir, fullFileName);

    // Check if the file already exists
    let existingData = {};
    try {
      await fs.access(fullLocalPath);
      const existingContent = await fs.readFile(fullLocalPath, 'utf-8');
      existingData = JSON.parse(existingContent);
      console.log('---> compileResearchFiles Already had existing', fullFileName, 'length', Object.keys(existingData).length)
      console.log('---> Appending new of length', Object.keys(compiledData).length)
    } catch (err) {
      console.log('File does not exist, creating new one.');
    }

    // Merge the existing data with new compiled data
    const mergedData = { ...existingData, ...compiledData };

    console.log('length of merged compileResearchFiles', Object.keys(mergedData).length)

    // Write the merged data
    await fs.writeFile(fullLocalPath, JSON.stringify(mergedData, null, 2));
    console.log(`Multi-file compilation complete. Output written to ${fullLocalPath}`);

    await sendListToRemote(mergedData, fullFileName);
    compileResearchList(fullFileName, `all_puzzles.json`, size);
  } catch (error) {
    console.error('An error occurred:', error);
  }
};

const compileResearchFiles2 = async (destinationFileName = 'puzzle_stats.json', size = 4) => {
  const compiledData = {};
  try {
    const subdirs = await fs.readdir(listDataDir, { withFileTypes: true });
    for (const subdir of subdirs) {
      if (subdir.isDirectory()) {
        const attribute = subdir.name;
        const attributePath = path.join(listDataDir, attribute);
        const files = await fs.readdir(attributePath);
        for (const file of files) {
          if (file.startsWith('best-') && file.endsWith('.json')) {
            const filePath = path.join(attributePath, file);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            let jsonData = JSON.parse(fileContent);
            const originalListLength = Object.keys({ ...jsonData }).length;
            for (const id in jsonData) {
              const correctLength = id.length === size * size;
              if (!correctLength) {
                console.log('compileResearchFiles deleting', id);
                delete jsonData[id];
              }
            }
            const prunedListLength = Object.keys(jsonData).length;
            if (prunedListLength > 1) {
              if (prunedListLength < originalListLength) {
                console.log(prunedListLength, ' length prunedList differs from originalListLength ->', originalListLength);
                console.log('overwriting with obj', jsonData);
                await fs.writeFile(filePath, JSON.stringify(jsonData));
                console.log('Replaced old stats file!');
              }
              for (const [key, value] of Object.entries(jsonData)) {
                if (!compiledData[key]) {
                  compiledData[key] = {};
                }
                compiledData[key][attribute] = value;
              }
            }
          }
        }
      }
    }
    const fullFileName = `${size}_${destinationFileName}`;
    const fullLocalPath = path.join(listDataDir, fullFileName);
    await fs.writeFile(fullLocalPath, JSON.stringify(compiledData, null, 2));
    console.log(`Multi-file compilation complete. Output written to ${fullLocalPath}`);
    await sendListToRemote(compiledData, fullFileName);
    compileResearchList(fullFileName, `all_puzzles.json`, size);
  } catch (error) {
    console.error('An error occurred:', error);
  }
};

let trie;

const compileResearchList = async (evaluationFileName, destinationFileName, size = 4) => {
  if (!trie) trie = await buildDictionary();
  const evaluatePath = path.join(listDataDir, evaluationFileName);
  const fileContent = await fs.readFile(evaluatePath, 'utf-8');
  const jsonData = JSON.parse(fileContent);
  const listLength = size * size;
  let newList = {};
  for (const letterString in jsonData) {
    if (letterString.length === listLength) {
      const evalLetterList = letterString.split('').join('-');
      let letterDistribution = [null, null, null, null, 'boggle', 'bigBoggle', 'superBigBoggle'][size];
      const researchPuzzleOptions = {
        dimensions: { width: size, height: size },
        letterDistribution,
        customizations: {
          customLetters: {
            letterList: letterString.split(''),
            convertQ: true,
            shuffle: false
          }
        }
      };
      const puzzleData = await generatePuzzle(researchPuzzleOptions, trie);
      const actualMatrixList = puzzleData.data.matrix.flat();
      const evaluatedMatrixString = encodeList(actualMatrixList, { 'qu': 'q' }).join('');
      const newMetaData = {
        averageWordLength: Number(puzzleData.data.metadata.averageWordLength.toFixed(2)),
        commonWordAmount: puzzleData.data.metadata.commonWordAmount,
        totalWords: puzzleData.data.wordList.length,
      };
      if (evaluatedMatrixString !== letterString) {
        console.log('letterString', letterString);
        console.log('evalLetterList', evalLetterList);
        console.log('actualMatrixList', actualMatrixList);
        console.log('puzzle matrix.flat().join', puzzleData.data.matrix.flat().join('-'));
        console.error('>>>>>>>>>>>>>> checked wrong letterString! evaluatedMatrixString, letterString', evaluatedMatrixString, letterString);
        return;
      }
      newList[evaluatedMatrixString] = newMetaData;
    } else {
      console.log('skipping invalid letterString', letterString);
    }
  }

  const actualDestination = `${size}_${destinationFileName}`;
  const fullOutputPath = path.join(listDataDir, actualDestination);

  // Check if the file already exists
  let existingData = {};
  try {
    await fs.access(fullOutputPath);
    const existingContent = await fs.readFile(fullOutputPath, 'utf-8');
    existingData = JSON.parse(existingContent);
    console.log('---> compileResearchList Already had existing', destinationFileName, 'length', Object.keys(existingData).length);
    console.log('---> Appending new of length', Object.keys(newList).length)
  } catch (err) {
    console.log('File does not exist, creating new one.');
  }

  // Merge the existing data with new data
  newList = Object.fromEntries(
    Object.entries({ ...existingData, ...newList }).sort((a, b) => b[1].totalWords - a[1].totalWords)
  );

  console.log('length of merged compileResearchList', Object.keys(newList).length)

  // Write the merged data
  await fs.writeFile(fullOutputPath, JSON.stringify(newList, null, 2));
  console.log(`Full-stats compilation complete. Output written to local ${actualDestination}`);
  console.log('Total items:', Object.entries(newList).length);

  sendListToRemote(newList, actualDestination);
};

const compileResearchList2 = async (evaluationFileName, destinationFileName, size = 4) => {
  if (!trie) trie = await buildDictionary();
  const evaluatePath = path.join(listDataDir, evaluationFileName);
  const fileContent = await fs.readFile(evaluatePath, 'utf-8');
  const jsonData = JSON.parse(fileContent);
  const listLength = size * size;
  let newList = {};
  for (const letterString in jsonData) {
    if (letterString.length === listLength) {
      const evalLetterList = letterString.split('').join('-');
      let letterDistribution = [null, null, null, null, 'boggle', 'bigBoggle', 'superBigBoggle'][size];
      const researchPuzzleOptions = {
        dimensions: { width: size, height: size },
        letterDistribution,
        customizations: {
          customLetters: {
            letterList: letterString.split(''),
            convertQ: true,
            shuffle: false
          }
        }
      };
      const puzzleData = await generatePuzzle(researchPuzzleOptions, trie);
      const actualMatrixList = puzzleData.data.matrix.flat();
      const evaluatedMatrixString = encodeList(actualMatrixList, { 'qu': 'q' }).join('');
      const newMetaData = {
        averageWordLength: Number(puzzleData.data.metadata.averageWordLength.toFixed(2)),
        commonWordAmount: puzzleData.data.metadata.commonWordAmount,
        totalWords: puzzleData.data.wordList.length,
      };
      if ((evaluatedMatrixString !== letterString)) {
        console.log('letterString', letterString);
        console.log('evalLetterList', evalLetterList);
        console.log('actualMatrixList', actualMatrixList);
        console.log('puzzle matrix.flat().join', puzzleData.data.matrix.flat().join('-'));
        console.error('>>>>>>>>>>>>>> checked wrong letterString! evaluatedMatrixString, letterString', evaluatedMatrixString, letterString);
        return;
      }
      newList[evaluatedMatrixString] = newMetaData;
    } else {
      console.log('skipping invalid letterString', letterString);
    }
  }
  const actualDestination = `${size}_${destinationFileName}`;
  const fullOutputPath = path.join(listDataDir, actualDestination);
  newList = Object.fromEntries(
    Object.entries(newList).sort((a, b) => b[1].totalWords - a[1].totalWords)
  );
  await fs.writeFile(fullOutputPath, JSON.stringify(newList, null, 2));
  console.log(`Full-stats compilation complete. Output written to local ${actualDestination}`);
  console.log('Total items:', Object.entries(newList).length);
  sendListToRemote(newList, actualDestination);
};

module.exports =
{
  addToBestList,
  getAboveAverageEntries,
  compileResearchFiles,
  getBestLists,
  getRandomCubes,
  saveResearchFile,
};