const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

class Store {
  constructor(dir, protect, unprotect) {
    fs.mkdirSync(dir, { recursive:true });
    this.dir = dir; this.protect = protect; this.unprotect = unprotect;
    this.db = new DatabaseSync(path.join(dir, 'estateflow.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value BLOB NOT NULL);');
    this.put = this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    this.remove = this.db.prepare('DELETE FROM settings WHERE key=?');
  }
  all() { return Object.fromEntries(this.db.prepare('SELECT * FROM settings').all().map(r => [r.key,this.unprotect(Buffer.from(r.value))])); }
  batch(changes) {
    if (!Array.isArray(changes) || changes.length > 1000) throw Error('Invalid save request');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const [key,value] of changes) {
        if (typeof key !== 'string' || !key.startsWith('lq.') || (value !== null && typeof value !== 'string')) throw Error('Invalid record');
        if (value === null) this.remove.run(key); else this.put.run(key, this.protect(value));
      }
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  backup(file) { this.db.exec('PRAGMA wal_checkpoint(FULL)'); fs.copyFileSync(path.join(this.dir,'estateflow.sqlite'), file); }
  close() { this.db.close(); }
}
module.exports = { Store };
