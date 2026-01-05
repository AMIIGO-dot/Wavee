import sqlite3 from 'sqlite3';
import { promisify } from 'util';

const sqlite = sqlite3.verbose();

export interface User {
  phone_number: string;
  status: 'pending' | 'active' | 'inactive';
  credits_remaining: number;
  stripe_customer_id?: string;
  pricing_tier?: 'basic' | 'pro' | 'unlimited';
  consent_timestamp?: string;
  password_hash?: string;
  google_id?: string;
  email?: string;
  ai_tone: 'casual' | 'professional' | 'friendly';
  selected_categories?: string; // JSON array of category IDs
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: number;
  phone_number: string;
  messages: string; // JSON array of last 3 user messages
  last_ai_response: string;
  last_location?: string; // JSON { lat, lon, timestamp }
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number;
  phone_number: string;
  type: 'purchase' | 'usage' | 'refund';
  credits_delta: number;
  description?: string;
  stripe_payment_id?: string;
  created_at: string;
}

class Database {
  private db: sqlite3.Database;

  constructor(dbPath: string = './outdoor-assistant.db') {
    this.db = new sqlite.Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.serialize(() => {
      // Users table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS users (
          phone_number TEXT PRIMARY KEY,
          status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'inactive')),
          credits_remaining INTEGER NOT NULL DEFAULT 0,
          stripe_customer_id TEXT,
          pricing_tier TEXT CHECK(pricing_tier IN ('basic', 'pro', 'unlimited')),
          consent_timestamp TEXT,
          password_hash TEXT,
          google_id TEXT UNIQUE,
          email TEXT UNIQUE,
          ai_tone TEXT NOT NULL DEFAULT 'friendly' CHECK(ai_tone IN ('casual', 'professional', 'friendly')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Sessions table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          phone_number TEXT NOT NULL,
          messages TEXT NOT NULL DEFAULT '[]',
          last_ai_response TEXT,
          last_location TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (phone_number) REFERENCES users(phone_number)
        )
      `);

      // Migration: Add last_location column if it doesn't exist
      this.db.get(`
        SELECT COUNT(*) as count FROM pragma_table_info('sessions') WHERE name='last_location'
      `, (err: Error | null, row: any) => {
        if (!err && row && row.count === 0) {
          this.db.run(`ALTER TABLE sessions ADD COLUMN last_location TEXT`, (alterErr) => {
            if (alterErr) {
              console.log('[DATABASE] Column last_location already exists or error:', alterErr.message);
            } else {
              console.log('[DATABASE] Added last_location column to sessions table');
            }
          });
        }
      });

      // Migration: Add billing and auth columns to users table
      const billingColumns = ['credits_remaining', 'stripe_customer_id', 'pricing_tier', 'consent_timestamp', 'password_hash', 'google_id', 'email', 'ai_tone', 'selected_categories'];
      billingColumns.forEach(column => {
        this.db.get(`
          SELECT COUNT(*) as count FROM pragma_table_info('users') WHERE name='${column}'
        `, (err: Error | null, row: any) => {
          if (!err && row && row.count === 0) {
            let alteration = '';
            if (column === 'credits_remaining') {
              alteration = `ALTER TABLE users ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`;
            } else if (column === 'ai_tone') {
              alteration = `ALTER TABLE users ADD COLUMN ${column} TEXT NOT NULL DEFAULT 'friendly'`;
            } else if (column === 'selected_categories') {
              alteration = `ALTER TABLE users ADD COLUMN ${column} TEXT DEFAULT '["outdoor"]'`;
            } else {
              alteration = `ALTER TABLE users ADD COLUMN ${column} TEXT`;
            }
            this.db.run(alteration, (alterErr) => {
              if (!alterErr) {
                console.log(`[DATABASE] Added ${column} column to users table`);
              }
            });
          }
        });
      });

      // Transactions table for credit usage logging
      this.db.run(`
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          phone_number TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('purchase', 'usage', 'refund')),
          credits_delta INTEGER NOT NULL,
          description TEXT,
          stripe_payment_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (phone_number) REFERENCES users(phone_number)
        )
      `);

      // Index for transactions
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_transactions_phone 
        ON transactions(phone_number, created_at DESC)
      `);

      // Index for faster session lookups
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_sessions_phone 
        ON sessions(phone_number, updated_at DESC)
      `);
    });
  }

  // Promisified methods for cleaner async/await usage
  public run(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T | undefined);
      });
    });
  }

  public all<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

// Singleton instance
let dbInstance: Database | null = null;

export function getDatabase(): Database {
  if (!dbInstance) {
    dbInstance = new Database();
  }
  return dbInstance;
}

export default Database;
