// WheeLife - OpenStreetMap Overpass API 連携サービス
// 【厳格モード】車いすタグ (wheelchair=yes / designated, toilets:wheelchair=yes) が
// 明示的に登録されている確実なデータのみを抽出し、推測による補完は一切行いません。

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
   * 指定座標の周辺から【車いす対応が明記されているスポットのみ】を取得
   * 一般店舗や設備未確認のスポットは除外します。
   */
  async fetchNearbyWheelchairSpots(lat, lng, radius = 2000) {
    const cacheKey = `strict_${lat.toFixed(3)}_${lng.toFixed(3)}_${radius}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // 厳格なクエリ:
    // wheelchair=yes または wheelchair=designated または toilets:wheelchair=yes が明記されているものに限定
    const query = `
      [out:json][timeout:10];
      (
        // ① 車いす対応が明記されているトイレ
        node["amenity"="toilets"]["wheelchair"="yes"](around:${radius},${lat},${lng});
        way["amenity"="toilets"]["wheelchair"="yes"](around:${radius},${lat},${lng});
        node["toilets:wheelchair"="yes"](around:${radius},${lat},${lng});
        way["toilets:wheelchair"="yes"](around:${radius},${lat},${lng});

        // ② 車いす対応が明記されている飲食店
        node["amenity"~"restaurant|cafe|fast_food"]["wheelchair"="yes"](around:${radius},${lat},${lng});
        way["amenity"~"restaurant|cafe|fast_food"]["wheelchair"="yes"](around:${radius},${lat},${lng});
        node["amenity"~"restaurant|cafe|fast_food"]["wheelchair"="designated"](around:${radius},${lat},${lng});
        way["amenity"~"restaurant|cafe|fast_food"]["wheelchair"="designated"](around:${radius},${lat},${lng});

        // ③ 車いす対応が明記されているレジャー・公共・観光施設
        node["wheelchair"="yes"]["leisure"](around:${radius},${lat},${lng});
        way["wheelchair"="yes"]["leisure"](around:${radius},${lat},${lng});
        node["wheelchair"="yes"]["tourism"](around:${radius},${lat},${lng});
        way["wheelchair"="yes"]["tourism"](around:${radius},${lat},${lng});
        node["wheelchair"="designated"]["leisure"](around:${radius},${lat},${lng});
        way["wheelchair"="designated"]["leisure"](around:${radius},${lat},${lng});
      );
      out center 60;
    `;

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
   * 要素を厳格にパース（推測によるデータ捏造は行わない）
   */
  parseOverpassElements(elements, userLat, userLng) {
    const results = [];
    const seenIds = new Set();

    for (const el of elements) {
      const tags = el.tags || {};
      const spotLat = el.lat || (el.center && el.center.lat);
      const spotLng = el.lon || (el.center && el.center.lon);

      if (!spotLat || !spotLng) continue;

      // 重複チェック
      const spotId = `osm-${el.type}-${el.id}`;
      if (seenIds.has(spotId)) continue;
      seenIds.add(spotId);

      // 車いす明記フラグの確認（yes または designated のみ許可）
      const isWheelchairExplicit = tags.wheelchair === 'yes' || tags.wheelchair === 'designated';
      const isToiletWheelchairExplicit = tags['toilets:wheelchair'] === 'yes';

      // どちらのタグも明記されていない場合は絶対に除外
      if (!isWheelchairExplicit && !isToiletWheelchairExplicit) {
        continue;
      }

      let name = tags.name || tags['name:ja'] || '';
      let category = 'play';
      let categoryName = '施設・スポット';

      if (tags.amenity === 'toilets' || isToiletWheelchairExplicit) {
        category = 'toilet';
        categoryName = '多機能トイレ（車いす明記）';
        if (!name) name = tags.description || '多機能公衆トイレ';
      } else if (tags.amenity && ['restaurant', 'cafe', 'fast_food', 'bar', 'pub'].includes(tags.amenity)) {
        category = 'food';
        categoryName = tags.cuisine ? `${tags.cuisine}・飲食` : (tags.amenity === 'cafe' ? 'カフェ' : '飲食店');
        if (!name) name = tags.brand || '車いす対応登録飲食店';
      } else {
        category = 'play';
        if (tags.tourism === 'museum') categoryName = '博物館・美術館';
        else if (tags.leisure === 'park') categoryName = '公園・緑地';
        else if (tags.tourism === 'zoo' || tags.tourism === 'aquarium') categoryName = '動植物園・水族館';
        else if (tags.leisure === 'cinema') categoryName = '映画館';
        else categoryName = 'レジャー・公共施設';
        if (!name) name = tags.description || categoryName;
      }

      const distanceKm = window.calculateDistanceKm(userLat, userLng, spotLat, spotLng);

      // 各設備：タグに明記があるものだけ true、ないものは null (未確認) とする（推測値は入れない）
      const accessibility = {
        hasWheelchairToilet: isToiletWheelchairExplicit ? true : (tags['toilets:wheelchair'] === 'no' ? false : null),
        hasElevator: tags.elevator === 'yes' ? true : (tags.elevator === 'no' ? false : null),
        hasRamp: tags.ramp === 'yes' || tags['ramp:wheelchair'] === 'yes' ? true : null,
        hasStepFreeAccess: isWheelchairExplicit ? true : null,
        hasOstomate: tags['toilets:ostomate'] === 'yes' ? true : (tags['toilets:ostomate'] === 'no' ? false : null),
        hasBabyChange: tags.changing_table === 'yes' ? true : null,
        doorType: tags.door === 'automatic' ? '自動ドア' : (tags.door === 'sliding' ? '引き戸' : (tags.door === 'hinged' ? '開き戸' : '未登録'))
      };

      results.push({
        id: spotId,
        name: name,
        category: category,
        categoryName: categoryName,
        lat: spotLat,
        lng: spotLng,
        address: tags['addr:full'] || (tags['addr:city'] ? `${tags['addr:city']}${tags['addr:street'] || ''}` : ''),
        distance: distanceKm,
        wheelchair: isWheelchairExplicit ? 'yes' : (isToiletWheelchairExplicit ? 'toilet_only' : 'unknown'),
        accessibility: accessibility,
        description: tags.description || tags.note || '', // 勝手なAI作文は行わず、登録データそのまま
        openingHours: tags.opening_hours || '',
        phone: tags.phone || tags['contact:phone'] || '',
        source: 'osm',
        verificationStatus: 'osm_explicit' // タグ明記データ
      });
    }

    return results;
  }
}

window.osmService = new OsmService();
