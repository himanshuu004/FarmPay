/**
 * LgdBlockTranslation Model
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LgdBlockTranslation extends Model {
    static associate(models) {
      LgdBlockTranslation.belongsTo(models.LgdBlock, { foreignKey: 'lgd_block_id', as: 'block' });
    }
  }

  LgdBlockTranslation.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    lgd_block_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'lgd_blocks', key: 'id' } },
    language_code: { type: DataTypes.STRING(10), allowNull: false },
    block_name_translated: { type: DataTypes.STRING(120), allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'LgdBlockTranslation', tableName: 'lgd_block_translations',
    timestamps: true, underscored: true,
    indexes: [{ unique: true, fields: ['lgd_block_id', 'language_code'], name: 'idx_block_lang_unique' }],
  });

  return LgdBlockTranslation;
};
