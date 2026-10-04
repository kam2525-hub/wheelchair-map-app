// WheeLife - OpenStreetMap Overpass API 連携サービス
// 車いすタグ (wheelchair=yes, limited, designated, toilets:wheelchair) を高速検索

class OsmService {
  constructor() {
    this.cache = new Map();
    this.endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://lz4.overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter'
    ];
    this.currentEndpointIndex = 0;
  }

  getEndpoint() {
    return this.endpoints[this.currentEndpointIndex];
  }

  rotateEndpoint() {
    this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.endpoints.length;
    console.log(`[OSM] Switching to Overpass endpoint: ${this.getEndpoint()}`);
  }

  /**
   * 指定座標の周辺（radiusメートル）からバリアフリー・周辺スポットを取得
   */
  async fetchNearbyWheelchairSpots(lat, lng, radius = 1500) {
    const cacheKey = `${lat.toFixed(3)}_${lng.toFixed(3)}_${radius}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // 日本国内の実態に合わせた柔軟なクエリ
    // 1. 車いす対応トイレ / 公衆トイレ
    // 2. 飲食店 (カフェ、ファストフード、一般飲食店)
    // 3. レジャー・商業施設・公園
    const query = `
      [out:json][timeout:10];
      (
        node["amenity"="toilets"](around:${radius},${lat},${lng});
        way["amenity"="toilets"](around:${radius},${lat},${lng});

        node["amenity"~"restaurant|cafe|fast_food"](around:${radius},${lat},${lng});
        way["amenity"~"restaurant|cafe|fast_food"](around:${radius},${lat},${lng});

        node["leisure"~"park|cinema|pitch|playground"](around:${radius},${lat},${lng});
        node["tourism"~"museum|zoo|aquarium|theme_park|attraction"](around:${radius},${lat},${lng});
        node["wheelchair"="yes"](around:${radius},${lat},${lng});
      );
      out center 60;
    `;

    // 8秒でタイムアウトするAbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(this.getEndpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Overpass HTTP error: ${response.status}`);
      }

      const data = await response.json();
      const parsedSpots = this.parseOverpassElements(data.elements || [], lat, lng);
      
      this.cache.set(cacheKey, parsedSpots);
      return parsedSpots;
    } catch (error) {
      clearTimeout(timeoutId);
      console.warn('[OSM] Overpass API query failed or timed out:', error.message);
      this.rotateEndpoint();
      return [];
    }
  }

  /**
   * Overpass要素をSpot形式に変換
   */
  parseOverpassElements(elements, userLat, userLng) {
    const results = [];
    const seenNames = new Set();

    for (const el of elements) {
      const tags = el.tags || {};
      const spotLat = el.lat || (el.center && el.center.lat);
      const spotLng = el.lon || (el.center && el.center.lon);

      if (!spotLat || !spotLng) continue;

      let name = tags.name || tags['name:ja'] || '';
      let category = 'play';
      let categoryName = 'レジャー・スポット';

      // カテゴリ判定
      if (tags.amenity === 'toilets') {
        category = 'toilet';
        categoryName = tags['toilets:wheelchair'] === 'yes' ? '多機能トイレ (車いす対応)' : '公衆トイレ';
        if (!name) name = tags.description || '多機能公衆トイレ';
      } else if (tags.amenity && ['restaurant', 'cafe', 'fast_food', 'bar', 'pub'].includes(tags.amenity)) {
        category = 'food';
        categoryName = tags.cuisine ? `${tags.cuisine}・飲食` : (tags.amenity === 'cafe' ? 'カフェ' : '飲食店');
        if (!name) name = tags.brand || '飲食店';
      } else {
        category = 'play';
        if (tags.tourism === 'museum') categoryName = '博物館・美術館';
        else if (tags.leisure === 'park') categoryName = '公園・緑地';
        else if (tags.tourism === 'zoo' || tags.tourism === 'aquarium') categoryName = '動植物園・水族館';
        else if (tags.leisure === 'cinema') categoryName = '映画館';
        else categoryName = 'レジャー・遊び場';
        if (!name) name = tags.description || `${categoryName}`;
      }

      // 重複名や無名データの排除
      const spotKey = `${name}_${category}`;
      if (seenNames.has(spotKey) && name !== '多機能トイレ') continue;
      seenNames.add(spotKey);

      const wheelchairVal = tags.wheelchair || (tags['toilets:wheelchair'] === 'yes' ? 'yes' : 'unknown');
      const hasWheelchairToilet = tags['toilets:wheelchair'] === 'yes' || tags.wheelchair === 'yes' || category === 'toilet';
      const hasElevator = tags.elevator === 'yes' || tags['level:elevator'] === 'yes';
      const hasRamp = tags.ramp === 'yes' || tags['ramp:wheelchair'] === 'yes';
      const hasOstomate = tags['toilets:ostomate'] === 'yes';
      const hasBabyChange = tags.changing_table === 'yes' || tags['baby:feed'] === 'yes';

      const distanceKm = window.calculateDistanceKm(userLat, userLng, spotLat, spotLng);

      results.push({
        id: `osm-${el.type}-${el.id}`,
        name: name,
        category: category,
        categoryName: categoryName,
        lat: spotLat,
        lng: spotLng,
        address: tags['addr:full'] || tags['addr:city'] ? `${tags['addr:city'] || ''}${tags['addr:street'] || ''}` : '',
        distance: distanceKm,
        wheelchair: wheelchairVal === 'yes' || wheelchairVal === 'designated' ? 'yes' : (wheelchairVal === 'limited' ? 'limited' : 'unknown'),
        accessibility: {
          hasElevator: hasElevator,
          hasRamp: hasRamp,
          hasStepFreeAccess: wheelchairVal === 'yes' || hasRamp,
          hasWheelchairToilet: hasWheelchairToilet,
          hasOstomate: hasOstomate,
          hasBabyChange: hasBabyChange,
          doorType: tags.door === 'automatic' ? 'automatic' : (tags.door === 'sliding' ? 'sliding' : 'unknown'),
          aisleWidth: 'unknown'
        },
        description: tags.description || tags.note || (wheelchairVal === 'yes' ? '車いすでの入退室が可能なスポットです。' : '周辺スポット情報'),
        openingHours: tags.opening_hours || '',
        phone: tags.phone || tags['contact:phone'] || '',
        source: 'osm'
      });
    }

    return results;
  }
}

window.osmService = new OsmService();
