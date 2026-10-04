// WheeLife - Main Application Logic
// 状態管理、UIバインディング、現在地取得、イベント処理

(function () {
  'use strict';

  // --- アプリケーション状態 (State) ---
  const state = {
    userLat: 35.681236, // デフォルト: 東京駅
    userLng: 139.767125,
    userAccuracy: 50,
    hasRealLocation: false,
    activeCategory: 'all', // 'all' | 'food' | 'play' | 'toilet'
    searchQuery: '',
    spots: [],
    filteredSpots: [],
    selectedSpot: null,
    sheetState: 'half', // 'collapsed' | 'half' | 'expanded'
    isLoading: false,
    lastSearchedCenter: null
  };

  let mapController = null;

  // --- DOM要素キャッシュ ---
  const elements = {
    bottomSheet: document.getElementById('bottomSheet'),
    sheetContent: document.getElementById('sheetContent'),
    spotList: document.getElementById('spotList'),
    spotCountBadge: document.getElementById('spotCountBadge'),
    categoryFilterGroup: document.getElementById('categoryFilters'),
    searchInput: document.getElementById('searchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    currentLocationBtn: document.getElementById('currentLocationBtn'),
    searchAreaBtn: document.getElementById('searchAreaBtn'),
    sheetToggleBtn: document.getElementById('sheetToggleBtn'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    toastWrapper: document.getElementById('toastWrapper'),
    statusMessage: document.getElementById('statusMessage'),
    spotModal: document.getElementById('spotModal'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    modalContainer: document.getElementById('modalContainer'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    modalContent: document.getElementById('modalContent')
  };

  // --- 初期化処理 ---
  window.addEventListener('DOMContentLoaded', () => {
    initMap();
    initEventListeners();
    initServiceWorker();

    // 起動時の初期プリセットデータ設定
    updateSpotsWithDistance(state.userLat, state.userLng);
    filterAndRender();

    // 起動時に現在地取得を開始
    requestCurrentLocation(false);
  });

  function initMap() {
    mapController = new MapController('map');
    mapController.init(state.userLat, state.userLng, 15);
    mapController.setUserLocation(state.userLat, state.userLng, state.userAccuracy);

    // ピンタップ時のコールバック
    mapController.onSpotSelect((spot) => {
      if (spot) {
        openSpotDetail(spot);
      }
    });

    // 地図移動時に「このエリアで再検索」を表示
    mapController.onMapMove((lat, lng) => {
      if (state.lastSearchedCenter) {
        const dist = window.calculateDistanceKm(state.lastSearchedCenter.lat, state.lastSearchedCenter.lng, lat, lng);
        if (dist > 0.4) {
          elements.searchAreaBtn.classList.remove('hidden');
        }
      } else {
        elements.searchAreaBtn.classList.remove('hidden');
      }
    });
  }

  function initServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        console.log('[App] PWA Service Worker registered:', reg.scope);
      }).catch((err) => {
        console.warn('[App] SW registration failed:', err);
      });
    }
  }

  // --- イベントリスナー ---
  function initEventListeners() {
    // カテゴリフィルター切り替え
    elements.categoryFilterGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-category]');
      if (!btn) return;
      const cat = btn.getAttribute('data-category');
      setCategory(cat);
    });

    // 検索入力
    elements.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim().toLowerCase();
      elements.clearSearchBtn.classList.toggle('hidden', state.searchQuery === '');
      filterAndRender();
    });

    // 検索クリア
    elements.clearSearchBtn.addEventListener('click', () => {
      elements.searchInput.value = '';
      state.searchQuery = '';
      elements.clearSearchBtn.classList.add('hidden');
      filterAndRender();
    });

    // 現在地ボタン
    elements.currentLocationBtn.addEventListener('click', () => {
      requestCurrentLocation(true);
    });

    // このエリアで再検索ボタン
    elements.searchAreaBtn.addEventListener('click', () => {
      elements.searchAreaBtn.classList.add('hidden');
      const center = mapController.getCenter();
      state.userLat = center.lat;
      state.userLng = center.lng;
      state.lastSearchedCenter = center;
      mapController.setUserLocation(center.lat, center.lng, 100);
      fetchNearbySpots(center.lat, center.lng);
    });

    // ボトムシートヘッダーのタップ（展開/折りたたみ切り替え）
    elements.sheetToggleBtn.addEventListener('click', () => {
      toggleSheetState();
    });

    // モーダル閉じる
    elements.modalCloseBtn.addEventListener('click', closeSpotDetail);
    elements.modalBackdrop.addEventListener('click', closeSpotDetail);

    // ESCキーでモーダル閉じ
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !elements.spotModal.classList.contains('hidden')) {
        closeSpotDetail();
      }
    });
  }

  // --- 現在地取得（2段階高速化＆フォールバック） ---
  function requestCurrentLocation(isUserInitiated = false) {
    if (!navigator.geolocation) {
      showStatus('お使いのブラウザは現在地取得に対応していません', 'error');
      return;
    }

    setLoading(true, '現在地を取得中...');

    // 成功時共通ハンドラ
    const handleLocationSuccess = (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = pos.coords.accuracy || 30;

      state.userLat = lat;
      state.userLng = lng;
      state.userAccuracy = accuracy;
      state.hasRealLocation = true;
      state.lastSearchedCenter = { lat, lng };

      mapController.setUserLocation(lat, lng, accuracy);
      mapController.panTo(lat, lng, 16);
      elements.searchAreaBtn.classList.add('hidden');

      showStatus(`現在地を取得しました（誤差約±${Math.round(accuracy)}m）`, 'success');

      // 周辺の車いす対応スポットを検索
      fetchNearbySpots(lat, lng);
    };

    // まずは高速レスポンス（enableHighAccuracy: false）で大まかな位置を瞬時に取得
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleLocationSuccess(pos);

        // その後、バックグラウンドで高精度GPS情報を取得して位置を補正
        navigator.geolocation.getCurrentPosition(
          (highAccPos) => {
            if (highAccPos.coords.accuracy < pos.coords.accuracy) {
              handleLocationSuccess(highAccPos);
            }
          },
          (highAccErr) => {
            console.log('[GPS High Accuracy Note] Fallback kept:', highAccErr.message);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      },
      (err) => {
        setLoading(false);
        console.warn('[Geolocation error]', err);
        let errorMsg = '現在地を取得できませんでした。';
        if (err.code === 1) { // PERMISSION_DENIED
          errorMsg = '位置情報の利用が許可されていません。ブラウザのアドレスバーから許可してください。';
        } else if (err.code === 2) { // POSITION_UNAVAILABLE
          errorMsg = '端末の位置情報を検出できませんでした。GPSが有効かご確認ください。';
        } else if (err.code === 3) { // TIMEOUT
          errorMsg = '位置情報の取得がタイムアウトしました。電波環境をご確認ください。';
        }
        showStatus(errorMsg, 'warning');
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 10000
      }
    );
  }

  // --- 周辺スポット取得と統合 ---
  async function fetchNearbySpots(lat, lng) {
    setLoading(true, '周辺のバリアフリースポットを検索中...');
    try {
      const osmSpots = await window.osmService.fetchNearbyWheelchairSpots(lat, lng, 2000);
      
      // プリセットデータとOSMデータを結合し、距離を計算
      updateSpotsWithDistance(lat, lng, osmSpots);
      filterAndRender();

      const count = state.filteredSpots.length;
      showStatus(`周辺に ${count} 件のバリアフリースポットが見つかりました`, 'success');
    } catch (e) {
      console.error('[App] Spot fetch failed:', e);
      updateSpotsWithDistance(lat, lng);
      filterAndRender();
      showStatus('周辺データ取得中。内蔵スポットを表示しています', 'info');
    } finally {
      setLoading(false);
    }
  }

  // --- 距離計算とスポット更新 ---
  function updateSpotsWithDistance(userLat, userLng, additionalSpots = []) {
    // OSMから取得できたスポット
    const osmList = additionalSpots || [];

    // プリセットスポット（現在地から50km以上離れている場合は除外して、現在地周辺のノイズを防ぐ）
    const validPresets = window.PRESET_SPOTS.filter(spot => {
      const dist = window.calculateDistanceKm(userLat, userLng, spot.lat, spot.lng);
      spot.distance = dist;
      // OSMデータが0件の場合はサンプルとしてすべて表示、ある場合は50km以内のみ
      return osmList.length === 0 || dist < 50;
    });

    const all = [...osmList, ...validPresets];
    
    // 重複除去 (ID基準)
    const uniqueMap = new Map();
    all.forEach(spot => {
      spot.distance = window.calculateDistanceKm(userLat, userLng, spot.lat, spot.lng);
      uniqueMap.set(spot.id, spot);
    });

    // 距離の昇順でソート
    state.spots = Array.from(uniqueMap.values()).sort((a, b) => a.distance - b.distance);
  }

  // --- カテゴリ切り替え ---
  function setCategory(cat) {
    state.activeCategory = cat;

    const buttons = elements.categoryFilterGroup.querySelectorAll('button');
    buttons.forEach(btn => {
      const btnCat = btn.getAttribute('data-category');
      if (btnCat === cat) {
        btn.className = "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-sm bg-blue-600 text-white transition-all transform scale-105";
      } else {
        btn.className = "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition-all";
      }
    });

    filterAndRender();
  }

  // --- フィルタリング & レンダリング ---
  function filterAndRender() {
    let result = state.spots;

    if (state.activeCategory !== 'all') {
      result = result.filter(s => s.category === state.activeCategory);
    }

    if (state.searchQuery) {
      const q = state.searchQuery;
      result = result.filter(s => 
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.categoryName && s.categoryName.toLowerCase().includes(q)) ||
        (s.address && s.address.toLowerCase().includes(q)) ||
        (s.description && s.description.toLowerCase().includes(q))
      );
    }

    state.filteredSpots = result;
    elements.spotCountBadge.textContent = `${result.length}件`;

    if (mapController) {
      mapController.renderSpots(result, state.selectedSpot ? state.selectedSpot.id : null);
    }

    renderSpotList(result);
  }

  // --- スポット一覧の描画 ---
  function renderSpotList(spots) {
    if (spots.length === 0) {
      elements.spotList.innerHTML = `
        <div class="flex flex-col items-center justify-center py-10 text-slate-400">
          <svg class="w-12 h-12 mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          <p class="text-sm font-medium text-slate-600">周辺に該当スポットが見つかりません</p>
          <p class="text-xs text-slate-400 mt-1">地図を移動して「このエリアで再検索」をお試しください</p>
        </div>
      `;
      return;
    }

    const html = spots.map(spot => {
      let iconEmoji = '🚻';
      let tagBg = 'bg-cyan-50 text-cyan-700 border-cyan-200';
      if (spot.category === 'food') {
        iconEmoji = '🍽️';
        tagBg = 'bg-amber-50 text-amber-700 border-amber-200';
      } else if (spot.category === 'play') {
        iconEmoji = '🎮';
        tagBg = 'bg-purple-50 text-purple-700 border-purple-200';
      }

      const badges = [];
      if (spot.wheelchair === 'yes') {
        badges.push(`<span class="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">車いすOK</span>`);
      }
      if (spot.accessibility.hasWheelchairToilet) {
        badges.push(`<span class="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">車いすトイレ</span>`);
      }
      if (spot.accessibility.hasElevator) {
        badges.push(`<span class="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">EVあり</span>`);
      }
      if (spot.accessibility.hasOstomate) {
        badges.push(`<span class="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700">オストメイト</span>`);
      }

      return `
        <div class="spot-card p-3.5 bg-white rounded-xl border border-slate-100 hover:border-blue-300 shadow-sm active:bg-slate-50 transition cursor-pointer flex flex-col gap-2"
             data-spot-id="${spot.id}">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-start gap-2.5 flex-1 min-w-0">
              <span class="flex-shrink-0 text-xl w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">${iconEmoji}</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="inline-block text-[10px] px-1.5 py-0.5 rounded border ${tagBg} font-medium">${spot.categoryName}</span>
                  <span class="text-xs font-semibold text-blue-600">${window.formatDistance(spot.distance)}</span>
                </div>
                <h3 class="text-sm font-bold text-slate-800 truncate mt-0.5">${spot.name}</h3>
                ${spot.address ? `<p class="text-[11px] text-slate-500 truncate mt-0.5">${spot.address}</p>` : ''}
              </div>
            </div>
            <button class="view-detail-btn flex-shrink-0 p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50" aria-label="詳細を見る">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-50">
            ${badges.join('')}
          </div>
        </div>
      `;
    }).join('');

    elements.spotList.innerHTML = html;

    elements.spotList.querySelectorAll('.spot-card').forEach(card => {
      card.addEventListener('click', () => {
        const spotId = card.getAttribute('data-spot-id');
        const targetSpot = state.spots.find(s => s.id === spotId);
        if (targetSpot) {
          mapController.panTo(targetSpot.lat, targetSpot.lng, 17);
          openSpotDetail(targetSpot);
        }
      });
    });
  }

  // --- 詳細モーダルの開閉 ---
  function openSpotDetail(spot) {
    state.selectedSpot = spot;
    mapController.renderSpots(state.filteredSpots, spot.id);

    let iconEmoji = '🚻';
    let catClass = 'bg-cyan-100 text-cyan-800';
    if (spot.category === 'food') {
      iconEmoji = '🍽️';
      catClass = 'bg-amber-100 text-amber-800';
    } else if (spot.category === 'play') {
      iconEmoji = '🎮';
      catClass = 'bg-purple-100 text-purple-800';
    }

    const googleMapUrl = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;

    elements.modalContent.innerHTML = `
      <div class="flex items-start gap-3 mb-3">
        <span class="text-3xl p-2 rounded-xl bg-slate-100 flex items-center justify-center">${iconEmoji}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-xs px-2 py-0.5 rounded-full font-semibold ${catClass}">${spot.categoryName}</span>
            <span class="text-xs font-bold text-blue-600">約 ${window.formatDistance(spot.distance)}</span>
          </div>
          <h2 class="text-base font-bold text-slate-900 mt-1">${spot.name}</h2>
          ${spot.address ? `<p class="text-xs text-slate-500 mt-0.5">${spot.address}</p>` : ''}
        </div>
      </div>

      <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200 mb-4 space-y-2.5">
        <h4 class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          バリアフリー・アクセシビリティ設備
        </h4>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div class="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100">
            <span class="text-base">${spot.accessibility.hasWheelchairToilet ? '✅' : '⚪'}</span>
            <span class="${spot.accessibility.hasWheelchairToilet ? 'font-bold text-slate-800' : 'text-slate-400'}">車いす対応トイレ</span>
          </div>
          <div class="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100">
            <span class="text-base">${spot.accessibility.hasStepFreeAccess ? '✅' : '⚪'}</span>
            <span class="${spot.accessibility.hasStepFreeAccess ? 'font-bold text-slate-800' : 'text-slate-400'}">段差なし / スロープ</span>
          </div>
          <div class="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100">
            <span class="text-base">${spot.accessibility.hasElevator ? '✅' : '⚪'}</span>
            <span class="${spot.accessibility.hasElevator ? 'font-bold text-slate-800' : 'text-slate-400'}">エレベーター完備</span>
          </div>
          <div class="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100">
            <span class="text-base">${spot.accessibility.hasOstomate ? '✅' : '⚪'}</span>
            <span class="${spot.accessibility.hasOstomate ? 'font-bold text-slate-800' : 'text-slate-400'}">オストメイト対応</span>
          </div>
        </div>
      </div>

      ${spot.description ? `
        <div class="mb-4">
          <h4 class="text-xs font-semibold text-slate-600 mb-1">施設の特長・状況</h4>
          <p class="text-xs text-slate-700 bg-blue-50/60 p-3 rounded-xl border border-blue-100/60 leading-relaxed">${spot.description}</p>
        </div>
      ` : ''}

      ${spot.openingHours || spot.phone ? `
        <div class="mb-4 space-y-1.5 text-xs text-slate-600">
          ${spot.openingHours ? `<div class="flex items-center gap-2"><span class="font-medium text-slate-400">🕒 営業時間:</span> <span>${spot.openingHours}</span></div>` : ''}
          ${spot.phone ? `<div class="flex items-center gap-2"><span class="font-medium text-slate-400">📞 電話番号:</span> <a href="tel:${spot.phone}" class="text-blue-600 font-semibold underline">${spot.phone}</a></div>` : ''}
        </div>
      ` : ''}

      <div class="flex items-center gap-2.5 mt-5">
        <a href="${googleMapUrl}" target="_blank" rel="noopener noreferrer"
           class="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-md transition active:scale-98 text-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          Googleマップでルート案内
        </a>
      </div>
    `;

    elements.spotModal.classList.remove('hidden');
    elements.spotModal.classList.add('flex');
  }

  function closeSpotDetail() {
    elements.spotModal.classList.add('hidden');
    elements.spotModal.classList.remove('flex');
    state.selectedSpot = null;
    if (mapController) {
      mapController.renderSpots(state.filteredSpots, null);
    }
  }

  // --- ボトムシートの高さトグル ---
  function toggleSheetState() {
    if (state.sheetState === 'collapsed') {
      setSheetState('half');
    } else if (state.sheetState === 'half') {
      setSheetState('expanded');
    } else {
      setSheetState('collapsed');
    }
  }

  function setSheetState(newState) {
    state.sheetState = newState;
    elements.bottomSheet.classList.remove('sheet-collapsed', 'sheet-half', 'sheet-expanded');
    elements.bottomSheet.classList.add(`sheet-${newState}`);
  }

  // --- ローディング表示 ---
  function setLoading(loading, message = '') {
    state.isLoading = loading;
    if (loading) {
      elements.loadingIndicator.classList.remove('hidden');
      if (message) elements.statusMessage.textContent = message;
      elements.toastWrapper.classList.remove('hidden');
    } else {
      elements.loadingIndicator.classList.add('hidden');
    }
  }

  // --- トースト / ステータス通知 ---
  let toastTimer = null;
  function showStatus(msg, type = 'info') {
    elements.statusMessage.textContent = msg;
    elements.toastWrapper.classList.remove('hidden');
    
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (!state.isLoading) {
        elements.toastWrapper.classList.add('hidden');
      }
    }, 4500);
  }

})();
