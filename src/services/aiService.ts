import OpenAI from 'openai';
import { SURVIVAL_SYSTEM_PROMPT } from '../prompts/survivalSystemPrompt';
import { getSystemPromptForCategories } from '../prompts/categoryPrompts';
import { WeatherService } from './weatherService';
import { normalizeSmsText } from '../utils/normalizeSmsText';

export class AIService {
  private client: OpenAI;
  private weatherService: WeatherService;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.weatherService = new WeatherService();
  }

  /**
   * Check if message is a weather query and handle it
   */
  async handleWeatherQuery(userMessage: string): Promise<string | null> {
    const normalized = userMessage.toLowerCase();
    
    // Detect weather-related keywords
    const weatherKeywords = ['väder', 'vädret', 'weather', 'prognos', 'forecast', 'temperatur', 'temperature'];
    const hasWeatherKeyword = weatherKeywords.some(keyword => normalized.includes(keyword));
    
    if (!hasWeatherKeyword) {
      return null; // Not a weather query
    }

    // Detect language
    const language = (normalized.includes('väder') || normalized.includes('imorgon') || normalized.includes('övermorgon')) ? 'sv' : 'en';

    // Extract location using AI
    const location = await this.extractLocationFromQuery(userMessage);
    if (!location) {
      return language === 'sv'
        ? 'Vilken plats vill du veta vädret för? T.ex "Stockholm", "Göteborg", etc.'
        : 'Which location would you like weather for? E.g "Stockholm", "Göteborg", etc.';
    }

    // Detect time frame
    let daysAhead = 0;
    if (normalized.includes('imorgon') || normalized.includes('tomorrow')) {
      daysAhead = 1;
    } else if (normalized.includes('övermorgon') || normalized.includes('day after tomorrow')) {
      daysAhead = 2;
    } else if (normalized.match(/om \d+ dag/)) {
      const match = normalized.match(/om (\d+) dag/);
      daysAhead = match ? parseInt(match[1]) : 0;
    } else if (normalized.match(/in \d+ day/)) {
      const match = normalized.match(/in (\d+) day/);
      daysAhead = match ? parseInt(match[1]) : 0;
    }

    // Get weather
    return await this.weatherService.getWeather(location, language, daysAhead);
  }

  /**
   * Extract location from natural language query using AI
   */
  private async extractLocationFromQuery(query: string): Promise<string | null> {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Extract ONLY the city/location name from the weather query. Return just the city name, nothing else. If no city found, return "NONE".',
          },
          {
            role: 'user',
            content: query,
          },
        ],
        max_tokens: 20,
        temperature: 0,
      });

      const location = response.choices[0]?.message?.content?.trim();
      return (location && location !== 'NONE') ? location : null;
    } catch (error) {
      console.error('[AI] Error extracting location:', error);
      return null;
    }
  }

  /**
   * Generate a response for a user query
   */
  async generateResponse(
    userMessage: string,
    conversationHistory: string[] = [],
    lastAiResponse: string | null = null,
    userCategories: string[] = ['outdoor'],
    language: 'sv' | 'en' = 'sv'
  ): Promise<string> {
    try {
      // Get system prompt based on user's selected categories and language
      const systemPrompt = getSystemPromptForCategories(userCategories, language);

      // Build conversation context
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
      ];

      // Add conversation history
      if (conversationHistory.length > 0 && lastAiResponse) {
        // Add previous exchanges
        for (let i = 0; i < conversationHistory.length - 1; i++) {
          messages.push({
            role: 'user',
            content: conversationHistory[i],
          });
          
          // Add AI response if it's not the last message
          if (i < conversationHistory.length - 2 || lastAiResponse) {
            messages.push({
              role: 'assistant',
              content: lastAiResponse,
            });
          }
        }
      }

      // Add current user message
      messages.push({
        role: 'user',
        content: userMessage,
      });

      console.log('[AI] Generating response...');
      console.log('[AI] Prompt context:', {
        historyLength: conversationHistory.length,
        currentMessage: userMessage,
      });

      const completion = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 180, // Hard limit to prevent cost spikes (1-3 SMS segments)
      });

      const rawResponse = completion.choices[0]?.message?.content || 
        'Unable to generate response. Please try again.';

      // Normalize for SMS (GSM-7 encoding)
      const response = normalizeSmsText(rawResponse);

      console.log('[AI] Response generated:', response);

      return response;
    } catch (error) {
      console.error('[AI] Error generating response:', error);
      throw new Error('Failed to generate AI response');
    }
  }

  /**
   * Expand the previous response (for MORE command)
   */
  async expandResponse(
    lastAiResponse: string,
    originalUserMessage: string,
    userCategories: string[] = ['outdoor']
  ): Promise<string> {
    try {
      const systemPrompt = getSystemPromptForCategories(userCategories);

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: systemPrompt + '\n\nThe user has requested MORE detail on your previous response. Expand ONLY on what you already said. Do NOT introduce new topics. Keep it SMS-friendly (concise but more detailed).',
        },
        {
          role: 'user',
          content: originalUserMessage,
        },
        {
          role: 'assistant',
          content: lastAiResponse,
        },
        {
          role: 'user',
          content: 'MORE',
        },
      ];

      console.log('[AI] Expanding previous response...');

      const completion = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 180, // Hard limit for cost control
      });

      const rawResponse = completion.choices[0]?.message?.content || 
        'Unable to expand response. Please ask a specific question instead.';

      // Normalize for SMS (GSM-7 encoding)
      const response = normalizeSmsText(rawResponse);

      console.log('[AI] Expanded response:', response);

      return response;
    } catch (error) {
      console.error('[AI] Error expanding response:', error);
      throw new Error('Failed to expand response');
    }
  }

  /**
   * Analyze an image with AI vision
   */
  async analyzeImage(
    imageUrl: string,
    userQuestion: string,
    userCategories: string[] = ['outdoor'],
    language: 'sv' | 'en' = 'sv'
  ): Promise<string> {
    try {
      const systemPrompt = getSystemPromptForCategories(userCategories, language);

      console.log('[AI] Analyzing image:', imageUrl);

      const imageInstructions = language === 'en'
        ? '\n\nYou are analyzing an image sent via MMS. Be practical and safety-focused. Identify plants, animals, terrain, weather, or hazards as relevant.'
        : '\n\nDu analyserar en bild som skickats via MMS. Var praktisk och säkerhetsfokuserad. Identifiera växter, djur, terräng, väder eller faror när det är relevant.';

      const defaultQuestion = language === 'en' ? 'What is this? Is it safe?' : 'Vad är detta? Är det säkert?';

      const completion = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt + imageInstructions,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userQuestion || defaultQuestion,
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          },
        ],
        temperature: 0.7,
        max_tokens: 180,
      });

      const defaultError = language === 'en'
        ? 'Unable to analyze image. Please try again.'
        : 'Kunde inte analysera bilden. Försök igen.';

      const rawResponse = completion.choices[0]?.message?.content || defaultError;

      // Normalize for SMS
      const response = normalizeSmsText(rawResponse);

      console.log('[AI] Image analysis complete:', response);

      return response;
    } catch (error) {
      console.error('[AI] Error analyzing image:', error);
      throw new Error('Failed to analyze image');
    }
  }
}
