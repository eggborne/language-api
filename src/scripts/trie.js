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

  async saveTrie(filePath) {
    const serializedTrie = this.serializeTrie();
    await fs.promises.writeFile(filePath, JSON.stringify(serializedTrie));
  }

  serializeTrie(node = this.root) {
    const serialized = {};
    if (node.isEndOfWord) {
      serialized.end = true;
    }
    for (const [char, childNode] of node.children) {
      serialized[char] = this.serializeTrie(childNode);
    }
    return serialized;
  }

  static async loadTrie(filePath) {
    const data = await fs.promises.readFile(filePath, 'utf8');
    const serializedTrie = JSON.parse(data);
    const trie = new Trie();
    trie.deserializeTrie(serializedTrie);
    return trie;
  }

  deserializeTrie(serialized, node = this.root) {
    if (serialized.end) {
      node.isEndOfWord = true;
    }
    for (const [char, childSerialized] of Object.entries(serialized)) {
      if (char !== 'end') {
        const childNode = new TrieNode();
        node.children.set(char, childNode);
        this.deserializeTrie(childSerialized, childNode);
      }
    }
  }
}

module.exports = Trie;