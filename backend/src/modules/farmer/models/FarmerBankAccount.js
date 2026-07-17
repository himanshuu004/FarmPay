/**
 * FarmerBankAccount Model
 * Bank account details with encrypted account number (Level 3) and masking.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FarmerBankAccount extends Model {
    static associate(models) {
      FarmerBankAccount.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'user' });
    }

    /**
     * Returns a safe object with account number masked.
     * @returns {Object}
     */
    toSafeJSON() {
      const values = this.toJSON();
      delete values.account_number;
      return values;
    }
  }

  FarmerBankAccount.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      account_holder_name: { type: DataTypes.STRING(120), allowNull: false },
      bank_name: { type: DataTypes.STRING(100), allowNull: false },
      account_number: {
        type: DataTypes.STRING(255), allowNull: false,
        comment: 'Encrypted account number — Level 3 sensitivity',
      },
      account_number_masked: {
        type: DataTypes.STRING(20), allowNull: true,
        comment: 'Last 4 digits visible, e.g. XXXX XXXX 1234',
      },
      ifsc_code: { type: DataTypes.STRING(11), allowNull: false },
      account_type: {
        type: DataTypes.ENUM('savings', 'current', 'other'),
        defaultValue: 'savings',
      },
      is_primary_account: { type: DataTypes.BOOLEAN, defaultValue: false },
      verified_at: { type: DataTypes.DATE, allowNull: true },
      verification_method: {
        type: DataTypes.ENUM('micro_deposit', 'api', 'manual'),
        allowNull: true,
      },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'FarmerBankAccount', tableName: 'farmer_bank_accounts',
      timestamps: true, underscored: true,
      indexes: [{ fields: ['farmer_id', 'is_primary_account'] }],
    }
  );

  return FarmerBankAccount;
};
