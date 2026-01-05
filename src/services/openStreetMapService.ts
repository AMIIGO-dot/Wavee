import axios from 'axios';
import { Coordinates } from './gpsService';
import { GPSService } from './gpsService';

export interface POI {
  name: string;
  category: string;
  lat: number;
  lon: number;
  distance: number; // km
  bearing: number;
  direction: string;
  address?: string;
  phone?: string;
  website?: string;
  openingHours?: string;
}

export interface POISearchResult {
  query: string;
  location: Coordinates;
  radius: number;
  pois: POI[];
  count: number;
}

export type POICategory = 
  | 'gas_station'
  | 'restaurant'
  | 'cafe'
  | 'supermarket'
  | 'hospital'
  | 'pharmacy'
  | 'hotel'
  | 'camping'
  | 'shelter'
  | 'emergency'
  | 'parking'
  | 'atm';

export class OpenStreetMapService {
  private gpsService: GPSService;
  private overpassUrl = 'https://overpass-api.de/api/interpreter';

  constructor() {
    this.gpsService = new GPSService();
  }

  /**
   * Search for POIs near coordinates
   */
  async searchNearby(
    coordinates: Coordinates,
    category: POICategory,
    radiusKm: number = 10,
    limit: number = 5
  ): Promise<POISearchResult> {
    try {
      const query = this.buildOverpassQuery(coordinates, category, radiusKm);
      
      console.log('[OSM] Searching:', {
        category,
        lat: coordinates.lat,
        lon: coordinates.lon,
        radius: radiusKm,
      });
      console.log('[OSM] Overpass query:', query);

      const response = await axios.post(this.overpassUrl, query, {
        headers: { 'Content-Type': 'text/plain' },
        timeout: 10000,
      });

      console.log(`[OSM] Raw response: ${response.data.elements.length} elements`);
      
      const pois = this.parseOverpassResponse(response.data, coordinates, category);
      
      console.log(`[OSM] Parsed ${pois.length} POIs, distances:`, pois.map(p => ({ name: p.name, distance: p.distance.toFixed(1) + 'km' })));
      
      // Sort by distance and limit
      pois.sort((a, b) => a.distance - b.distance);
      const limitedPois = pois.slice(0, limit);

      console.log(`[OSM] Found ${pois.length} results, returning ${limitedPois.length}`);

      return {
        query: this.getCategoryName(category),
        location: coordinates,
        radius: radiusKm,
        pois: limitedPois,
        count: limitedPois.length,
      };
    } catch (error) {
      console.error('[OSM] Search error:', error);
      throw new Error('Failed to search OpenStreetMap');
    }
  }

  /**
   * Build Overpass API query for specific category
   */
  private buildOverpassQuery(
    coords: Coordinates,
    category: POICategory,
    radiusKm: number
  ): string {
    const radiusMeters = radiusKm * 1000;
    const bbox = this.calculateBoundingBox(coords, radiusKm);
    
    const tags = this.getCategoryTags(category);
    const tagQueries = tags.map(tag => {
      if (tag.includes('=')) {
        const [key, value] = tag.split('=');
        return `node["${key}"="${value}"](${bbox});
        way["${key}"="${value}"](${bbox});`;
      }
      return `node["${tag}"](${bbox});
      way["${tag}"](${bbox});`;
    }).join('\n');

    return `[out:json][timeout:10];
(
  ${tagQueries}
);
out center;`;
  }

  /**
   * Get OSM tags for category
   */
  private getCategoryTags(category: POICategory): string[] {
    const tagMap: Record<POICategory, string[]> = {
      gas_station: ['amenity=fuel'],
      restaurant: ['amenity=restaurant'],
      cafe: ['amenity=cafe'],
      supermarket: ['shop=supermarket', 'shop=convenience'],
      hospital: ['amenity=hospital', 'amenity=clinic'],
      pharmacy: ['amenity=pharmacy'],
      hotel: ['tourism=hotel', 'tourism=motel', 'tourism=guest_house'],
      camping: ['tourism=camp_site', 'tourism=caravan_site'],
      shelter: ['amenity=shelter', 'tourism=wilderness_hut', 'tourism=alpine_hut'],
      emergency: ['emergency=phone', 'emergency=access_point'],
      parking: ['amenity=parking'],
      atm: ['amenity=atm'],
    };

    return tagMap[category] || [];
  }

  /**
   * Calculate bounding box for radius
   */
  private calculateBoundingBox(coords: Coordinates, radiusKm: number): string {
    // Approximate degrees per km at this latitude
    const latDegPerKm = 1 / 111;
    const lonDegPerKm = 1 / (111 * Math.cos(coords.lat * Math.PI / 180));

    const latDelta = radiusKm * latDegPerKm;
    const lonDelta = radiusKm * lonDegPerKm;

    const south = coords.lat - latDelta;
    const north = coords.lat + latDelta;
    const west = coords.lon - lonDelta;
    const east = coords.lon + lonDelta;

    return `${south},${west},${north},${east}`;
  }

  /**
   * Parse Overpass API response
   */
  private parseOverpassResponse(
    data: any,
    userLocation: Coordinates,
    category: POICategory
  ): POI[] {
    if (!data.elements || !Array.isArray(data.elements)) {
      return [];
    }

    return data.elements.map((element: any) => {
      const lat = element.center?.lat || element.lat;
      const lon = element.center?.lon || element.lon;

      if (!lat || !lon) return null;

      const distance = this.gpsService.calculateDistance(
        { lat: userLocation.lat, lon: userLocation.lon },
        { lat, lon }
      );

      const bearing = this.gpsService.calculateBearing(
        { lat: userLocation.lat, lon: userLocation.lon },
        { lat, lon }
      );

      const direction = this.gpsService.getCompassDirection(bearing);

      return {
        name: element.tags?.name || `${this.getCategoryName(category)} #${element.id}`,
        category: this.getCategoryName(category),
        lat,
        lon,
        distance,
        bearing,
        direction,
        address: this.formatAddress(element.tags),
        phone: element.tags?.phone || element.tags?.['contact:phone'],
        website: element.tags?.website || element.tags?.['contact:website'],
        openingHours: element.tags?.opening_hours,
      };
    }).filter(Boolean) as POI[];
  }

  /**
   * Format address from OSM tags
   */
  private formatAddress(tags: any): string | undefined {
    if (!tags) return undefined;

    const parts = [
      tags['addr:street'],
      tags['addr:housenumber'],
      tags['addr:postcode'],
      tags['addr:city'],
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' ') : undefined;
  }

  /**
   * Get human-readable category name
   */
  private getCategoryName(category: POICategory): string {
    const names: Record<POICategory, string> = {
      gas_station: 'Bensinstation',
      restaurant: 'Restaurang',
      cafe: 'Café',
      supermarket: 'Mataffär',
      hospital: 'Sjukhus',
      pharmacy: 'Apotek',
      hotel: 'Hotell',
      camping: 'Camping',
      shelter: 'Stuga/Skydd',
      emergency: 'Nödtelefon',
      parking: 'Parkering',
      atm: 'Bankomat',
    };

    return names[category] || category;
  }

  /**
   * Format POI search result for SMS
   */
  formatSearchResult(result: POISearchResult, language: 'sv' | 'en'): string {
    if (result.count === 0) {
      return language === 'sv'
        ? `Hittade inga ${result.query.toLowerCase()} inom ${result.radius} km.`
        : `No ${result.query.toLowerCase()} found within ${result.radius} km.`;
    }

    const header = language === 'sv'
      ? `${result.query} (inom ${result.radius} km):`
      : `${result.query} (within ${result.radius} km):`;

    const poiList = result.pois.map((poi, index) => {
      const distanceStr = poi.distance < 1
        ? `${Math.round(poi.distance * 1000)}m`
        : `${poi.distance.toFixed(1)}km`;

      let line = `${index + 1}. ${poi.name}\n   ${distanceStr} ${poi.direction}`;
      
      if (poi.address) {
        line += `\n   ${poi.address}`;
      }
      
      if (poi.phone) {
        line += `\n   Tel: ${poi.phone}`;
      }

      return line;
    }).join('\n\n');

    return `${header}\n\n${poiList}`;
  }

  /**
   * Parse category from natural language query
   */
  parseCategoryFromQuery(query: string): POICategory | null {
    const normalized = query.toLowerCase();

    const patterns: Record<string, POICategory> = {
      'bensin|gas|tanken|fuel': 'gas_station',
      'restaurang|restaurant|mat|food|äta|eat': 'restaurant',
      'café|cafe|kaffe|coffee': 'cafe',
      'affär|butik|supermarket|mataffär|shop|store': 'supermarket',
      'sjukhus|hospital|läkare|doctor|akuten|emergency room': 'hospital',
      'apotek|pharmacy|medicin|medicine': 'pharmacy',
      'hotell|hotel|boende|logi|accommodation': 'hotel',
      'camping|campground|husvagn|caravan': 'camping',
      'stuga|skydd|shelter|hut|cabin': 'shelter',
      'nöd|emergency|sos|hjälp|help': 'emergency',
      'parkering|parking|parkera': 'parking',
      'bankomat|atm|kontanter|cash': 'atm',
    };

    for (const [pattern, category] of Object.entries(patterns)) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(normalized)) {
        return category;
      }
    }

    return null;
  }

  /**
   * Parse radius from query (default 10km)
   */
  parseRadiusFromQuery(query: string): number {
    const patterns = [
      /inom\s+(\d+)\s*km/i,
      /within\s+(\d+)\s*km/i,
      /(\d+)\s*km\s+radie/i,
      /(\d+)\s*km\s+radius/i,
      /(\d+)\s*mile/i,
    ];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match) {
        const value = parseInt(match[1]);
        // Convert miles to km if needed
        return pattern.source.includes('mile') ? value * 1.6 : value;
      }
    }

    return 10; // Default 10km
  }
}
