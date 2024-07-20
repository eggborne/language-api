const fs = require('fs');

class TrieNode {
  constructor() {
    this.children = new Map();
    this.isEndOfWord = false;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(word) {
    let currentNode = this.root;
    for (const char of word) {
      if (!currentNode.children.has(char)) {
        currentNode.children.set(char, new TrieNode());
      }
      currentNode = currentNode.children.get(char);
    }
    currentNode.isEndOfWord = true;
  }

  async loadWordListFromBinary(filePath) {
    const buffer = await fs.promises.readFile(filePath);
    let offset = 0;
    while (offset < buffer.length) {
      const length = buffer.readInt8(offset);
      const word = buffer.toString('utf8', offset + 1, offset + 1 + length);
      this.insert(word);
      offset += 1 + length;
    }
  }
}

console.log('------------------------------------>>>>>>>>>>>>>> trie ran')

module.exports = { Trie };