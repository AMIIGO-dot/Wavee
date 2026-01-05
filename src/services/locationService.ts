import { Coordinates, GPSService } from './gpsService';

interface PointOfInterest {
  name: string;
  type: 'shelter' | 'cabin' | 'water' | 'emergency' | 'parking';
  coordinates: Coordinates;
  description?: string;
  phone?: string;
}

// Swedish mountain shelters and emergency points
const SWEDISH_POIS: PointOfInterest[] = [
  // Kebnekaise area
  { name: 'Kebnekaise Fjällstation', type: 'cabin', coordinates: { lat: 67.9023, lon: 18.5429 }, phone: '+46980550000' },
  { name: 'STF Singi', type: 'cabin', coordinates: { lat: 67.8654, lon: 18.2967 } },
  { name: 'STF Sälka', type: 'cabin', coordinates: { lat: 67.6989, lon: 18.0234 } },
  { name: 'Nikkaluokta', type: 'parking', coordinates: { lat: 67.8503, lon: 19.0123 } },
  
  // Abisko area
  { name: 'STF Abisko Turiststation', type: 'cabin', coordinates: { lat: 68.3544, lon: 18.7889 }, phone: '+46980402000' },
  { name: 'Abiskojaure', type: 'cabin', coordinates: { lat: 68.3289, lon: 18.1567 } },
  
  // Sarek area
  { name: 'Aktse', type: 'cabin', coordinates: { lat: 67.3456, lon: 17.6234 } },
  { name: 'Sitojaure', type: 'cabin', coordinates: { lat: 67.4123, lon: 17.8901 } },
  
  // Jämtland
  { name: 'STF Sylarna', type: 'cabin', coordinates: { lat: 63.1345, lon: 12.4567 } },
  { name: 'STF Blåhammaren', type: 'cabin', coordinates: { lat: 63.2789, lon: 12.3456 } },
  
  // Dalarna
  { name: 'Grövelsjön Fjällstation', type: 'cabin', coordinates: { lat: 61.6234, lon: 12.2345 } },
  
  // Emergency services (regional)
  { name: 'SOS Alarm', type: 'emergency', coordinates: { lat: 59.3293, lon: 18.0686 }, phone: '112', description: 'Nödnummer' },
];

export class LocationService {
  private gpsService: GPSService;

  constructor() {
    this.gpsService = new GPSService();
  }

  /**
   * Find nearest points of interest
   */
  findNearest(
    userLocation: Coordinates,
    type?: 'shelter' | 'cabin' | 'water' | 'emergency' | 'parking',
    limit: number = 5
  ): Array<PointOfInterest & { distance: number; bearing: number; direction: string }> {
    let pois = SWEDISH_POIS;
    
    if (type) {
      pois = pois.filter(poi => poi.type === type);
    }

    const results = pois.map(poi => {
      const distance = this.gpsService.calculateDistance(userLocation, poi.coordinates);
      const bearing = this.gpsService.calculateBearing(userLocation, poi.coordinates);
      const direction = this.gpsService.getCompassDirection(bearing, 'sv');
      
      return {
        ...poi,
        distance,
        bearing,
        direction,
      };
    });

    // Sort by distance
    results.sort((a, b) => a.distance - b.distance);

    return results.slice(0, limit);
  }

  /**
   * Format nearest locations for SMS response
   */
  formatNearestResponse(
    userLocation: Coordinates,
    type: 'shelter' | 'cabin' | 'water' | 'emergency' | 'all',
    language: 'sv' | 'en' = 'sv'
  ): string {
    const typeFilter = type === 'all' ? undefined : type;
    const nearest = this.findNearest(userLocation, typeFilter, 3);

    if (nearest.length === 0) {
      return language === 'sv'
        ? 'Ingen plats hittades i närheten. Du kanske är utanför täckningsområdet.'
        : 'No locations found nearby. You might be outside coverage area.';
    }

    const typeLabel = this.getTypeLabel(type, language);
    let response = language === 'sv'
      ? `📍 ${typeLabel} närmast dig:\n\n`
      : `📍 Nearest ${typeLabel}:\n\n`;

    for (const poi of nearest) {
      const distanceStr = poi.distance < 1 
        ? `${Math.round(poi.distance * 1000)}m`
        : `${poi.distance.toFixed(1)}km`;
      
      response += `• ${poi.name}\n`;
      response += `  ${distanceStr} ${poi.direction}`;
      
      if (poi.phone) {
        response += `\n  ☎️ ${poi.phone}`;
      }
      response += '\n\n';
    }

    response += language === 'sv'
      ? `📌 Din position: ${this.gpsService.formatCoordinates(userLocation)}`
      : `📌 Your position: ${this.gpsService.formatCoordinates(userLocation, 'en')}`;

    return response.trim();
  }

  /**
   * Get safety recommendations based on location
   */
  getSafetyRecommendations(location: Coordinates, language: 'sv' | 'en' = 'sv'): string {
    const isInMountains = location.lat > 63; // Approximate northern Sweden/mountains
    const nearest = this.findNearest(location, 'cabin', 1);
    const nearestDistance = nearest.length > 0 ? nearest[0].distance : 999;

    if (language === 'sv') {
      if (nearestDistance > 20) {
        return '⚠️ Du är långt från närmaste stuga. Se till att:\n' +
               '• Ha extra mat och vatten\n' +
               '• Fulltankad telefon/powerbank\n' +
               '• Väderutrustning för snabba förändringar\n' +
               '• Informera någon om din rutt';
      } else if (nearestDistance > 10) {
        return `ℹ️ Närmaste stuga: ${nearest[0].name} (${nearestDistance.toFixed(1)}km ${nearest[0].direction})\n` +
               '• Håll koll på väder\n' +
               '• Ha reservplan';
      } else {
        return `✅ Närmaste stuga: ${nearest[0].name} (${nearestDistance.toFixed(1)}km ${nearest[0].direction})`;
      }
    } else {
      if (nearestDistance > 20) {
        return '⚠️ You are far from nearest shelter. Make sure:\n' +
               '• Extra food and water\n' +
               '• Fully charged phone/powerbank\n' +
               '• Weather gear for rapid changes\n' +
               '• Someone knows your route';
      } else if (nearestDistance > 10) {
        return `ℹ️ Nearest shelter: ${nearest[0].name} (${nearestDistance.toFixed(1)}km ${nearest[0].direction})\n` +
               '• Monitor weather\n' +
               '• Have backup plan';
      } else {
        return `✅ Nearest shelter: ${nearest[0].name} (${nearestDistance.toFixed(1)}km ${nearest[0].direction})`;
      }
    }
  }

  private getTypeLabel(type: string, language: 'sv' | 'en'): string {
    const labels: Record<string, { sv: string; en: string }> = {
      shelter: { sv: 'Skydd/Vindskydd', en: 'Shelters' },
      cabin: { sv: 'Stugor', en: 'Cabins' },
      water: { sv: 'Vattenplatser', en: 'Water sources' },
      emergency: { sv: 'Nödhjälp', en: 'Emergency services' },
      all: { sv: 'Platser', en: 'Places' },
    };
    return labels[type]?.[language] || type;
  }
}
