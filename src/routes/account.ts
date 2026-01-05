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

/**
 * GET /api/account/agents
 * Get all custom agents for the current user
 */
router.get('/agents', async (req: Request, res: Response) => {
  try {
    const userService = new UserService();
    const agents = await userService.getCustomAgents(req.user.phone_number);
    
    res.json({ agents });
  } catch (error: any) {
    console.error('[ACCOUNT] Error fetching custom agents:', error);
    res.status(500).json({ error: 'Failed to fetch custom agents' });
  }
});

/**
 * POST /api/account/agents
 * Create a new custom agent
 */
router.post('/agents', async (req: Request, res: Response) => {
  try {
    const { name, description, systemPrompt } = req.body;

    if (!name || !systemPrompt) {
      return res.status(400).json({ error: 'Name and system prompt are required' });
    }

    if (name.length > 100) {
      return res.status(400).json({ error: 'Name must be 100 characters or less' });
    }

    if (systemPrompt.length > 2000) {
      return res.status(400).json({ error: 'System prompt must be 2000 characters or less' });
    }

    const userService = new UserService();
    
    // Check agent limit based on pricing tier
    const user = await userService.getUser(req.user.phone_number);
    const currentAgents = await userService.getCustomAgents(req.user.phone_number);
    
    const agentLimits: Record<string, number> = {
      'basic': 0,
      'pro': 3,
      'unlimited': 10,
    };
    
    const limit = agentLimits[user?.pricing_tier || 'basic'] || 0;
    
    if (currentAgents.length >= limit) {
      return res.status(403).json({ 
        error: `Your ${user?.pricing_tier || 'basic'} plan allows ${limit} custom agents. Upgrade to create more.` 
      });
    }

    const agentId = await userService.createCustomAgent(
      req.user.phone_number,
      name,
      description || '',
      systemPrompt
    );

    res.status(201).json({ 
      success: true,
      message: 'Custom agent created successfully',
      agentId,
    });
  } catch (error: any) {
    console.error('[ACCOUNT] Error creating custom agent:', error);
    res.status(500).json({ error: 'Failed to create custom agent' });
  }
});

/**
 * PUT /api/account/agents/:id
 * Update a custom agent
 */
router.put('/agents/:id', async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.id);
    const { name, description, systemPrompt } = req.body;

    if (isNaN(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    if (!name || !systemPrompt) {
      return res.status(400).json({ error: 'Name and system prompt are required' });
    }

    if (name.length > 100) {
      return res.status(400).json({ error: 'Name must be 100 characters or less' });
    }

    if (systemPrompt.length > 2000) {
      return res.status(400).json({ error: 'System prompt must be 2000 characters or less' });
    }

    const userService = new UserService();
    
    // Verify ownership
    const agent = await userService.getCustomAgent(agentId);
    if (!agent || agent.phone_number !== req.user.phone_number) {
      return res.status(404).json({ error: 'Custom agent not found' });
    }

    await userService.updateCustomAgent(agentId, name, description || '', systemPrompt);

    res.json({ 
      success: true,
      message: 'Custom agent updated successfully',
    });
  } catch (error: any) {
    console.error('[ACCOUNT] Error updating custom agent:', error);
    res.status(500).json({ error: 'Failed to update custom agent' });
  }
});

/**
 * DELETE /api/account/agents/:id
 * Delete a custom agent
 */
router.delete('/agents/:id', async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.id);

    if (isNaN(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    const userService = new UserService();
    
    // Verify ownership
    const agent = await userService.getCustomAgent(agentId);
    if (!agent || agent.phone_number !== req.user.phone_number) {
      return res.status(404).json({ error: 'Custom agent not found' });
    }

    await userService.deleteCustomAgent(agentId);

    res.json({ 
      success: true,
      message: 'Custom agent deleted successfully',
    });
  } catch (error: any) {
    console.error('[ACCOUNT] Error deleting custom agent:', error);
    res.status(500).json({ error: 'Failed to delete custom agent' });
  }
});

/**
 * POST /api/account/agents/:id/activate
 * Activate a custom agent
 */
router.post('/agents/:id/activate', async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.id);

    if (isNaN(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    const userService = new UserService();
    
    // Verify ownership
    const agent = await userService.getCustomAgent(agentId);
    if (!agent || agent.phone_number !== req.user.phone_number) {
      return res.status(404).json({ error: 'Custom agent not found' });
    }

    await userService.activateCustomAgent(req.user.phone_number, agentId);

    res.json({ 
      success: true,
      message: 'Custom agent activated successfully',
    });
  } catch (error: any) {
    console.error('[ACCOUNT] Error activating custom agent:', error);
    res.status(500).json({ error: 'Failed to activate custom agent' });
  }
});

/**
 * POST /api/account/agents/deactivate
 * Deactivate custom agent (return to category-based mode)
 */
router.post('/agents/deactivate', async (req: Request, res: Response) => {
  try {
    const userService = new UserService();
    await userService.deactivateCustomAgent(req.user.phone_number);

    res.json({ 
      success: true,
      message: 'Custom agent deactivated successfully',
    });
  } catch (error: any) {
    console.error('[ACCOUNT] Error deactivating custom agent:', error);
    res.status(500).json({ 
      error: 'Failed to deactivate custom agent',
      details: error.message 
    });
  }
});

export default router;
