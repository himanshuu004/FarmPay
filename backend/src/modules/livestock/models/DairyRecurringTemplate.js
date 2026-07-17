/**
 * DairyRecurringTemplate Model
 * Stores per-farmer recurring cost templates (e.g. "Monthly labor wage").
 * A daily cron job converts due templates into pending DairyCostEvents that
 * the farmer can confirm with one tap on the home screen.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyRecurringTemplate extends Model {
    static associate(models) {
      DairyRecurringTemplate.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }

  DairyRecurringTemplate.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      template_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      farmer_id: { type: DataTypes.INTEGER, allowNull: false },
      template_name: { type: DataTypes.STRING(120), allowNull: false },
      category: {
        type: DataTypes.ENUM(
          'FEED', 'FODDER', 'MEDICINE', 'VET_TREATMENT', 'AI_BREEDING', 'NATURAL_SERVICE',
          'VACCINATION', 'LABOR', 'ELECTRICITY', 'WATER', 'HOUSING', 'EQUIPMENT',
          'TRANSPORT', 'INSURANCE', 'PURCHASE_ANIMAL', 'OTHER',
        ),
        allowNull: false,
      },
      default_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      default_quantity: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      default_unit: { type: DataTypes.STRING(20), allowNull: true },
      default_vendor: { type: DataTypes.STRING(120), allowNull: true },
      default_payment_mode: {
        type: DataTypes.ENUM('CASH', 'UPI', 'BANK', 'CREDIT', 'NONE'),
        allowNull: true,
      },
      frequency: {
        type: DataTypes.ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY'),
        allowNull: false,
      },
      day_of_period: { type: DataTypes.INTEGER, allowNull: true },
      next_due_date: { type: DataTypes.DATEONLY, allowNull: false },
      last_generated_date: { type: DataTypes.DATEONLY, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize,
      modelName: 'DairyRecurringTemplate',
      tableName: 'dairy_recurring_templates',
      timestamps: true,
      underscored: true,
    },
  );

  return DairyRecurringTemplate;
};
