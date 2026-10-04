// WheeLife - OpenStreetMap Overpass API 連携サービス
// 車いすタグ (wheelchair=yes, limited, designated, toilets:wheelchair) をリアルタイム検索

class OsmService {
  constructor() {
    this.cache = new Map();
    // 複数のOverpassミラーサーバー（冗長性・フォールバック対応）
    this.endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
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
   * 指定座標の周辺（radiusメートル）からバリアフリースポットを取得
   * @param {number} lat 緯度
   * @param {number} lng 経度
   * @param {number} radius 半径(m) デフォルト1500m
   * @returns {Promise<Array>} スポット配列
   */
  async fetchNearbyWheelchairSpots(lat, lng, radius = 1500) {
    const cacheKey = `${lat.toFixed(3)}_${lng.toFixed(3)}_${radius}`;
    if (this.cache.has(cacheKey)) {
      console.log('[OSM] Returning cached spots');
      return this.cache.get(cacheKey);
    }

    // Overpass QL クエリ作成
    // 飲食店、遊び/レジャー、トイレで wheelchair タグまたはトイレタグがついたものを抽出
    const query = `
      [out:json][timeout:15];
      (
        // ① 車いす対応トイレ (単体トイレ)
        node["amenity"="toilets"](around:${radius},${lat},${lng});
        way["amenity"="toilets"](around:${radius},${lat},${lng});

        // ② 飲食店 (車いす対応、または一般飲食店)
        node["amenity"~"restaurant|cafe|fast_food|bar|pub"]["wheelchair"](around:${radius},${lat},${lng});
        way["amenity"~"restaurant|cafe|fast_food|bar|pub"]["wheelchair"](around:${radius},${lat},${lng});

        // ③ 遊ぶ場所・レジャー施設
        node["leisure"~"park|cinema|pitch|bowling_alley|playground|amusement_arcade"](around:${radius},${lat},${lng});
        way["leisure"~"park|cinema|pitch|bowling_alley|playground|amusement_arcade"](around:${radius},${lat},${lng});
        node["tourism"~"museum|zoo|aquarium|theme_park|attraction|gallery"](around:${radius},${lat},${lng});
        way["tourism"~"museum|zoo|aquarium|theme_park|attraction|gallery"](around:${radius},${lat},${lng});
      );
      out center 80;
    `;

    try {
      const response = await fetch(this.getEndpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: 'data=' + encodeURIComponent(query)
      });

      if (!response.ok) {
        throw new Error(`Overpass HTTP error: ${response.status}`);
      }

      const data = await response.json();
      const parsedSpots = this.parseOverpassElements(data.elements || [], lat, lng);
      
      this.cache.set(cacheKey, parsedSpots);
      return parsedSpots;
    } catch (error) {
      console.warn('[OSM] Overpass API query failed or timed out:', error);
      this.rotateEndpoint();
      // フォールバックとして空配列（またはプリセットデータとマージして利用）
      return [];
    }
  }

  /**
   * Overpassの要素配列をアプリ共通のSpot形式に変換
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
        if (!name) name = tags.brand || 'バリアフリー飲食店';
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

      // 車いすアクセシビリティ情報の抽出
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
          hasStepFreeAccess: wheelchairVal === 'yes',
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
