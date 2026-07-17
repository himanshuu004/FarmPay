/**
 * LgdStateTranslation Model
 * Multi-language state names.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LgdStateTranslation extends Model {
    static associate(models) {
      LgdStateTranslation.belongsTo(models.LgdState, { foreignKey: 'lgd_state_id', as: 'state' });
    }
  }

  LgdStateTranslation.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    lgd_state_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'lgd_states', key: 'id' } },
    language_code: { type: DataTypes.STRING(10), allowNull: false },
    state_name_translated: { type: DataTypes.STRING(120), allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'LgdStateTranslation', tableName: 'lgd_state_translations',
    timestamps: true, underscored: true,
    indexes: [{ unique: true, fields: ['lgd_state_id', 'language_code'], name: 'idx_state_lang_unique' }],
  });

  return LgdStateTranslation;
};
