const path = require('path');
const axios = require('axios');
const fs = require('fs/promises');
const { cubeSets, trainingDataLocalPath, trainingDataRemotePath } = require('../config.json');
const { arrayToSquareMatrix, randomInt } = require('./util');

const listDataDir = path.resolve(__dirname, `../${trainingDataLocalPath}/research`);
const filePath = path.join(listDataDir, `best-lists.json`);

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

const sendListToRemote = async () => {
  try {
    const jsonData = await fs.readFile(filePath, 'utf-8');
    const response = await axios.post(trainingDataRemotePath, JSON.parse(jsonData), {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`Successfully sent JSON file. Server responded with: ${response.status} ${response.statusText}`);
  } catch (error) {
    console.error('Error sending JSON file:', error.message);
  }
}

const addToBestList = async (newItem, overwrite) => {
  try {
    let finalObj;
    if (!overwrite) {
      const existingObj = await getBestLists();
      finalObj = { ...existingObj, ...newItem };
    } else {
      finalObj = newItem;
    }
    const sortedList = Object.fromEntries(
      Object.entries(finalObj).sort(([, a], [, b]) => b - a)
    );
    const unique = !notUnique();
    if (unique) {
      console.log('Lists are unique! OK to save!');
      await fs.writeFile(filePath, JSON.stringify(sortedList, null, 2));
    } else {
      console.log(`\nWait! it's not unique!\n`);
    }
    console.log('New list written to file.');
    return sortedList;
  } catch (error) {
    console.error('Error updating best list:', error);
    throw error;
  }
};

const getBestLists = async () => {
  try {
    const list = await fs.readFile(filePath, 'utf8');
    return JSON.parse(list);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No best list found, returning an empty object.');
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

module.exports = 
{
  addToBestList, 
  addToObj1IfGreaterThanAverage, 
  getBestLists, 
  getRandomCubes,
  notUnique,
  sendListToRemote,
};