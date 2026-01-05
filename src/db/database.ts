import { Pool, PoolClient } from 'pg';

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
  language?: 'sv' | 'en'; // User's preferred language (Swedish or English)
  twilio_number?: string; // The Twilio number user interacts with (+46 or +1)
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
  private pool: Pool;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required for PostgreSQL');
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    });

    console.log('[DATABASE] PostgreSQL connection pool created');
    // Initialize tables asynchronously (don't await in constructor)
    this.initialize().catch(err => {
      console.error('[DATABASE] Failed to initialize:', err);
    });
  }

  private async initialize(): Promise<void> {
    try {
      // Users table
      await this.run(`
        CREATE TABLE IF NOT EXISTS users (
          phone_number TEXT PRIMARY KEY,
          status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'inactive')),
          credits_remaining INTEGER NOT NULL DEFAULT 0,
          stripe_customer_id TEXT,
          pricing_tier TEXT CHECK(pricing_tier IN ('basic', 'pro', 'unlimited')),
          consent_timestamp TIMESTAMP,
          password_hash TEXT,
          google_id TEXT UNIQUE,
          email TEXT UNIQUE,
          ai_tone TEXT NOT NULL DEFAULT 'friendly' CHECK(ai_tone IN ('casual', 'professional', 'friendly')),
          selected_categories TEXT DEFAULT '["outdoor"]',
          language TEXT DEFAULT 'sv',
          twilio_number TEXT,
          active_agent_id INTEGER,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Sessions table
      await this.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          id SERIAL PRIMARY KEY,
          phone_number TEXT NOT NULL,
          messages TEXT NOT NULL DEFAULT '[]',
          last_ai_response TEXT,
          last_location TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (phone_number) REFERENCES users(phone_number)
        )
      `);

      // Transactions table
      await this.run(`
        CREATE TABLE IF NOT EXISTS transactions (
          id SERIAL PRIMARY KEY,
          phone_number TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('purchase', 'usage', 'refund')),
          credits_delta INTEGER NOT NULL,
          description TEXT,
          stripe_payment_id TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (phone_number) REFERENCES users(phone_number)
        )
      `);

      // Custom agents table
      await this.run(`
        CREATE TABLE IF NOT EXISTS custom_agents (
          id SERIAL PRIMARY KEY,
          phone_number TEXT NOT NULL,
          name VARCHAR(100) NOT NULL,
          description TEXT,
          system_prompt TEXT NOT NULL,
          active BOOLEAN DEFAULT false,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (phone_number) REFERENCES users(phone_number) ON DELETE CASCADE
        )
      `);

      // Indexes (PostgreSQL doesn't support DESC in CREATE INDEX directly)
      await this.run(`
        CREATE INDEX IF NOT EXISTS idx_transactions_phone 
        ON transactions(phone_number, created_at)
      `);

      await this.run(`
        CREATE INDEX IF NOT EXISTS idx_sessions_phone 
        ON sessions(phone_number, updated_at)
      `);

      await this.run(`
        CREATE INDEX IF NOT EXISTS idx_custom_agents_phone 
        ON custom_agents(phone_number, created_at)
      `);

      console.log('[DATABASE] Tables initialized successfully');
    } catch (error) {
      console.error('[DATABASE] Error initializing tables:', error);
      throw error;
    }
  }

  // Promisified methods for cleaner async/await usage
  // Convert SQLite-style ? placeholders to PostgreSQL $1, $2, $3
  private convertPlaceholders(sql: string): string {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
  }

  public async run(sql: string, params: any[] = []): Promise<void> {
    const client = await this.pool.connect();
    try {
      const pgSql = this.convertPlaceholders(sql);
      await client.query(pgSql, params);
    } finally {
      client.release();
    }
  }

  public async get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    const client = await this.pool.connect();
    try {
      const pgSql = this.convertPlaceholders(sql);
      const result = await client.query(pgSql, params);
      return result.rows[0] as T | undefined;
    } finally {
      client.release();
    }
  }

  public async all<T>(sql: string, params: any[] = []): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      const pgSql = this.convertPlaceholders(sql);
      const result = await client.query(pgSql, params);
      return result.rows as T[];
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
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

export default getDatabase;
