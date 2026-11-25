'use strict';

/**
 * Migration 003: Adds `track_stock` and `stock_quantity` columns to `catalog_items`
 * so digital/software products can disable stock limits (`track_stock = 0`).
 */
module.exports = {
  version: 3,
  name: '003_catalog_stock_control',
  up(db) {
    const columns = db.prepare('PRAGMA table_info(catalog_items)').all();
    const names = new Set(columns.map((c) => c.name));
    if (!names.has('track_stock')) {
      db.exec('ALTER TABLE catalog_items ADD COLUMN track_stock INTEGER DEFAULT 0;');
    }
    if (!names.has('stock_quantity')) {
      db.exec('ALTER TABLE catalog_items ADD COLUMN stock_quantity INTEGER DEFAULT NULL;');
    }
  },
};
