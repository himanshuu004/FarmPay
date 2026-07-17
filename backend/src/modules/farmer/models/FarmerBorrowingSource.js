/**
 * FarmerBorrowingSource Model
 * Unified table for formal (banks, NBFCs, SFBs, PACS, FPOs, SHGs) and
 * informal (family, moneylender, adathiya, input seller) borrowing sources.
 * Data entered once here, auto-pulled for loan applications.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FarmerBorrowingSource extends Model {
    static associate(models) {
      FarmerBorrowingSource.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
      FarmerBorrowingSource.belongsTo(models.FarmerBankAccount, { foreignKey: 'bank_account_id', as: 'bankAccount' });
    }
  }

  FarmerBorrowingSource.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      borrowing_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      source_category: {
        type: DataTypes.ENUM('formal', 'informal'),
        allowNull: false,
      },
      source_type: {
        type: DataTypes.ENUM(
          // Formal institutions
          'public_sector_bank', 'private_bank', 'rrb', 'cooperative_bank',
          'sfb', 'nbfc', 'pacs', 'fpo', 'shg', 'mfi',
          // Informal sources
          'family_friends', 'money_lender', 'adathiya', 'input_seller_credit',
          'landlord', 'other'
        ),
        allowNull: false,
      },
      source_name: {
        type: DataTypes.STRING(150), allowNull: true,
        comment: 'Institution name, person name, shop name',
      },
      // For formal bank/NBFC/SFB sources
      bank_account_id: {
        type: DataTypes.INTEGER, allowNull: true,
        references: { model: 'farmer_bank_accounts', key: 'id' },
        comment: 'Links to encrypted bank account details',
      },
      branch_name: { type: DataTypes.STRING(100), allowNull: true },
      // For PACS/FPO/SHG
      pacs_code: { type: DataTypes.STRING(30), allowNull: true },
      member_id: { type: DataTypes.STRING(50), allowNull: true },
      group_name: { type: DataTypes.STRING(100), allowNull: true },
      // Loan details
      loan_type: {
        type: DataTypes.ENUM(
          // KCC
          'kcc_crop', 'kcc_allied', 'kcc_consumption',
          // Non-KCC Agri
          'crop_loan', 'dairy_loan', 'livestock_loan', 'fisheries_loan',
          'horticulture_loan', 'animal_husbandry', 'farm_mechanization',
          'irrigation', 'land_development', 'agri_processing',
          'warehouse_receipt', 'input_loan', 'agri_infrastructure',
          // Gold
          'agri_gold', 'kcc_gold', 'allied_gold', 'consumption_gold', 'gold_general',
          // Group
          'jlg', 'shg_group_loan',
          // Other
          'mudra_shishu', 'mudra_kishore', 'mudra_tarun',
          'personal', 'other'
        ),
        allowNull: true,
      },
      scheme_name: { type: DataTypes.STRING(100), allowNull: true },
      // Amounts
      sanction_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      borrowed_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      outstanding_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      // Terms
      interest_rate_pct: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      interest_period: {
        type: DataTypes.ENUM('monthly', 'yearly', 'flat', 'none'),
        allowNull: true,
      },
      repayment_type: {
        type: DataTypes.ENUM('emi', 'bullet', 'flexi'),
        allowNull: true,
      },
      borrowed_date: { type: DataTypes.DATEONLY, allowNull: true },
      due_date: { type: DataTypes.DATEONLY, allowNull: true },
      // Informal-specific
      lender_name: { type: DataTypes.STRING(100), allowNull: true },
      lender_mobile: { type: DataTypes.STRING(13), allowNull: true },
      collateral_type: {
        type: DataTypes.ENUM('none', 'harvest_promise', 'gold', 'land', 'crop_standing', 'other'),
        allowNull: true,
      },
      // Gold loan specific
      gold_weight_grams: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
      gold_purity_carat: {
        type: DataTypes.ENUM('24k', '22k', '20k', '18k'),
        allowNull: true,
      },
      // Status
      repayment_status: {
        type: DataTypes.ENUM('active', 'partially_paid', 'fully_paid', 'overdue', 'restructured'),
        defaultValue: 'active',
      },
      last_updated_by_farmer: { type: DataTypes.DATE, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'FarmerBorrowingSource', tableName: 'farmer_borrowing_sources',
      timestamps: true, underscored: true,
      indexes: [
        { fields: ['farmer_id', 'source_category'], name: 'idx_borrowing_farmer_category' },
        { fields: ['farmer_id', 'source_type'], name: 'idx_borrowing_farmer_type' },
        { fields: ['farmer_id', 'repayment_status'], name: 'idx_borrowing_farmer_status' },
      ],
    }
  );

  return FarmerBorrowingSource;
};
