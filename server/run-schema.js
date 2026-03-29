import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, '..', 'schema.sql');
const sql = readFileSync(schemaPath, 'utf8');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(sql);
  console.log('Schema applied successfully.');
} catch (err) {
  console.error('Schema error:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
