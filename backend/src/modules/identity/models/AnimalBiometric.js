/**
 * AnimalBiometric — the muzzle-print gallery (CLAUDE.md identity module). The
 * muzzle embedding is OUR SECOND FACTOR — it never replaces the statutory 12-digit
 * tag + 2 photos (#: NLM identification). Biometric data is consented (BIOMETRIC
 * purpose), Indian-region, and DELETABLE (#24); the gallery never leaves the
 * platform.
 *
 * The embedding is stored as a pgvector literal in text ('[0.1,0.2,...]') and
 * compared with pgvector's cosine operator (col::vector <=> :q::vector). The CV
 * model that produces the embedding lives in ai-services (never here).
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AnimalBiometric extends Model {
    static associate(models) {
      if (models.DairyAnimal) AnimalBiometric.belongsTo(models.DairyAnimal, { foreignKey: 'animal_id', as: 'animal', constraints: false });
      if (models.User) AnimalBiometric.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }
  AnimalBiometric.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    biometric_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    farmer_id: { type: DataTypes.INTEGER, allowNull: false },
    animal_id: { type: DataTypes.INTEGER, allowNull: true },      // DairyAnimal.id
    tag_uid: { type: DataTypes.STRING(12), allowNull: true },     // 12-digit NDDB tag (the statutory anchor)
    muzzle_embedding: { type: DataTypes.TEXT, allowNull: false }, // pgvector literal '[...]'
    embedding_dim: { type: DataTypes.INTEGER, allowNull: false },
    quality_score: { type: DataTypes.DECIMAL(5, 4), allowNull: false }, // on-device QC, server-revalidated
    model_name: { type: DataTypes.STRING(60), allowNull: false },
    model_version: { type: DataTypes.STRING(40), allowNull: false },
    consent_record_id: { type: DataTypes.INTEGER, allowNull: true },
    captured_at: { type: DataTypes.DATE, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true }, // erasure soft-flag; hard delete also supported
  }, {
    sequelize, modelName: 'AnimalBiometric', tableName: 'animal_biometrics',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['farmer_id'] }, { fields: ['animal_id'] }, { fields: ['tag_uid'] }, { fields: ['embedding_dim'] }],
  });
  return AnimalBiometric;
};
