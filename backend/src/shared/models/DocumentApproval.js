const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DocumentApproval extends Model {
    static associate(models) {
      DocumentApproval.belongsTo(models.DocumentV2, { foreignKey: 'document_id', as: 'document' });
    }
  }
  DocumentApproval.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    document_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'documents_v2', key: 'id' } },
    approved_by: { type: DataTypes.INTEGER, allowNull: true },
    approval_status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), defaultValue: 'pending' },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    rejection_reason: { type: DataTypes.TEXT, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'DocumentApproval', tableName: 'document_approvals',
    timestamps: true, underscored: true,
  });
  return DocumentApproval;
};
