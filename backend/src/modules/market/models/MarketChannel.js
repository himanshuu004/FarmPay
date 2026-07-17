/**
 * MarketChannel — a milk selling channel for the channel advisor (blueprint §
 * market). The DEFAULT society channel is the passbook route; PRIVATE/COMPANY
 * channels are indicative alternatives so the farmer can compare where to sell.
 * Rates are CONFIG (never code); each channel prices via its own method_json.
 *
 * method_json:
 *   { method: 'TWO_AXIS', perFatPoint, perSnfPoint, minRate, maxRate }  or
 *   { method: 'FLAT', ratePerLitre }
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MarketChannel extends Model {
    static associate() {}
  }
  MarketChannel.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    channel_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    scope: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'DEFAULT' },
    channel_ref: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    channel_type: { type: DataTypes.ENUM('SOCIETY', 'PRIVATE', 'COMPANY'), allowNull: false },
    method_json: {
      type: DataTypes.JSONB, allowNull: false,
      defaultValue: { method: 'FLAT', ratePerLitre: 35 },
    },
    // Society milk is paid on a cycle with a passbook + credit + insurance path;
    // surfaced honestly so a marginally higher private cash rate isn't the whole story.
    settlement_note: { type: DataTypes.STRING(160), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'MarketChannel', tableName: 'market_channels',
    timestamps: true, underscored: true,
  });
  return MarketChannel;
};
