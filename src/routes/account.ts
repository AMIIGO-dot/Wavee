import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { UserService } from '../services/userService';
import { AI_CATEGORIES } from '../config/categories';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/account
 * Get current user's account info including balance
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userService = new UserService();
    const user = await userService.getUser(req.user.phone_number);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const selectedCategories = await userService.getSelectedCategories(req.user.phone_number);
    const maxCategories = await userService.getMaxCategoriesForUser(req.user.phone_number);

    res.json({
      phoneNumber: user.phone_number,
      email: user.email,
      status: user.status,
      creditsRemaining: user.credits_remaining,
      pricingTier: user.pricing_tier,
      aiTone: user.ai_tone,
      selectedCategories,
      maxCategories,
      createdAt: user.created_at,
    });
  } catch (error: any) {
    console.error('[ACCOUNT] Error fetching account:', error);
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

/**
 * PATCH /api/account/settings
 * Update user settings (AI tone, etc.)
 */
router.patch('/settings', async (req: Request, res: Response) => {
  try {
    const { aiTone } = req.body;

    if (aiTone && !['casual', 'professional', 'friendly'].includes(aiTone)) {
      return res.status(400).json({ error: 'Invalid AI tone. Must be: casual, professional, or friendly' });
    }

    const userService = new UserService();
    await userService.updateUser(req.user.phone_number, {
      ai_tone: aiTone,
    });

    res.json({ 
      success: true,
      message: 'Settings updated successfully',
    });
  } catch (error: any) {
    console.error('[ACCOUNT] Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * GET /api/account/transactions
 * Get user's transaction history
 */
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const userService = new UserService();
    const transactions = await userService.getTransactions(req.user.phone_number);

    res.json({ transactions });
  } catch (error: any) {
    console.error('[ACCOUNT] Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/**
 * GET /api/account/categories
 * Get all available AI categories
 */
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const userService = new UserService();
    const selectedCategories = await userService.getSelectedCategories(req.user.phone_number);
    const maxCategories = await userService.getMaxCategoriesForUser(req.user.phone_number);

    res.json({
      availableCategories: AI_CATEGORIES,
      selectedCategories,
      maxCategories,
    });
  } catch (error: any) {
    console.error('[ACCOUNT] Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/**
 * PATCH /api/account/categories
 * Update user's selected categories
 */
router.patch('/categories', async (req: Request, res: Response) => {
  try {
    const { categories } = req.body;

    if (!Array.isArray(categories)) {
      return res.status(400).json({ error: 'Categories must be an array' });
    }

    // Validate all category IDs
    const validCategoryIds = AI_CATEGORIES.map(c => c.id);
    const invalidCategories = categories.filter(id => !validCategoryIds.includes(id));
    
    if (invalidCategories.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid category IDs', 
        invalidCategories 
      });
    }

    // Check user's tier limit
    const userService = new UserService();
    const maxCategories = await userService.getMaxCategoriesForUser(req.user.phone_number);

    if (categories.length > maxCategories) {
      return res.status(400).json({ 
        error: `You can only select up to ${maxCategories} categories with your current plan`,
        maxCategories,
        selectedCount: categories.length,
      });
    }

    if (categories.length === 0) {
      return res.status(400).json({ error: 'You must select at least one category' });
    }

    await userService.updateSelectedCategories(req.user.phone_number, categories);

    res.json({ 
      success: true,
      message: 'Categories updated successfully',
      selectedCategories: categories,
    });
  } catch (error: any) {
    console.error('[ACCOUNT] Error updating categories:', error);
    res.status(500).json({ error: 'Failed to update categories' });
  }
});

export default router;
