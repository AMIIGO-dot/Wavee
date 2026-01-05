import { Router, Request, Response } from 'express';
import { UserService } from '../services/userService';
import { SessionService } from '../services/sessionService';
import { AIService } from '../services/aiService';
import { TwilioService } from '../services/twilioService';
import { WeatherService } from '../services/weatherService';
import { GPSService } from '../services/gpsService';
import { LocationService } from '../services/locationService';
import { OpenStreetMapService } from '../services/openStreetMapService';
import { RateLimiter } from '../services/rateLimiter';
import { 
  normalizePhoneNumber, 
  isYesConfirmation, 
  isMoreCommand,
  isLocationQueryCommand,
  isStopCommand,
  isHelpCommand,
  sanitizeInput 
} from '../utils/text';
import { CREDIT_COSTS } from '../config/pricing';

const router = Router();

// Lazy initialization to ensure dotenv loads first
let userService: UserService;
let sessionService: SessionService;
let aiService: AIService;
let twilioService: TwilioService;
let weatherService: WeatherService;
let gpsService: GPSService;
let locationService: LocationService;
let osmService: OpenStreetMapService;
let rateLimiter: RateLimiter;

function initServices() {
  if (!userService) {
    userService = new UserService();
    sessionService = new SessionService();
    aiService = new AIService();
    twilioService = new TwilioService();
    weatherService = new WeatherService();
    gpsService = new GPSService();
    locationService = new LocationService();
    osmService = new OpenStreetMapService();
    rateLimiter = new RateLimiter(5, 30, 200); // 5/min, 30/hour, 200/day
  }
}

/**
 * POST /sms/incoming
 * Webhook endpoint for incoming SMS messages from Twilio
 */
router.post('/incoming', async (req: Request, res: Response) => {
  try {
    initServices(); // Initialize services on first request
    
    const { From, To, Body, NumMedia, MediaUrl0, MediaContentType0 } = req.body;

    if (!From || !To) {
      console.error('[SMS] Missing From or To field:', req.body);
      return res.status(400).send('Missing required fields');
    }

    const phoneNumber = normalizePhoneNumber(From);
    const twilioNumber = normalizePhoneNumber(To);
    const messageBody = Body ? sanitizeInput(Body) : '';
    const hasMedia = parseInt(NumMedia || '0') > 0;
    const mediaUrl = hasMedia ? MediaUrl0 : null;
    const mediaType = hasMedia ? MediaContentType0 : null;

    // Detect language based on which Twilio number received the message
    const detectedLanguage: 'sv' | 'en' = twilioNumber.startsWith('+46') ? 'sv' : 'en';

    console.log('[SMS] Incoming message:', {
      from: phoneNumber,
      to: twilioNumber,
      body: messageBody,
      hasMedia,
      mediaType,
      detectedLanguage,
      timestamp: new Date().toISOString(),
    });

    // Check if user exists
    const userExists = await userService.userExists(phoneNumber);

    if (!userExists) {
      // New user - create and send opt-in message
      await userService.createUser(phoneNumber, {
        language: detectedLanguage,
        twilio_number: twilioNumber,
      });
      await twilioService.sendOptInMessage(phoneNumber, detectedLanguage);
      
      return res.status(200).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    // Always use the language based on which number they're messaging
    // This allows users to switch between Swedish and English numbers freely
    const userLanguage = detectedLanguage;
    const language = userLanguage; // Use for all message handling
    
    // Update database to keep it in sync
    const user = await userService.getUser(phoneNumber);
    if (user) {
      if (user.twilio_number !== twilioNumber) {
        await userService.setTwilioNumber(phoneNumber, twilioNumber);
        console.log(`[SMS] User ${phoneNumber} switched to ${twilioNumber}`);
      }
      if (user.language !== detectedLanguage) {
        await userService.setLanguage(phoneNumber, detectedLanguage);
        console.log(`[SMS] User ${phoneNumber} language updated to ${detectedLanguage}`);
      }
    }

    // Check if user is pending activation
    const isPending = await userService.isUserPending(phoneNumber);
    const isActive = await userService.isUserActive(phoneNumber);

    // If user is not active (pending or inactive), handle opt-in
    if (!isActive) {
      // Handle opt-in confirmation for both pending and inactive users
      if (isYesConfirmation(messageBody)) {
        await userService.activateUser(phoneNumber);
        await userService.logConsent(phoneNumber); // Log consent timestamp
        
        // Give free trial credits ONLY to pending users (not to reactivated users)
        if (isPending) {
          const { FREE_TRIAL_CREDITS } = await import('../config/pricing');
          await userService.addCredits(phoneNumber, FREE_TRIAL_CREDITS);
          await userService.logTransaction(phoneNumber, 'purchase', FREE_TRIAL_CREDITS, 'Free trial credits');
        }
        
        await twilioService.sendActivationMessage(phoneNumber, userLanguage);
        
        console.log(`[SMS] User ${phoneNumber} activated (was ${isPending ? 'pending' : 'inactive'})`);
      } else {
        // Remind them to reply YES
        await twilioService.sendOptInMessage(phoneNumber, userLanguage);
      }
      
      return res.status(200).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    // Check rate limits
    const rateLimit = rateLimiter.checkLimits(phoneNumber);
    if (!rateLimit.allowed) {
      await twilioService.sendSMS(phoneNumber, rateLimit.reason!, userLanguage);
      console.log(`[RATE LIMIT] Blocked message from ${phoneNumber}: ${rateLimit.reason}`);
      return res.status(200).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    // Active user - process the message
    await handleActiveUserMessage(phoneNumber, messageBody, mediaUrl, mediaType, userLanguage);

    res.status(200).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error) {
    console.error('[SMS] Error processing incoming message:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * Handle messages from active users
 */
async function handleActiveUserMessage(
  phoneNumber: string,
  messageBody: string,
  mediaUrl: string | null = null,
  mediaType: string | null = null,
  language: 'sv' | 'en' = 'sv'
): Promise<void> {
  try {
    // Check for image first (can be sent without text)
    if (mediaUrl && mediaType?.startsWith('image/')) {
      console.log(`[IMAGE] Processing image from ${phoneNumber}`);
      await handleImageAnalysis(phoneNumber, mediaUrl, messageBody || 'What is this?', language);
      return;
    }

    // If no message body and no image, ignore
    if (!messageBody || messageBody.trim().length === 0) {
      console.log('[SMS] Empty message received, ignoring');
      return;
    }

    // Check for STOP command
    if (isStopCommand(messageBody)) {
      await handleStopCommand(phoneNumber, language);
      return;
    }

    // Check for HELP command
    if (isHelpCommand(messageBody)) {
      await handleHelpCommand(phoneNumber, language);
      return;
    }

    // Check if message contains GPS coordinates first
    const parsedLocation = gpsService.parseLocation(messageBody);
    
    if (parsedLocation) {
      await handleGPSMessage(phoneNumber, parsedLocation, messageBody, language);
      return;
    }

    // Check if this is a place search query (e.g., "nearest gas station")
    const placeSearchResult = await handlePlaceSearch(phoneNumber, messageBody, language);
    if (placeSearchResult) {
      return;
    }

    // Check if this is a WHERE AM I command
    if (isLocationQueryCommand(messageBody)) {
      await handleLocationQuery(phoneNumber, language);
      return;
    }

    // Check if this is a MORE command
    if (isMoreCommand(messageBody)) {
      // Check credits before responding
      const hasCredits = await userService.hasCredits(phoneNumber, 1);
      if (!hasCredits) {
        await handleNoCredits(phoneNumber, language);
        return;
      }
      
      await handleMoreCommand(phoneNumber, language);
      
      // Deduct 1 credit for expanded response
      await userService.deductCredits(phoneNumber, 1);
      await userService.logTransaction(phoneNumber, 'usage', -1, 'Expanded response (MORE)');
      
      return;
    }

    // Check if this is a natural weather query (AI will detect)
    const weatherResponse = await aiService.handleWeatherQuery(messageBody);
    if (weatherResponse) {
      // Check credits before responding
      const hasCredits = await userService.hasCredits(phoneNumber, 1);
      if (!hasCredits) {
        await handleNoCredits(phoneNumber, language);
        return;
      }
      
      // Deduct 1 credit for conversation
      await userService.deductCredits(phoneNumber, 1);
      await userService.logTransaction(phoneNumber, 'usage', -1, 'Weather query');
      
      // Update session so MORE command works
      await sessionService.updateSession(phoneNumber, messageBody, weatherResponse);
      
      await twilioService.sendSMS(phoneNumber, weatherResponse, language);
      console.log(`[WEATHER] Natural language forecast sent to ${phoneNumber}`);
      return;
    }

    // Check credits before responding
    const hasCredits = await userService.hasCredits(phoneNumber, 1);
    if (!hasCredits) {
      await handleNoCredits(phoneNumber, language);
      return;
    }

    // Get conversation context
    const context = await sessionService.getContext(phoneNumber);

    // Check if user has an active custom agent
    const customAgent = await userService.getActiveCustomAgent(phoneNumber);
    
    let aiResponse: string;
    
    if (customAgent) {
      // Use custom agent's system prompt
      console.log(`[SMS] Using custom agent: ${customAgent.name} (ID: ${customAgent.id})`);
      aiResponse = await aiService.generateResponseWithCustomPrompt(
        messageBody,
        context.messages,
        context.lastAiResponse,
        customAgent.system_prompt,
        language
      );
    } else {
      // Get user's selected categories
      const userCategories = await userService.getSelectedCategories(phoneNumber);

      // Generate AI response with user's categories
      aiResponse = await aiService.generateResponse(
        messageBody,
        context.messages,
        context.lastAiResponse,
        userCategories,
        language
      );
    }

    // Update session with new message and response
    await sessionService.updateSession(phoneNumber, messageBody, aiResponse);

    // Deduct 1 credit for conversation (question + answer)
    await userService.deductCredits(phoneNumber, 1);
    await userService.logTransaction(phoneNumber, 'usage', -1, 'AI conversation');

    // Send response via SMS
    await twilioService.sendSMS(phoneNumber, aiResponse, language);

    console.log(`[SMS] Response sent to ${phoneNumber}`);
  } catch (error) {
    console.error('[SMS] Error handling active user message:', error);
    
    // Send error message to user
    await twilioService.sendSMS(
      phoneNumber,
      'Sorry, I encountered an error processing your request. Please try again.'
    );
  }
}

/**
 * Handle MORE command to expand previous response
 */
async function handleMoreCommand(phoneNumber: string, language: 'sv' | 'en' = 'sv'): Promise<void> {
  try {
    // Get session context
    const context = await sessionService.getContext(phoneNumber);

    if (!context.lastAiResponse || context.messages.length === 0) {
      await twilioService.sendSMS(
        phoneNumber,
        'No previous response to expand. Please ask a question first.'
      );
      return;
    }

    // Get the last user message
    const lastUserMessage = context.messages[context.messages.length - 1];

    // Get user's selected categories
    const userCategories = await userService.getSelectedCategories(phoneNumber);

    // Expand the previous response with user's categories
    const expandedResponse = await aiService.expandResponse(
      context.lastAiResponse,
      lastUserMessage,
      userCategories
    );

    // Update session (don't add new user message, just update AI response)
    await sessionService.updateSession(phoneNumber, null, expandedResponse);

    // Send expanded response
    await twilioService.sendSMS(phoneNumber, expandedResponse);

    console.log(`[SMS] Expanded response sent to ${phoneNumber}`);
  } catch (error) {
    console.error('[SMS] Error handling MORE command:', error);
    
    await twilioService.sendSMS(
      phoneNumber,
      'Sorry, I couldn\'t expand the previous response. Please ask a specific question.'
    );
  }
}

/**
 * Handle image analysis (MMS with image)
 */
async function handleImageAnalysis(
  phoneNumber: string,
  imageUrl: string,
  userQuestion: string,
  language: 'sv' | 'en' = 'sv'
): Promise<void> {
  try {
    // Check credits before analyzing
    const hasCredits = await userService.hasCredits(phoneNumber, 1);
    if (!hasCredits) {
      await handleNoCredits(phoneNumber, language);
      return;
    }

    // Get user's selected categories
    const userCategories = await userService.getSelectedCategories(phoneNumber);

    console.log(`[IMAGE] Analyzing image with question: "${userQuestion}"`);

    // Analyze image with AI
    const aiResponse = await aiService.analyzeImage(
      imageUrl,
      userQuestion,
      userCategories,
      language
    );

    // Update session with new message and response
    await sessionService.updateSession(phoneNumber, `[Image] ${userQuestion}`, aiResponse);

    // Deduct 1 credit for conversation
    await userService.deductCredits(phoneNumber, 1);
    await userService.logTransaction(phoneNumber, 'usage', -1, 'AI conversation (image analysis)');

    // Send response
    await twilioService.sendSMS(phoneNumber, aiResponse, language);
    console.log(`[IMAGE] Analysis sent to ${phoneNumber}`);
  } catch (error) {
    console.error('[IMAGE] Error analyzing image:', error);
    
    const errorMsg = language === 'en'
      ? 'Unable to analyze image. Please try again or send a text question.'
      : 'Kunde inte analysera bilden. Försök igen eller skicka en textfråga.';
    await twilioService.sendSMS(phoneNumber, errorMsg, language);
  }
}

/**
 * Handle WHERE AM I command - return saved location
 */
async function handleLocationQuery(phoneNumber: string, language: 'sv' | 'en' = 'sv'): Promise<void> {
  try {
    const lastLocation = await sessionService.getLastLocation(phoneNumber);

    if (!lastLocation) {
      const response = 
        'No saved location found. Share your position via:\n' +
        '• Send GPS coordinates (e.g. 59.3293, 18.0686)\n' +
        '• Share from Google/Apple Maps\n' +
        '• Share location from your phone';
      
      await twilioService.sendSMS(phoneNumber, response);
      return;
    }

    const { lat, lon } = lastLocation;
    
    // Format coordinates nicely
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    const latStr = Math.abs(lat).toFixed(4);
    const lonStr = Math.abs(lon).toFixed(4);
    
    // Create Google Maps link
    const mapsLink = `https://maps.google.com/?q=${lat},${lon}`;
    
    const response = 
      `Your last known position:\n` +
      `${latStr}°${latDir}, ${lonStr}°${lonDir}\n\n` +
      `View on map:\n${mapsLink}`;
    
    await twilioService.sendSMS(phoneNumber, response);
    console.log(`[LOCATION] Sent saved location to ${phoneNumber}`);
  } catch (error) {
    console.error('[LOCATION] Error handling location query:', error);
    
    await twilioService.sendSMS(
      phoneNumber,
      'Error retrieving your location. Please try again.'
    );
  }
}

/**
 * Handle STOP command - deactivate user
 */
async function handleStopCommand(phoneNumber: string, language: 'sv' | 'en' = 'sv'): Promise<void> {
  try {
    await userService.deactivateUser(phoneNumber);
    
    const messages = {
      sv: 'Du har avregistrerats. Tack for att du anvant WAVEE. For att aktivera igen, besok var hemsida och kop ett nytt paket.',
      en: 'You have been unsubscribed. Thank you for using WAVEE. To reactivate, visit our website and purchase a new package.'
    };
    
    await twilioService.sendSMS(phoneNumber, messages[language], language);
    
    console.log(`[STOP] User deactivated: ${phoneNumber}`);
  } catch (error) {
    console.error('[STOP] Error:', error);
  }
}

/**
 * Handle HELP command - send usage info
 */
async function handleHelpCommand(phoneNumber: string, language: 'sv' | 'en' = 'sv'): Promise<void> {
  try {
    const user = await userService.getUser(phoneNumber);
    const credits = user?.credits_remaining || 0;
    
    const messages = {
      sv: `WAVEE SMS Assistant\n\nDitt saldo: ${credits} meddelanden\n\nExempel pa fragor:\n- Vad blir det for vader i Stockholm imorgon?\n- Dela GPS-position + narmaste sjukhus\n- Hur overlever jag i snostorm?\n\nKommandon:\n- STOP - Avregistrera\n- HELP - Denna hjalp\n\nSupport: wavee.app`,
      en: `WAVEE SMS Assistant\n\nYour balance: ${credits} messages\n\nExample questions:\n- What's the weather in Seattle tomorrow?\n- Share GPS-position + nearest hospital\n- How to survive a snowstorm?\n\nCommands:\n- STOP - Unsubscribe\n- HELP - This help\n\nSupport: wavee.app`
    };

    await twilioService.sendSMS(phoneNumber, messages[language], language);
    
    console.log(`[HELP] Help sent to: ${phoneNumber}`);
  } catch (error) {
    console.error('[HELP] Error:', error);
  }
}

/**
 * Handle no credits situation
 */
async function handleNoCredits(phoneNumber: string, language: 'sv' | 'en' = 'sv'): Promise<void> {
  try {
    const user = await userService.getUser(phoneNumber);
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    
    const messages = {
      sv: `Du har inga credits kvar!\n\nDitt saldo: ${user?.credits_remaining || 0} meddelanden\n\nKop fler pa: ${baseUrl}\n\nPaket:\n- Starter: 30 meddelanden - 79 kr\n- Pro: 100 meddelanden - 199 kr\n- Premium: 350 meddelanden - 499 kr`,
      en: `You're out of credits!\n\nYour balance: ${user?.credits_remaining || 0} messages\n\nBuy more at: ${baseUrl}\n\nPackages:\n- Starter: 30 messages - $9\n- Pro: 100 messages - $22\n- Premium: 350 messages - $55`
    };

    await twilioService.sendSMS(phoneNumber, messages[language], language);
    
    console.log(`[NO CREDITS] Notice sent to: ${phoneNumber}`);
  } catch (error) {
    console.error('[NO CREDITS] Error:', error);
  }
}

/**
 * Handle weather command
 */
async function handleWeatherCommand(
  phoneNumber: string,
  messageBody: string
): Promise<void> {
  try {
    // Extract location from message
    const location = weatherService.extractLocation(messageBody);
    
    if (!location) {
      const language = messageBody.toLowerCase().startsWith('väder') ? 'sv' : 'en';
      const errorMsg = language === 'sv'
        ? 'Vänligen ange en plats. T.ex: "VÄDER Stockholm"'
        : 'Please specify a location. E.g: "WEATHER Stockholm"';
      
      await twilioService.sendSMS(phoneNumber, errorMsg);
      return;
    }

    // Detect language
    const language = messageBody.toLowerCase().startsWith('väder') ? 'sv' : 'en';

    // Get weather forecast
    const weatherResponse = await weatherService.getWeather(location, language);

    // Send weather response
    await twilioService.sendSMS(phoneNumber, weatherResponse);

    console.log(`[WEATHER] Forecast sent to ${phoneNumber} for ${location}`);
  } catch (error) {
    console.error('[SMS] Error handling weather command:', error);
    
    const errorMsg = 'Could not fetch weather data. Please try again later.';
    await twilioService.sendSMS(phoneNumber, errorMsg);
  }
}

/**
 * Handle GPS location message
 */
async function handleGPSMessage(
  phoneNumber: string,
  location: any,
  originalMessage: string,
  language: 'sv' | 'en' = 'sv'
): Promise<void> {
  try {
    const { coordinates } = location;
    
    console.log(`[GPS] Location received from ${phoneNumber}:`, coordinates);

    // Save location for future place searches
    await sessionService.saveLocation(phoneNumber, coordinates.lat, coordinates.lon);

    // Check if user included a follow-up question
    const followUp = originalMessage.toLowerCase();
    const language = followUp.includes('väder') || followUp.includes('närmaste') ? 'sv' : 'en';

    // First, check if this is a place search query (e.g., "närmaste sjukhus", "hitta bensinstation")
    const category = osmService.parseCategoryFromQuery(followUp);
    if (category) {
      // This is a place search with GPS coordinates
      const radius = osmService.parseRadiusFromQuery(followUp);
      console.log(`[GPS+PLACE] Searching for ${category} within ${radius}km from GPS location`);
      
      const result = await osmService.searchNearby(coordinates, category, radius);
      const response = osmService.formatSearchResult(result, language);
      
      await twilioService.sendSMS(phoneNumber, response);
      console.log(`[GPS+PLACE] Sent ${result.count} ${category} results to ${phoneNumber}`);
      return;
    }

    let response = '';

    // Check what user wants to know
    if (followUp.includes('väder') || followUp.includes('weather')) {
      // Weather for their location
      response = await weatherService.getWeatherByCoordinates(
        coordinates.lat,
        coordinates.lon,
        language
      );
    } else if (followUp.includes('närmaste') || followUp.includes('nearest') || 
               followUp.includes('skydd') || followUp.includes('shelter') ||
               followUp.includes('stuga') || followUp.includes('cabin')) {
      // Find nearest shelters (fjällstugor from static database)
      response = locationService.formatNearestResponse(coordinates, 'cabin', language);
    } else if (followUp.includes('nöd') || followUp.includes('emergency') || followUp.includes('hjälp')) {
      // Emergency services
      response = locationService.formatNearestResponse(coordinates, 'emergency', language);
    } else {
      // Default: Just confirm position saved, keep it simple
      const coordsFormatted = gpsService.formatCoordinates(coordinates, language);

      if (language === 'sv') {
        response = `📍 Position sparad!\n${coordsFormatted}\n\n` +
                  `Du kan nu använda:\n` +
                  `• "NÄRMASTE SJUKHUS"\n` +
                  `• "VÄDER HÄR"\n` +
                  `• "VAR ÄR JAG"`;
      } else {
        response = `📍 Position saved!\n${coordsFormatted}\n\n` +
                  `You can now use:\n` +
                  `• "NEAREST HOSPITAL"\n` +
                  `• "WEATHER HERE"\n` +
                  `• "WHERE AM I"`;
      }
    }

    await twilioService.sendSMS(phoneNumber, response);
    console.log(`[GPS] Location saved confirmation sent to ${phoneNumber}`);
  } catch (error) {
    console.error('[SMS] Error handling GPS message:', error);
    
    const errorMsg = 'Could not process your location. Please try again.';
    await twilioService.sendSMS(phoneNumber, errorMsg);
  }
}

/**
 * Handle place search queries (e.g., "nearest gas station")
 */
async function handlePlaceSearch(
  phoneNumber: string,
  messageBody: string,
  language: 'sv' | 'en' = 'sv'
): Promise<boolean> {
  try {
    // Check if this looks like a place search query
    const placeKeywords = [
      'närmaste', 'nearest', 'hitta', 'find', 'var är', 'where is',
      'show me', 'visa', 'sök', 'search', 'leta', 'look for'
    ];

    const hasPlaceKeyword = placeKeywords.some(keyword => 
      messageBody.toLowerCase().includes(keyword)
    );

    if (!hasPlaceKeyword) {
      return false; // Not a place search query
    }

    // Try to detect category
    const category = osmService.parseCategoryFromQuery(messageBody);
    if (!category) {
      return false; // No recognizable category
    }

    // Try to get user's last known location from session
    const context = await sessionService.getContext(phoneNumber);
    const lastLocation = await sessionService.getLastLocation(phoneNumber);

    if (!lastLocation) {
      // Ask user to share location first
      const language = messageBody.match(/[åäöÅÄÖ]/) ? 'sv' : 'en';
      const response = language === 'sv'
        ? `För att hitta närmaste ${osmService['getCategoryName'](category).toLowerCase()}, dela din position via GPS eller Apple/Google Maps-länk först.`
        : `To find the nearest ${category.replace('_', ' ')}, please share your location via GPS or Apple/Google Maps link first.`;
      
      await twilioService.sendSMS(phoneNumber, response);
      return true;
    }

    // Parse radius from query (default 10km)
    const radius = osmService.parseRadiusFromQuery(messageBody);

    // Search nearby places
    console.log(`[PLACE SEARCH] ${phoneNumber} searching for ${category} within ${radius}km`);
    
    const result = await osmService.searchNearby(lastLocation, category, radius);
    const language = messageBody.match(/[åäöÅÄÖ]/) ? 'sv' : 'en';
    const response = osmService.formatSearchResult(result, language);

    // Check credits before sending
    const hasCredits = await userService.hasCredits(phoneNumber, 1);
    if (!hasCredits) {
      await handleNoCredits(phoneNumber);
      return true;
    }

    // Deduct 1 credit for place search
    await userService.deductCredits(phoneNumber, 1);
    await userService.logTransaction(phoneNumber, 'usage', -1, 'Place search');

    // Update session so MORE command works
    await sessionService.updateSession(phoneNumber, messageBody, response);

    await twilioService.sendSMS(phoneNumber, response);
    console.log(`[PLACE SEARCH] Sent ${result.count} results to ${phoneNumber}`);

    return true;
  } catch (error) {
    console.error('[PLACE SEARCH] Error:', error);
    return false; // Let other handlers try
  }
}

export default router;
