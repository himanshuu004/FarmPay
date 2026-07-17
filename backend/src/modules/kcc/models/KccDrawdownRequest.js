/**
 * KccDrawdownRequest — LT (investment) drawdown against the facility's long-term
 * sub-limit (blueprint §5.4; ¶19(2)). Without this the LT half of CMPL is
 * display-only.
 *
 *   DRAFT → SUBMITTED → BANK_APPROVED → DISBURSED   (↘ REJECTED)
 *
 * On DISBURSED: the purchased asset enters the register and gets an insurance
 * nudge (the asset–loan–policy triangle closes).
 */
const { Model } = require('sequelize');

const STATES = ['DRAFT', 'SUBMITTED', 'BANK_APPROVED', 'DISBURSED', 'REJECTED'];
const ITEM_TYPES = ['ANIMAL', 'SHED', 'EQUIPMENT'];

module.exports = (sequelize, DataTypes) => {
  class KccDrawdownRequest extends Model {
    static associate(models) {
      if (models.KccFacility) KccDrawdownRequest.belongsTo(models.KccFacility, { foreignKey: 'facility_id', as: 'facility' });
    }
  }
  KccDrawdownRequest.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    request_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    facility_id: { type: DataTypes.INTEGER, allowNull: false },
    item: { type: DataTypes.ENUM(...ITEM_TYPES), allowNull: false },
    description: { type: DataTypes.STRING(200), allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    quotation_doc_url: { type: DataTypes.STRING(400), allowNull: true }, // photo/OCR
    seller_ref: { type: DataTypes.STRING(80), allowNull: true },
    status: { type: DataTypes.ENUM(...STATES), allowNull: false, defaultValue: 'DRAFT' },
    disbursed_at: { type: DataTypes.DATE, allowNull: true },
    utilization_evidence_url: { type: DataTypes.STRING(400), allowNull: true }, // post-purchase photo
    linked_animal_id: { type: DataTypes.INTEGER, allowNull: true }, // register link on disbursement
    rejection_reason: { type: DataTypes.STRING(255), allowNull: true },
  }, {
    sequelize, modelName: 'KccDrawdownRequest', tableName: 'kcc_drawdown_requests',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['facility_id'] }],
  });
  KccDrawdownRequest.STATES = STATES;
  KccDrawdownRequest.ITEM_TYPES = ITEM_TYPES;
  return KccDrawdownRequest;
};
