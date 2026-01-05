import axios from 'axios';

interface WeatherData {
  temperature: number;
  windSpeed: number;
  precipitation: number;
  cloudiness: number;
  humidity: number;
  weatherSymbol: number;
}

interface OpenMeteoLocation {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
}

interface Location {
  lat: number;
  lon: number;
  name: string;
}

// Common Swedish locations
const SWEDISH_LOCATIONS: Record<string, Location> = {
  stockholm: { lat: 59.3293, lon: 18.0686, name: 'Stockholm' },
  göteborg: { lat: 57.7089, lon: 11.9746, name: 'Göteborg' },
  gothenburg: { lat: 57.7089, lon: 11.9746, name: 'Göteborg' },
  malmö: { lat: 55.6050, lon: 13.0038, name: 'Malmö' },
  malmo: { lat: 55.6050, lon: 13.0038, name: 'Malmö' },
  uppsala: { lat: 59.8586, lon: 17.6389, name: 'Uppsala' },
  västerås: { lat: 59.6099, lon: 16.5448, name: 'Västerås' },
  vasteras: { lat: 59.6099, lon: 16.5448, name: 'Västerås' },
  örebro: { lat: 59.2753, lon: 15.2134, name: 'Örebro' },
  orebro: { lat: 59.2753, lon: 15.2134, name: 'Örebro' },
  linköping: { lat: 58.4108, lon: 15.6214, name: 'Linköping' },
  linkoping: { lat: 58.4108, lon: 15.6214, name: 'Linköping' },
  helsingborg: { lat: 56.0465, lon: 12.6945, name: 'Helsingborg' },
  jönköping: { lat: 57.7826, lon: 14.1618, name: 'Jönköping' },
  jonkoping: { lat: 57.7826, lon: 14.1618, name: 'Jönköping' },
  norrköping: { lat: 58.5877, lon: 16.1924, name: 'Norrköping' },
  norrkoping: { lat: 58.5877, lon: 16.1924, name: 'Norrköping' },
  lund: { lat: 55.7047, lon: 13.1910, name: 'Lund' },
  umeå: { lat: 63.8258, lon: 20.2630, name: 'Umeå' },
  umea: { lat: 63.8258, lon: 20.2630, name: 'Umeå' },
  gävle: { lat: 60.6749, lon: 17.1413, name: 'Gävle' },
  gavle: { lat: 60.6749, lon: 17.1413, name: 'Gävle' },
  borås: { lat: 57.7210, lon: 12.9401, name: 'Borås' },
  boras: { lat: 57.7210, lon: 12.9401, name: 'Borås' },
  eskilstuna: { lat: 59.3711, lon: 16.5077, name: 'Eskilstuna' },
  karlstad: { lat: 59.3793, lon: 13.5036, name: 'Karlstad' },
  sundsvall: { lat: 62.3908, lon: 17.3069, name: 'Sundsvall' },
  luleå: { lat: 65.5848, lon: 22.1547, name: 'Luleå' },
  lulea: { lat: 65.5848, lon: 22.1547, name: 'Luleå' },
};

export class WeatherService {
  private readonly SMHI_BASE_URL = 'https://opendata-download-metfcst.smhi.se/api';
  private readonly OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1';
  private readonly OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1';

  /**
   * Get weather forecast for coordinates
   */
  async getWeatherByCoordinates(lat: number, lon: number, language: 'sv' | 'en' = 'sv', daysAhead: number = 0): Promise<string> {
    try {
      const weatherData = await this.fetchSMHIWeather(lat, lon, daysAhead);
      const locationLabel = language === 'sv' ? 'Din position' : 'Your position';
      return this.formatWeatherResponse(weatherData, locationLabel, language, daysAhead);
    } catch (error) {
      console.error('[WEATHER] Error fetching weather for coordinates:', error);
      return language === 'sv'
        ? 'Kunde inte hämta väderdata just nu. Försök igen senare.'
        : 'Could not fetch weather data right now. Try again later.';
    }
  }

  /**
   * Get weather forecast for a location name
   */
  async getWeather(locationName: string, language: 'sv' | 'en' = 'sv', daysAhead: number = 0): Promise<string> {
    try {
      // First try Swedish locations with SMHI
      const swedishLocation = this.findLocation(locationName);
      if (swedishLocation) {
        console.log(`[WEATHER] Using SMHI for Swedish location: ${swedishLocation.name}`);
        const weatherData = await this.fetchSMHIWeather(swedishLocation.lat, swedishLocation.lon, daysAhead);
        return this.formatWeatherResponse(weatherData, swedishLocation.name, language, daysAhead);
      }

      // If not Swedish, try international with Open-Meteo
      console.log(`[WEATHER] Searching international location: ${locationName}`);
      const location = await this.geocodeLocation(locationName);
      if (!location) {
        return language === 'sv' 
          ? `Kunde inte hitta platsen "${locationName}". Kontrollera stavningen.`
          : `Could not find location "${locationName}". Check spelling.`;
      }

      console.log(`[WEATHER] Using Open-Meteo for: ${location.name}, ${location.country}`);
      const weatherData = await this.fetchOpenMeteoWeather(location.latitude, location.longitude, daysAhead);
      const locationLabel = `${location.name}, ${location.country}`;
      return this.formatWeatherResponse(weatherData, locationLabel, language, daysAhead);
    } catch (error) {
      console.error('[WEATHER] Error fetching weather:', error);
      return language === 'sv'
        ? 'Kunde inte hämta väderdata just nu. Försök igen senare.'
        : 'Could not fetch weather data right now. Try again later.';
    }
  }

  /**
   * Find location from name (case-insensitive, handles Swedish characters)
   */
  private findLocation(name: string): Location | null {
    const normalized = name.toLowerCase().trim();
    return SWEDISH_LOCATIONS[normalized] || null;
  }

  /**
   * Geocode location using Open-Meteo Geocoding API
   */
  private async geocodeLocation(locationName: string): Promise<OpenMeteoLocation | null> {
    try {
      const url = `${this.OPEN_METEO_GEOCODING_URL}/search?name=${encodeURIComponent(locationName)}&count=1&language=en&format=json`;
      const response = await axios.get(url, { timeout: 10000 });
      
      if (!response.data.results || response.data.results.length === 0) {
        return null;
      }

      const result = response.data.results[0];
      return {
        name: result.name,
        latitude: result.latitude,
        longitude: result.longitude,
        country: result.country || ''
      };
    } catch (error) {
      console.error('[WEATHER] Geocoding error:', error);
      return null;
    }
  }

  /**
   * Fetch weather data from Open-Meteo API
   */
  private async fetchOpenMeteoWeather(lat: number, lon: number, daysAhead: number = 0): Promise<WeatherData> {
    try {
      const url = `${this.OPEN_METEO_BASE_URL}/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,windspeed_10m,relativehumidity_2m,cloudcover,weathercode&timezone=auto&forecast_days=7`;
      const response = await axios.get(url, { timeout: 10000 });
      
      const hourly = response.data.hourly;
      if (!hourly || !hourly.time || hourly.time.length === 0) {
        throw new Error('No weather data available');
      }

      // Calculate target time (noon of the target day)
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + daysAhead);
      targetDate.setHours(12, 0, 0, 0);

      // Find closest forecast to target time (noon)
      let closestIndex = 0;
      let minDiff = Math.abs(new Date(hourly.time[0]).getTime() - targetDate.getTime());

      for (let i = 0; i < hourly.time.length; i++) {
        const forecastTime = new Date(hourly.time[i]).getTime();
        const diff = Math.abs(forecastTime - targetDate.getTime());
        
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = i;
        }
      }

      // Convert WMO weather code to SMHI-like symbol for compatibility
      const weatherCode = hourly.weathercode[closestIndex];
      const weatherSymbol = this.convertWMOCodeToSMHISymbol(weatherCode);

      return {
        temperature: hourly.temperature_2m[closestIndex] || 0,
        windSpeed: hourly.windspeed_10m[closestIndex] || 0,
        precipitation: hourly.precipitation[closestIndex] || 0,
        cloudiness: hourly.cloudcover[closestIndex] || 0,
        humidity: hourly.relativehumidity_2m[closestIndex] || 0,
        weatherSymbol: weatherSymbol
      };
    } catch (error) {
      console.error('[WEATHER] Open-Meteo API error:', error);
      throw error;
    }
  }

  /**
   * Convert WMO weather code to SMHI symbol for consistency
   */
  private convertWMOCodeToSMHISymbol(wmoCode: number): number {
    // WMO Code: https://open-meteo.com/en/docs
    // 0: Clear sky -> 1
    // 1-3: Partly cloudy -> 2-4
    // 45, 48: Fog -> 7
    // 51-55: Drizzle -> 18-19
    // 61-65: Rain -> 18-20
    // 71-75: Snow -> 25-27
    // 80-82: Rain showers -> 8-10
    // 85-86: Snow showers -> 15-17
    // 95-99: Thunderstorm -> 11

    if (wmoCode === 0) return 1; // Clear
    if (wmoCode === 1) return 2; // Nearly clear
    if (wmoCode === 2) return 3; // Variable cloudiness
    if (wmoCode === 3) return 4; // Halfclear
    if (wmoCode === 45 || wmoCode === 48) return 7; // Fog
    if (wmoCode >= 51 && wmoCode <= 55) return 18; // Light drizzle
    if (wmoCode >= 61 && wmoCode <= 63) return 18; // Light rain
    if (wmoCode >= 64 && wmoCode <= 65) return 19; // Moderate rain
    if (wmoCode >= 71 && wmoCode <= 73) return 25; // Light snow
    if (wmoCode >= 74 && wmoCode <= 75) return 26; // Moderate snow
    if (wmoCode >= 80 && wmoCode <= 81) return 8; // Light rain showers
    if (wmoCode === 82) return 9; // Moderate rain showers
    if (wmoCode >= 85 && wmoCode <= 86) return 15; // Light snow showers
    if (wmoCode >= 95 && wmoCode <= 99) return 11; // Thunderstorm
    
    return 5; // Default to cloudy
  }

  /**
   * Fetch weather data from SMHI API
   */
  private async fetchSMHIWeather(lat: number, lon: number, daysAhead: number = 0): Promise<WeatherData> {
    const url = `${this.SMHI_BASE_URL}/category/pmp3g/version/2/geotype/point/lon/${lon}/lat/${lat}/data.json`;
    
    const response = await axios.get(url, { timeout: 10000 });
    const timeSeries = response.data.timeSeries;
    
    if (!timeSeries || timeSeries.length === 0) {
      throw new Error('No weather data available');
    }

    // Calculate target time (noon of the target day)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysAhead);
    targetDate.setHours(12, 0, 0, 0); // Set to noon

    // Find closest forecast to target time
    let closestForecast = timeSeries[0];
    let minDiff = Math.abs(new Date(timeSeries[0].validTime).getTime() - targetDate.getTime());

    for (const forecast of timeSeries) {
      const forecastTime = new Date(forecast.validTime).getTime();
      const diff = Math.abs(forecastTime - targetDate.getTime());
      
      if (diff < minDiff) {
        minDiff = diff;
        closestForecast = forecast;
      }
      
      // Stop if we're past the target time
      if (forecastTime > targetDate.getTime() + 24 * 60 * 60 * 1000) {
        break;
      }
    }

    const parameters = closestForecast.parameters;

    return {
      temperature: this.getParameter(parameters, 't'),
      windSpeed: this.getParameter(parameters, 'ws'),
      precipitation: this.getParameter(parameters, 'pmin'),
      cloudiness: this.getParameter(parameters, 'tcc_mean'),
      humidity: this.getParameter(parameters, 'r'),
      weatherSymbol: this.getParameter(parameters, 'Wsymb2'),
    };
  }

  /**
   * Extract parameter value from SMHI data
   */
  private getParameter(parameters: any[], name: string): number {
    const param = parameters.find((p) => p.name === name);
    return param ? param.values[0] : 0;
  }

  /**
   * Format weather response for SMS
   */
  private formatWeatherResponse(weather: WeatherData, location: string, language: 'sv' | 'en', daysAhead: number = 0): string {
    const weatherCondition = this.getWeatherCondition(weather.weatherSymbol, language);
    
    const timeLabel = this.getTimeLabel(daysAhead, language);
    
    if (language === 'sv') {
      return `📍 ${location} ${timeLabel}\n` +
        `• ${weatherCondition}\n` +
        `• Temp: ${Math.round(weather.temperature)}°C\n` +
        `• Vind: ${Math.round(weather.windSpeed)} m/s\n` +
        `• Nederbörd: ${Math.round(weather.precipitation)} mm/h\n` +
        `• Luftfuktighet: ${Math.round(weather.humidity)}%`;
    } else {
      return `📍 ${location} ${timeLabel}\n` +
        `• ${weatherCondition}\n` +
        `• Temp: ${Math.round(weather.temperature)}°C\n` +
        `• Wind: ${Math.round(weather.windSpeed)} m/s\n` +
        `• Precip: ${Math.round(weather.precipitation)} mm/h\n` +
        `• Humidity: ${Math.round(weather.humidity)}%`;
    }
  }

  /**
   * Get time label for forecast
   */
  private getTimeLabel(daysAhead: number, language: 'sv' | 'en'): string {
    if (daysAhead === 0) {
      return language === 'sv' ? '(nu)' : '(now)';
    } else if (daysAhead === 1) {
      return language === 'sv' ? '(imorgon)' : '(tomorrow)';
    } else if (daysAhead === 2) {
      return language === 'sv' ? '(i övermorgon)' : '(day after tomorrow)';
    } else {
      return language === 'sv' ? `(om ${daysAhead} dagar)` : `(in ${daysAhead} days)`;
    }
  }

  /**
   * Get weather condition description from SMHI symbol
   */
  private getWeatherCondition(symbol: number, language: 'sv' | 'en'): string {
    const conditions: Record<number, { sv: string; en: string }> = {
      1: { sv: 'Klart', en: 'Clear' },
      2: { sv: 'Lätt molnighet', en: 'Nearly clear' },
      3: { sv: 'Halvklart', en: 'Variable cloudiness' },
      4: { sv: 'Molnigt', en: 'Halfclear' },
      5: { sv: 'Mulet', en: 'Cloudy' },
      6: { sv: 'Mulet', en: 'Overcast' },
      7: { sv: 'Dimma', en: 'Fog' },
      8: { sv: 'Lätta regnskurar', en: 'Light rain showers' },
      9: { sv: 'Måttliga regnskurar', en: 'Moderate rain showers' },
      10: { sv: 'Kraftiga regnskurar', en: 'Heavy rain showers' },
      11: { sv: 'Åska', en: 'Thunderstorm' },
      12: { sv: 'Lätta snöbyar', en: 'Light sleet showers' },
      13: { sv: 'Måttliga snöbyar', en: 'Moderate sleet showers' },
      14: { sv: 'Kraftiga snöbyar', en: 'Heavy sleet showers' },
      15: { sv: 'Lätt snöfall', en: 'Light snow showers' },
      16: { sv: 'Måttligt snöfall', en: 'Moderate snow showers' },
      17: { sv: 'Kraftigt snöfall', en: 'Heavy snow showers' },
      18: { sv: 'Lätt regn', en: 'Light rain' },
      19: { sv: 'Måttligt regn', en: 'Moderate rain' },
      20: { sv: 'Kraftigt regn', en: 'Heavy rain' },
      21: { sv: 'Åska', en: 'Thunder' },
      22: { sv: 'Lätt snöblandat regn', en: 'Light sleet' },
      23: { sv: 'Måttligt snöblandat regn', en: 'Moderate sleet' },
      24: { sv: 'Kraftigt snöblandat regn', en: 'Heavy sleet' },
      25: { sv: 'Lätt snöfall', en: 'Light snowfall' },
      26: { sv: 'Måttligt snöfall', en: 'Moderate snowfall' },
      27: { sv: 'Kraftigt snöfall', en: 'Heavy snowfall' },
    };

    const condition = conditions[symbol];
    return condition ? condition[language] : (language === 'sv' ? 'Okänt' : 'Unknown');
  }

  /**
   * Check if a message is a weather command
   */
  isWeatherCommand(message: string): boolean {
    const normalized = message.toLowerCase().trim();
    return normalized.startsWith('väder') || 
           normalized.startsWith('vädret') ||
           normalized.startsWith('weather');
  }

  /**
   * Extract location from weather command
   */
  extractLocation(message: string): string | null {
    const normalized = message.trim();
    
    // Match patterns: "VÄDER Stockholm", "Weather in Stockholm", "VÄDER i Stockholm"
    const patterns = [
      /^(?:väder|vädret|weather)\s+(?:i|in|för|for)?\s*(.+)$/i,
      /^(?:väder|vädret|weather)\s+(.+)$/i,
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }
}
