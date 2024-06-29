const { DataTypes, Model } = require('sequelize');
const sequelize = require('../sequelize');

class Word extends Model { }

Word.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  word: {
    type: DataTypes.STRING(20),
    allowNull: false
  }
}, {
  sequelize,
  modelName: 'Word',
  tableName: 'words',
  timestamps: false,
  underscored: true,
  freezeTableName: true
});

module.exports = Word;