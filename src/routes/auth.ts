import { Router, Request, Response } from 'express';
import { AuthService } from '../services/authService';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const authService = new AuthService();

/**
 * POST /api/auth/register
 * Register new user with phone number and password
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { phoneNumber, password, email } = req.body;

    if (!phoneNumber || !password) {
      return res.status(400).json({ error: 'Phone number and password required' });
    }

    // Validate phone number format
    if (!phoneNumber.match(/^\+[1-9]\d{10,14}$/)) {
      return res.status(400).json({ error: 'Invalid phone number format. Use international format (e.g., +46701234567)' });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const result = await authService.register({
      phoneNumber,
      password,
      email,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[AUTH] Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auth/login
 * Login with phone number and password
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { phoneNumber, password } = req.body;

    if (!phoneNumber || !password) {
      return res.status(400).json({ error: 'Phone number and password required' });
    }

    const result = await authService.login({
      phoneNumber,
      password,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[AUTH] Login error:', error);
    res.status(401).json({ error: error.message });
  }
});

/**
 * POST /api/auth/google
 * Login or register with Google OAuth
 * 
 * Body: { googleId, email, phoneNumber? }
 * - For existing users (matched by googleId), phoneNumber is optional
 * - For new users, phoneNumber is required
 */
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { googleId, email, phoneNumber } = req.body;

    if (!googleId || !email) {
      return res.status(400).json({ error: 'Google ID and email required' });
    }

    const result = await authService.googleAuth(googleId, email, phoneNumber);

    res.json(result);
  } catch (error: any) {
    console.error('[AUTH] Google auth error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export default router;
