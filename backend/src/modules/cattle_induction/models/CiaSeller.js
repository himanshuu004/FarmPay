/**
 * CiaSeller — cattle seller registered during guided purchase. bank_account is
 * penny-drop verified before any payout (CIA-3). relationship_to_buyer feeds the
 * circular-sale screen. Seller-concentration analysis reads across these rows.
 */
const { Model } = require('sequelize');
const { encField, decField } = require('../utils/fieldCrypto');

module.exports = (sequelize, DataTypes) => {
  class CiaSeller extends Model {
    static associate(models) {
      if (models.CiaPurchase) CiaSeller.hasMany(models.CiaPurchase, { foreignKey: 'seller_id', as: 'purchases' });
    }
  }
  CiaSeller.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    seller_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    // Encrypted at rest (getter/setter). Widened to hold AES-256-GCM ciphertext.
    id_proof_ref: { type: DataTypes.STRING(512), allowNull: false, set(v) { this.setDataValue('id_proof_ref', encField(v)); }, get() { return decField(this.getDataValue('id_proof_ref')); } },
    id_proof_type: { type: DataTypes.STRING(24), allowNull: true },
    bank_account: { type: DataTypes.STRING(255), allowNull: false, set(v) { this.setDataValue('bank_account', encField(v)); }, get() { return decField(this.getDataValue('bank_account')); } },
    bank_ifsc: { type: DataTypes.STRING(16), allowNull: true },
    account_verified: { type: DataTypes.BOOLEAN, defaultValue: false }, // penny-drop (CIA-3)
    photo_ref: { type: DataTypes.STRING(200), allowNull: false },       // live-capture
    relationship_to_buyer: { type: DataTypes.STRING(120), allowNull: false },
    mobile: { type: DataTypes.STRING(15), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'CiaSeller', tableName: 'cia_sellers',
    timestamps: true, underscored: true,
  });
  return CiaSeller;
};
