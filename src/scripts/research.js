const path = require('path');
const axios = require('axios');
const fs = require('fs/promises');
const { cubeSets, trainingDataLocalPath, trainingDataRemotePath } = require('../config.json');
const { arrayToSquareMatrix, randomInt, decodeList, encodeList, encodeMatrix } = require('./util');
const { generatePuzzle, buildDictionary } = require('../services/boggleService');

const listDataDir = path.resolve(__dirname, `../${trainingDataLocalPath}/research`);

const notUnique = (obj) => {
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

const sendListToRemote = async (fileName) => {
  const directory = `${listDataDir}/${fileName.split('-')[1].split('.')[0]}`;
  const localPath = path.join(directory, fileName);
  try {
    const jsonData = await fs.readFile(localPath, 'utf-8');
    const response = await axios.post(trainingDataRemotePath, {
      data: JSON.parse(jsonData),
      directory,
      fileName
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    console.log('\n //////////////////////// Successfully sent JSON file. Server responded with:', response.status, response.statusText, '\n');
  } catch (error) {
    console.error('Error sending JSON file:', error.message);
    throw (error);
  }
};


const addToBestList = async (newItem, fileName, overwrite) => {
  const localDir = `${listDataDir}/${fileName.split('-')[1].split('.')[0]}`;
  const localPath = path.join(localDir, fileName);
  try {
    let finalObj;
    if (!overwrite) {
      const existingObj = await getBestLists(fileName);
      finalObj = { ...existingObj, ...newItem };
    } else {
      finalObj = newItem;
    }
    const sortedList = Object.fromEntries(
      Object.entries(finalObj).sort(([, a], [, b]) => b - a)
    );
    const unique = !notUnique();
    if (unique) {
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

const getBestLists = async (fileName) => {
  fileName = fileName.replace(/percentUncommon/g, 'percentCommon');
  try {
    const localDir = `${listDataDir}/${fileName.split('-')[1].split('.')[0]}`;
    const localPath = path.join(localDir, fileName);
    const list = await fs.readFile(localPath, 'utf8');
    return JSON.parse(list);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No best list found; returning an empty object.');
      return {};
    } else {
      console.error('Error reading best lists:', error);
      throw error;
    }
  }
};

const addToObj1IfGreaterThanAverage = (obj1, obj2) => {
  const obj1Entries = Object.entries(obj1);
  const obj2Entries = Object.entries(obj2);
  obj2Entries.sort(([, scoreA], [, scoreB]) => scoreB - scoreA);
  const calculateAverage = (entries) => {
    const totalScore = entries.reduce((sum, [, score]) => sum + score, 0);
    return entries.length ? totalScore / entries.length : 0;
  };
  let currentAverage = calculateAverage(obj1Entries);
  for (const [uid, score] of obj2Entries) {
    if (score > (currentAverage)) {
      obj1[uid] = score;
      obj1Entries.push([uid, score]);
      currentAverage = calculateAverage(obj1Entries);
    } else {
      break;
    }
  }
  return obj1;
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

const compileResearchFiles = async (destinationFileName = 'puzzle_stats.json') => {
  const compiledData = {};
  try {
    // Read all subdirectories in the research directory
    const subdirs = await fs.readdir(listDataDir, { withFileTypes: true });

    for (const subdir of subdirs) {
      if (subdir.isDirectory()) {
        const attribute = subdir.name;
        const attributePath = path.join(listDataDir, attribute);

        // Read all files in the attribute subdirectory
        const files = await fs.readdir(attributePath);

        for (const file of files) {
          if (file.startsWith('best-') && file.endsWith('.json')) {
            // Read and parse the JSON file
            const filePath = path.join(attributePath, file);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const jsonData = JSON.parse(fileContent);

            // Process each key-value pair in the JSON data
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

    const fullOutputPath = path.join(listDataDir, destinationFileName);
    await fs.writeFile(fullOutputPath, JSON.stringify(compiledData, null, 2));
    console.log(`Multi-file compilation complete. Output written to ${destinationFileName}`);
    compileResearchList();
  } catch (error) {
    console.error('An error occurred:', error);
  }
};

let trie;

const compileResearchList = async (evaluationFileName = 'puzzle_stats.json', destinationFileName = 'all_puzzles.json') => {
  if (!trie) {
    trie = await buildDictionary();
  }
  const evaluatePath = path.join(listDataDir, evaluationFileName);
  const fileContent = await fs.readFile(evaluatePath, 'utf-8');
  const jsonData = JSON.parse(fileContent);
  const newList = {};
  for (const letterString in jsonData) {
    if (letterString.length !== 16) {
      console.error(letterString, 'letterString wrong length', letterString.length);
      return;
    }
    const evalLetterList = letterString.split('').join('-');
    const oldStats = jsonData[letterString];
    const researchPuzzleOptions = {
      dimensions: { width: 4, height: 4 },
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
    if (actualMatrixList.length !== 16) {
      console.error(actualMatrixList, 'actualMatrixList wrong length', actualMatrixList.length);
      return;
    }
    const evaluatedMatrixString = encodeList(puzzleData.data.matrix.flat(), { 'qu': 'q' }).join('');
    let wrong;
    if (evaluatedMatrixString.length !== 16) {
      console.error(evaluatedMatrixString, 'evaluatedMatrixString wrong length', evaluatedMatrixString.length);
      wrong = true;
    }
    const newMetaData = {
      averageWordLength: puzzleData.data.metadata.averageWordLength,
      percentCommon: (100 - puzzleData.data.metadata.percentUncommon),
      totalWords: puzzleData.data.wordList.length,
    };
    if (wrong || (evaluatedMatrixString !== letterString)) {
      console.log('letterString', letterString);
      console.log('evalLetterList', evalLetterList);
      console.log('actualMatrixList', actualMatrixList);
      console.log('puzzle matrix.flat().join', puzzleData.data.matrix.flat().join('-'));
      if (!wrong) console.error('>>>>>>>>>>>>>> checked wrong letterString! evaluatedMatrixString, letterString', evaluatedMatrixString, letterString);
      return;
    }
    newList[evaluatedMatrixString] = newMetaData;
  }
  const fullOutputPath = path.join(listDataDir, destinationFileName);
  await fs.writeFile(fullOutputPath, JSON.stringify(newList, null, 2));
  console.log(`Full-stats compilation complete. Output written to ${destinationFileName}`);
};

module.exports =
{
  addToBestList,
  addToObj1IfGreaterThanAverage,
  compileResearchFiles,
  getBestLists,
  getRandomCubes,
  notUnique,
  sendListToRemote,
};