import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';

const app: Express = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// --- Endpoint 1: GET /health-perfect ---
// A fully compliant, secure endpoint with correct HTTP semantics
app.get('/health-perfect', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// --- Endpoint 2: GET /user-leaky ---
// Returns user data with excessive PII or internal fields
app.get('/user-leaky', (_req: Request, res: Response) => {
  res.status(200).json({
    id: 12345,
    email: 'john.doe@example.com',
    name: 'John Doe',
    ssn: '123-45-6789',
    creditCardNumber: '4111-1111-1111-1111',
    password: 'hashed_but_still_exposed_p@ssw0rd123',
    internalUserId: 'usr_internal_abc123xyz',
    databaseId: 'db_row_98765',
    apiKey: 'sk_live_abcdef123456789',
    phoneNumber: '+1-555-123-4567',
    address: {
      street: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    },
    createdAt: '2023-01-15T10:30:00Z',
    lastLogin: '2024-01-10T08:45:00Z'
  });
});

// --- Endpoint 3: GET /debug-error ---
// Intentionally throws an error and returns stack trace / internal error details
app.get('/debug-error', (_req: Request, res: Response) => {
  try {
    // Simulate an error
    const obj: any = null;
    obj.nonExistentMethod();
  } catch (error) {
    const err = error as Error;
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
      stack: err.stack,
      debugInfo: {
        nodeVersion: process.version,
        platform: process.platform,
        memoryUsage: process.memoryUsage(),
        env: {
          NODE_ENV: process.env.NODE_ENV,
          DATABASE_URL: process.env.DATABASE_URL || 'postgres://admin:secret@localhost:5432/mydb',
          SECRET_KEY: process.env.SECRET_KEY || 'super_secret_key_12345'
        }
      }
    });
  }
});

// --- Endpoint 4: POST /items-injection ---
// Accepts JSON and naively interpolates user input (injection risk)
app.post('/items-injection', (req: Request, res: Response) => {
  const { name, query } = req.body;

  // Simulate dangerous string interpolation (SQL injection pattern)
  const unsafeQuery = `SELECT * FROM items WHERE name = '${name}' AND ${query}`;

  // Simulate command injection pattern
  const unsafeCommand = `ls -la /data/${name}`;

  // Simulate template injection
  const unsafeTemplate = `<div>Welcome, ${name}! Your query: ${query}</div>`;

  res.status(200).json({
    message: 'Item processed',
    generatedQuery: unsafeQuery,
    generatedCommand: unsafeCommand,
    generatedHtml: unsafeTemplate,
    input: req.body
  });
});

// --- Endpoint 5: GET /cors-wildcard ---
// Misconfigured CORS headers
app.get('/cors-wildcard', (_req: Request, res: Response) => {
  // Dangerous CORS misconfiguration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Authorization, X-Api-Key, X-Internal-Token');

  res.status(200).json({
    data: 'Sensitive data accessible with wildcard CORS',
    internalToken: 'tok_internal_xyz789',
    sessionId: 'sess_abc123'
  });
});

// Apply permissive CORS to entire app (another bad practice to demonstrate)
app.use(cors({
  origin: '*',
  credentials: true
}));

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    details: err.message,
    stack: err.stack
  });
});

app.listen(PORT, () => {
  console.log(`Sample API running on port ${PORT}`);
});

export default app;
