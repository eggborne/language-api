import { DataTypes, Model } from 'sequelize';
import sequelize from '../sequelize';

class Word extends Model {
  public word!: string;
}

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

export default Word;