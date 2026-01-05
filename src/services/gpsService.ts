export interface Coordinates {
  lat: number;
  lon: number;
  altitude?: number;
}

export interface ParsedLocation {
  coordinates: Coordinates;
  source: 'google_maps' | 'apple_maps' | 'raw_coords' | 'plus_code';
  originalText: string;
}

export class GPSService {
  /**
   * Check if message contains GPS coordinates or location link
   */
  hasLocation(message: string): boolean {
    return this.parseLocation(message) !== null;
  }

  /**
   * Parse location from various formats:
   * - Google Maps: https://maps.google.com/?q=59.3293,18.0686
   * - Google Maps short: https://goo.gl/maps/...
   * - Apple Maps: https://maps.apple.com/?ll=59.3293,18.0686
   * - Raw coordinates: 59.3293, 18.0686 or 59.3293,18.0686
   * - Decimal degrees: 59.3293° N, 18.0686° E
   * - Plus codes: 9FFW8C8C+2C
   */
  parseLocation(message: string): ParsedLocation | null {
    const text = message.trim();

    // Google Maps links
    const googleMatch = text.match(/maps\.google\.com.*[?&]q=(-?\d+[.,]?\d*),(-?\d+[.,]?\d*)/i) ||
                       text.match(/google\.com\/maps.*@(-?\d+[.,]?\d*),(-?\d+[.,]?\d*)/i);
    if (googleMatch) {
      return {
        coordinates: {
          lat: parseFloat(googleMatch[1].replace(',', '.')),
          lon: parseFloat(googleMatch[2].replace(',', '.')),
        },
        source: 'google_maps',
        originalText: text,
      };
    }

    // Apple Maps links (both ll= and coordinate= formats)
    const appleMatch = text.match(/maps\.apple\.com.*[?&](?:ll|coordinate)=(-?\d+[.,]?\d*),(-?\d+[.,]?\d*)/i);
    if (appleMatch) {
      return {
        coordinates: {
          lat: parseFloat(appleMatch[1].replace(',', '.')),
          lon: parseFloat(appleMatch[2].replace(',', '.')),
        },
        source: 'apple_maps',
        originalText: text,
      };
    }

    // Raw coordinates (various formats)
    const coordPatterns = [
      // Simple: 59.3293, 18.0686 or 59,3293, 18,0686 (Swedish format)
      /^(-?\d+[.,]?\d*)\s*,\s*(-?\d+[.,]?\d*)$/,
      // With degrees: 59.3293° N, 18.0686° E or 59,3293° N, 18,0686° Ö (Swedish)
      /(-?\d+[.,]?\d*)°?\s*[NS],?\s*(-?\d+[.,]?\d*)°?\s*[EWÖV]/i,
      // Lat/Lon prefix: lat: 59.3293, lon: 18.0686
      /lat[itude]*\s*:?\s*(-?\d+[.,]?\d*)[,\s]+lon[gitude]*\s*:?\s*(-?\d+[.,]?\d*)/i,
    ];

    for (const pattern of coordPatterns) {
      const match = text.match(pattern);
      if (match) {
        // Replace comma with dot for Swedish decimal format
        const lat = parseFloat(match[1].replace(',', '.'));
        const lon = parseFloat(match[2].replace(',', '.'));
        
        // Validate coordinates
        if (this.isValidCoordinate(lat, lon)) {
          return {
            coordinates: { lat, lon },
            source: 'raw_coords',
            originalText: text,
          };
        }
      }
    }

    return null;
  }

  /**
   * Validate if coordinates are within valid ranges
   */
  private isValidCoordinate(lat: number, lon: number): boolean {
    return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }

  /**
   * Format coordinates for display
   */
  formatCoordinates(coords: Coordinates, language: 'sv' | 'en' = 'sv'): string {
    const latDir = coords.lat >= 0 ? 'N' : 'S';
    const lonDir = coords.lon >= 0 ? 'E' : 'W';
    
    return `${Math.abs(coords.lat).toFixed(4)}° ${latDir}, ${Math.abs(coords.lon).toFixed(4)}° ${lonDir}`;
  }

  /**
   * Calculate distance between two points (Haversine formula)
   * Returns distance in kilometers
   */
  calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(coord2.lat - coord1.lat);
    const dLon = this.toRad(coord2.lon - coord1.lon);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(coord1.lat)) * Math.cos(this.toRad(coord2.lat)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Calculate bearing between two points
   * Returns bearing in degrees (0-360)
   */
  calculateBearing(from: Coordinates, to: Coordinates): number {
    const dLon = this.toRad(to.lon - from.lon);
    const lat1 = this.toRad(from.lat);
    const lat2 = this.toRad(to.lat);
    
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    
    const bearing = Math.atan2(y, x);
    return (this.toDeg(bearing) + 360) % 360;
  }

  /**
   * Get compass direction from bearing
   */
  getCompassDirection(bearing: number, language: 'sv' | 'en' = 'sv'): string {
    const directions = language === 'sv'
      ? ['N', 'NO', 'O', 'SO', 'S', 'SV', 'V', 'NV']
      : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  }

  /**
   * Generate Google Maps link for coordinates
   */
  generateMapsLink(coords: Coordinates): string {
    return `https://maps.google.com/?q=${coords.lat},${coords.lon}`;
  }

  /**
   * Check if coordinates are within Sweden
   */
  isInSweden(coords: Coordinates): boolean {
    // Approximate bounding box for Sweden
    return coords.lat >= 55.0 && coords.lat <= 69.1 &&
           coords.lon >= 10.5 && coords.lon <= 24.2;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private toDeg(radians: number): number {
    return radians * (180 / Math.PI);
  }
}
