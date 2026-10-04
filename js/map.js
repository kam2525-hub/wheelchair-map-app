// WheeLife - Leaflet Map Controller
// 現在地追跡、精度円、カテゴリ別カスタムピン、スムーズ移動、インタラクション管理

class MapController {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.userMarker = null;
    this.accuracyCircle = null;
    this.markersLayer = null;
    this.onSpotSelectCallback = null;
    this.onMapMoveCallback = null;
    this.activeSpotId = null;
  }

  /**
   * 地図の初期化
   */
  init(initialLat = 35.681236, initialLng = 139.767125, zoom = 15) {
    if (this.map) return;

    this.map = L.map(this.containerId, {
      zoomControl: false,
      attributionControl: false,
      tap: true
    }).setView([initialLat, initialLng], zoom);

    // 見やすく軽快なオープンストリートマップタイル（OSM公式 Carto Voyager）
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(this.map);

    L.control.attribution({ position: 'bottomright' }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);

    // タイルレンダリングずれ（Leafletの典型的なずれバグ）を防止
    setTimeout(() => {
      if (this.map) this.map.invalidateSize();
    }, 200);

    window.addEventListener('resize', () => {
      if (this.map) this.map.invalidateSize();
    });

    // 地図タップで選択解除
    this.map.on('click', () => {
      if (this.onSpotSelectCallback) {
        this.onSpotSelectCallback(null);
      }
    });

    // 地図ドラッグ移動終了時のコールバック（「この場所で再検索」用）
    this.map.on('moveend', () => {
      if (this.onMapMoveCallback) {
        const center = this.map.getCenter();
        this.onMapMoveCallback(center.lat, center.lng);
      }
    });

    console.log('[Map] Initialized at', initialLat, initialLng);
  }

  /**
   * 現在地マーカーおよび精度円の描画・更新
   */
  setUserLocation(lat, lng, accuracy = 50) {
    if (!this.map) return;

    const userIconHtml = `
      <div class="relative flex items-center justify-center w-8 h-8">
        <span class="absolute inline-flex w-full h-full rounded-full bg-blue-500 opacity-35 animate-ping"></span>
        <span class="relative inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-lg">
          <div class="w-2 h-2 rounded-full bg-white"></div>
        </span>
      </div>
    `;

    const userIcon = L.divIcon({
      html: userIconHtml,
      className: 'user-location-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    if (this.userMarker) {
      this.userMarker.setLatLng([lat, lng]);
    } else {
      this.userMarker = L.marker([lat, lng], {
        icon: userIcon,
        zIndexOffset: 1000
      }).addTo(this.map);
    }

    // 精度円の表示（GPSの誤差範囲を視覚化）
    const safeRadius = Math.min(Math.max(accuracy, 20), 500); // 20m〜500m
    if (this.accuracyCircle) {
      this.accuracyCircle.setLatLng([lat, lng]);
      this.accuracyCircle.setRadius(safeRadius);
    } else {
      this.accuracyCircle = L.circle([lat, lng], {
        radius: safeRadius,
        color: '#3b82f6',
        weight: 1,
        opacity: 0.4,
        fillColor: '#60a5fa',
        fillOpacity: 0.12
      }).addTo(this.map);
    }
  }

  /**
   * 指定した座標へスムーズに移動
   */
  panTo(lat, lng, zoom = null) {
    if (!this.map) return;
    if (this.map.invalidateSize) {
      this.map.invalidateSize();
    }
    if (zoom) {
      this.map.flyTo([lat, lng], zoom, { duration: 0.7, easeLinearity: 0.25 });
    } else {
      this.map.panTo([lat, lng], { animate: true, duration: 0.5 });
    }
  }

  /**
   * 現在の地図中心座標を取得
   */
  getCenter() {
    if (!this.map) return { lat: 35.681236, lng: 139.767125 };
    const center = this.map.getCenter();
    return { lat: center.lat, lng: center.lng };
  }

  /**
   * スポットピンの作成
   */
  createSpotIcon(spot, isSelected = false) {
    let bgColor = 'bg-blue-600';
    let iconChar = '🚻';
    let ringColor = 'ring-blue-400';

    if (spot.category === 'food') {
      bgColor = 'bg-amber-600';
      iconChar = '🍽️';
      ringColor = 'ring-amber-400';
    } else if (spot.category === 'play') {
      bgColor = 'bg-purple-600';
      iconChar = '🎮';
      ringColor = 'ring-purple-400';
    } else {
      bgColor = 'bg-cyan-600';
      iconChar = '♿';
      ringColor = 'ring-cyan-400';
    }

    const scaleClass = isSelected ? 'scale-125 z-50 ring-4' : 'scale-100 hover:scale-110';

    const html = `
      <div class="spot-marker-pin transition-all duration-200 transform ${scaleClass} ${ringColor} flex items-center justify-center w-10 h-10 rounded-full ${bgColor} text-white shadow-lg border-2 border-white cursor-pointer select-none">
        <span class="text-base">${iconChar}</span>
        ${spot.wheelchair === 'yes' ? '<span class="absolute -top-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5 text-[9px] w-4 h-4 flex items-center justify-center font-bold border border-white">✓</span>' : ''}
      </div>
    `;

    return L.divIcon({
      html: html,
      className: `spot-marker-${spot.id}`,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });
  }

  /**
   * スポット一覧を地図上に再描画
   */
  renderSpots(spots, activeSpotId = null) {
    if (!this.map || !this.markersLayer) return;
    this.markersLayer.clearLayers();
    this.activeSpotId = activeSpotId;

    spots.forEach(spot => {
      const isSelected = spot.id === activeSpotId;
      const marker = L.marker([spot.lat, spot.lng], {
        icon: this.createSpotIcon(spot, isSelected),
        title: spot.name
      });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (this.onSpotSelectCallback) {
          this.onSpotSelectCallback(spot);
        }
      });

      marker.addTo(this.markersLayer);
    });
  }

  onSpotSelect(callback) {
    this.onSpotSelectCallback = callback;
  }

  onMapMove(callback) {
    this.onMapMoveCallback = callback;
  }
}

window.MapController = MapController;
