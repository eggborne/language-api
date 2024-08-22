const { syllableUnits, letterKeys } = require('./config.json');
const { decodeList } = require('./scripts/util');

for (const set in syllableUnits) {
  syllableUnits[set] = decodeList(syllableUnits[set], letterKeys.syllableUnits);
}

function validateInitialUnit(word) {
  word = word.toLowerCase();
  let string = '';
  const types = [];
  const unitArrays = {
    onset: [...syllableUnits.onsets].sort((a, b) => b.length - a.length),
    nucleus: [...syllableUnits.nuclei].sort((a, b) => b.length - a.length),
    coda: [...syllableUnits.codas].sort((a, b) => b.length - a.length),
  };
  for (let type in unitArrays) {
    const unitArray = unitArrays[type];
    for (let unit of unitArray) {
      const sliceLength = unit.length;
      const contestedLetters = word.slice(0, sliceLength);
      const wordBeginsWithUnit = contestedLetters === unit;
      if (wordBeginsWithUnit) {
        const stringOverWritable = unit.length >= string.length;
        if (stringOverWritable) {
          if (unit.length > string.length) {
            types.length = 0;
          }
          string = unit;
          const typeOverwritable = !types.includes(type) && unitArrays[type].indexOf(unit) !== -1;
          if (typeOverwritable) {
            types.push(type);
          }
        }
      }
    }
  }
  return {
    string,
    types,
  };
}

function extractSyllables(word) {
  let syllables = [];
  let remainingWord = word;
  let currentStartingIndex = 0;
  let currentSyllable = [];
  let previousUnit;
  while (remainingWord.length) {
    const newUnit = validateInitialUnit(remainingWord);
    if (newUnit.string) {
      const nextRemainingWord = remainingWord.substring(newUnit.string.length);
      if (newUnit.string.length === word.length) {
        currentSyllable.push(newUnit);
        syllables.push(currentSyllable);
        remainingWord = '';
        break;
      }
      if (remainingWord) {
        if (!previousUnit) {
          currentSyllable.push(newUnit);
        } else {
          currentSyllable.push(newUnit);
          const endOfSyllable = previousUnit.types.includes('nucleus') && (newUnit.types.includes('coda') || newUnit.types.includes('onset'));
          const endOfWord = nextRemainingWord.length === 0;
          const endingOnProperType = endOfWord && (newUnit.types.includes('nucleus') || newUnit.types.includes('coda'));
          if (endOfSyllable || endingOnProperType) {
            syllables.push(currentSyllable);
            currentSyllable = [];
          }
        }
        previousUnit = newUnit;
      }
      currentStartingIndex = newUnit.string.length;
      remainingWord = remainingWord.substr(currentStartingIndex);
    } else {
      remainingWord = '';
    }
  }
  console.info('extractSyllables SYLLABLES ----------', syllables);
  return syllables;
}

function validateSyllableSequence(syllableArray) {
  let violation = {};
  let pronounceable;
  const isSingleSyllableWord = syllableArray.length === 1;
  for (let s = 0; s < syllableArray.length; s++) {
    const unitObjArray = syllableArray[s];
    const syllableString = unitObjArray.map(syllObj => syllObj.string).join('');
    const isSingleUnitSyllable = unitObjArray.length === 1;
    const firstUnit = unitObjArray[0];
    const secondUnit = unitObjArray[1];
    const lastUnit = unitObjArray[unitObjArray.length - 1];
    const previousSyllable = syllableArray[s - 1];
    const finalUnitOfPreviousSyllable = s > 0 && !isSingleSyllableWord ? previousSyllable[previousSyllable.length - 1] : undefined;

    const startsWithRestrictiveCoda =
      firstUnit.types.includes('coda')
      && !firstUnit.types.includes('onset')
      ;
    const endsWithRestrictiveOnset =
      lastUnit.types.includes('onset')
      && !lastUnit.types.includes('coda')
      ;
    const incompleteSyllableAsOnlyUnit =
      isSingleUnitSyllable
      && !firstUnit.types.includes('nucleus')
      ;
    const noNucleusFirstOrSecond =
      unitObjArray.length > 1
      && !firstUnit.types.includes('nucleus')
      && !secondUnit.types.includes('nucleus')
      ;
    const hasConsecutiveNuclei =
      (
        unitObjArray.length >= 2
        && (firstUnit.types.includes('nucleus') && !firstUnit.types.includes('onset') && !firstUnit.types.includes('coda'))
        && (secondUnit.types.includes('nucleus') && !secondUnit.types.includes('onset') && !secondUnit.types.includes('coda'))
      )
      ||
      (
        unitObjArray.length === 3
        && (secondUnit.types.includes('nucleus') && !secondUnit.types.includes('onset') && !secondUnit.types.includes('coda'))
        && (lastUnit.types.includes('nucleus') && !lastUnit.types.includes('onset') && !lastUnit.types.includes('coda'))
      )
      ;
    const endsWordWithTwoConsonants =
      syllableArray.length > 1
      && unitObjArray.length === 1
      && !firstUnit.string === 's'
      && !firstUnit.types.includes('nucleus')
      && !finalUnitOfPreviousSyllable.types.includes('nucleus')
      ;
    const tooManyUnits = unitObjArray.length > 3;
    pronounceable =
      !(tooManyUnits
        || incompleteSyllableAsOnlyUnit
        || startsWithRestrictiveCoda
        || noNucleusFirstOrSecond
        || hasConsecutiveNuclei
        || endsWithRestrictiveOnset
        || endsWordWithTwoConsonants
      );
    if (!pronounceable) {
      if (incompleteSyllableAsOnlyUnit) {
        violation.syllable = syllableString;
        violation.rule = 'syllable sequence';
        violation.string = syllableString;
        violation.details = 'consonant unit as only syllable';
        break;
      }
      if (startsWithRestrictiveCoda) {
        violation.syllable = syllableString;
        violation.rule = 'syllable sequence';
        violation.string = firstUnit.string;
        violation.details = 'starts with restrictive coda';
        break;
      }
      if (noNucleusFirstOrSecond) {
        violation.syllable = syllableString;
        violation.rule = 'syllable sequence';
        violation.string = firstUnit.string + secondUnit.string;
        violation.details = 'no nucleus in first or second position';
        break;
      }
      if (hasConsecutiveNuclei) {
        violation.syllable = syllableString;
        violation.rule = 'syllable sequence';
        violation.string = syllableString;
        violation.details = 'has two consecutive nucleii';
        break;
      }
      if (endsWithRestrictiveOnset) {
        violation.syllable = syllableString;
        violation.rule = 'syllable sequence';
        violation.string = firstUnit.string;
        violation.details = 'ends with restrictive onset';
        break;
      }
      if (endsWordWithTwoConsonants) {
        violation.syllable = syllableString;
        violation.rule = 'syllable sequence';
        violation.string = firstUnit.string;
        violation.details = 'ends word with two consonant units';
        break;
      }
      if (tooManyUnits) {
        violation.syllable = syllableString;
        violation.rule = 'syllable sequence';
        violation.string = syllableString;
        violation.details = 'contains too many units';
        break;
      }
    }
  }
  return pronounceable ? {
    pronounceable
  } : {
    pronounceable,
    violation
  };
}

function isPronounceable(word) {
  try {
    const syllables = extractSyllables(word);
    const { pronounceable, violation } = validateSyllableSequence(syllables);
    return {
      data: {
        pronounceable,
        violation,
        syllables,
      },
      message: `${word} is ${pronounceable ? '' : 'not '}pronounceable.`,
    };
  } catch (error) {
    return {
      message: `Error processing '${word}': ${error}.`,
    };

  }
}

// console.log('------------------------------------>>>>>>>>>>>>>> pronounceabilityService ran');

module.exports = isPronounceable;