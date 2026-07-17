/**
 * feedPriceService — the feed-price board. Reads the co-op input catalog
 * (coop_input_items) directly; feed prices are sourced from the ERP/filedrop and
 * NEVER re-typed here. Defaults to the input categories a dairy farmer buys.
 */
let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const FEED_CATEGORIES = ['FEED', 'MINERAL', 'FODDER_SEED'];

const listFeed = async ({ category } = {}) => {
  const { CoopInputItem } = getDb();
  if (!CoopInputItem) return [];
  const where = { is_active: true };
  where.category = category ? category : FEED_CATEGORIES;
  const items = await CoopInputItem.findAll({ where, order: [['category', 'ASC'], ['name', 'ASC']] });
  return items.map((i) => ({
    itemUuid: i.item_uuid, sku: i.sku, name: i.name, category: i.category, unit: i.unit,
    mrp: Number(i.mrp), subsidisedPrice: Number(i.subsidised_price),
    saving: Math.round((Number(i.mrp) - Number(i.subsidised_price)) * 100) / 100,
    source: i.source_mode, syncedAt: i.synced_at,
  }));
};

module.exports = { listFeed, FEED_CATEGORIES };
