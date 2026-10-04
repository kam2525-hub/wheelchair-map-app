// WheeLife - Main Application Logic
// 厳格な検証ポリシー：車いす対応が明記されているスポットのみを扱い、推測は行いません。

(function () {
  'use strict';

  // --- アプリケーション状態 (State) ---
  const state = {
    userLat: 35.681236,
    userLng: 139.767125,
    userAccuracy: 50,
    hasRealLocation: false,
    activeCategory: 'all',
    searchQuery: '',
    spots: [],
    filteredSpots: [],
    selectedSpot: null,
    sheetState: 'half',
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

    updateSpotsWithDistance(state.userLat, state.userLng);
    filterAndRender();

    requestCurrentLocation(false);
  });

  function initMap() {
    mapController = new MapController('map');
    mapController.init(state.userLat, state.userLng, 15);
    mapController.setUserLocation(state.userLat, state.userLng, state.userAccuracy);

    mapController.onSpotSelect((spot) => {
      if (spot) {
        openSpotDetail(spot);
      }
    });

    mapController.onMapMove((lat, lng) => {
      if (state.lastSearchedCenter) {
        const dist = window.calculateDistanceKm(state.lastSearchedCenter.lat, state.lastSearchedCenter.lng, lat, lng);
        if (dist > 0.3) {
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
        console.log('[App] PWA SW registered:', reg.scope);
      }).catch((err) => {
        console.warn('[App] SW registration failed:', err);
      });
    }
  }

  // --- イベントリスナー ---
  function initEventListeners() {
    elements.categoryFilterGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-category]');
      if (!btn) return;
      const cat = btn.getAttribute('data-category');
      setCategory(cat);
    });

    elements.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim().toLowerCase();
      elements.clearSearchBtn.classList.toggle('hidden', state.searchQuery === '');
      filterAndRender();
    });

    elements.clearSearchBtn.addEventListener('click', () => {
      elements.searchInput.value = '';
      state.searchQuery = '';
      elements.clearSearchBtn.classList.add('hidden');
      filterAndRender();
    });

    elements.currentLocationBtn.addEventListener('click', () => {
      requestCurrentLocation(true);
    });

    elements.searchAreaBtn.addEventListener('click', () => {
      elements.searchAreaBtn.classList.add('hidden');
      const center = mapController.getCenter();
      state.userLat = center.lat;
      state.userLng = center.lng;
      state.lastSearchedCenter = center;
      mapController.setUserLocation(center.lat, center.lng, 80);
      fetchNearbySpots(center.lat, center.lng);
    });

    elements.sheetToggleBtn.addEventListener('click', () => {
      toggleSheetState();
    });

    elements.modalCloseBtn.addEventListener('click', closeSpotDetail);
    elements.modalBackdrop.addEventListener('click', closeSpotDetail);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !elements.spotModal.classList.contains('hidden')) {
        closeSpotDetail();
      }
    });
  }

  // --- 現在地取得 ---
  function requestCurrentLocation(isUserInitiated = false) {
    if (!navigator.geolocation) {
      showStatus('お使いのブラウザは現在地取得に対応していません', 'error');
      return;
    }

    setLoading(true, '現在地を取得中...');

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

      showStatus(`現在地を取得（精度±${Math.round(accuracy)}m）。確証データを検索中...`, 'success');

      fetchNearbySpots(lat, lng);
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleLocationSuccess(pos);
        // バックグラウンドで高精度GPS更新
        navigator.geolocation.getCurrentPosition(
          (highAccPos) => {
            if (highAccPos.coords.accuracy < pos.coords.accuracy) {
              handleLocationSuccess(highAccPos);
            }
          },
          () => {},
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      },
      (err) => {
        setLoading(false);
        console.warn('[Geolocation error]', err);
        let errorMsg = '現在地を取得できませんでした。';
        if (err.code === 1) {
          errorMsg = '位置情報の利用が許可されていません。ブラウザ設定をご確認ください。';
        } else if (err.code === 2) {
          errorMsg = '位置情報を検出できませんでした。';
        } else if (err.code === 3) {
          errorMsg = '位置情報の取得がタイムアウトしました。';
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

  // --- 周辺スポット取得（推測なし・明記データのみ） ---
  async function fetchNearbySpots(lat, lng) {
    setLoading(true, '車いす対応が明記されているスポットを検索中...');
    try {
      const osmSpots = await window.osmService.fetchNearbyWheelchairSpots(lat, lng, 2000);
      
      updateSpotsWithDistance(lat, lng, osmSpots);
      filterAndRender();

      const count = state.filteredSpots.length;
      if (count > 0) {
        showStatus(`周辺に車いす明記スポット ${count} 件を確認しました`, 'success');
      } else {
        showStatus('現在地周辺(2km)に車いすタグ明記のスポットが見つかりませんでした', 'info');
      }
    } catch (e) {
      console.error('[App] Spot fetch error:', e);
      updateSpotsWithDistance(lat, lng);
      filterAndRender();
      showStatus('公式確認済みスポットを表示しています', 'info');
    } finally {
      setLoading(false);
    }
  }

  // --- 距離計算とスポット更新 ---
  function updateSpotsWithDistance(userLat, userLng, additionalSpots = []) {
    const osmList = additionalSpots || [];

    // プリセットデータ（現在地から50km以上離れている場合は除外）
    const validPresets = window.PRESET_SPOTS.filter(spot => {
      const dist = window.calculateDistanceKm(userLat, userLng, spot.lat, spot.lng);
      spot.distance = dist;
      return osmList.length === 0 || dist < 50;
    });

    const all = [...osmList, ...validPresets];
    
    const uniqueMap = new Map();
    all.forEach(spot => {
      spot.distance = window.calculateDistanceKm(userLat, userLng, spot.lat, spot.lng);
      uniqueMap.set(spot.id, spot);
    });

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
        <div class="flex flex-col items-center justify-center py-10 px-4 text-center">
          <svg class="w-12 h-12 mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <p class="text-sm font-bold text-slate-700">車いす対応が明記されたスポットが見つかりません</p>
          <p class="text-xs text-slate-500 mt-1 leading-relaxed">
            安全のため推測データは表示していません。<br>
            地図を最寄り駅や繁華街にスライドして「このエリアで再検索」をお試しください。
          </p>
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

      // 信頼度バッジ（推測なし・事実のみ）
      let trustBadge = '';
      if (spot.verificationStatus === 'verified') {
        trustBadge = `<span class="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">🟢 公式確認済</span>`;
      } else {
        trustBadge = `<span class="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">🔵 OSM明記</span>`;
      }

      // 設備バッジ（明記されているものだけ表示）
      const badges = [trustBadge];
      if (spot.accessibility.hasWheelchairToilet === true) {
        badges.push(`<span class="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">車いすトイレあり</span>`);
      }
      if (spot.accessibility.hasElevator === true) {
        badges.push(`<span class="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">EVあり</span>`);
      }
      if (spot.accessibility.hasOstomate === true) {
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

    // 各設備の判定ヘルパー（推測せず、true/false/nullを厳密に表示）
    const renderFacilityItem = (label, statusVal) => {
      let icon = '➖';
      let statusText = '未確認（事前確認推奨）';
      let textColor = 'text-slate-400';
      let bgColor = 'bg-slate-50';

      if (statusVal === true) {
        icon = '✅';
        statusText = '明記あり（利用可）';
        textColor = 'font-bold text-slate-800';
        bgColor = 'bg-emerald-50/50 border-emerald-100';
      } else if (statusVal === false) {
        icon = '❌';
        statusText = 'なし（非対応）';
        textColor = 'font-semibold text-rose-600';
        bgColor = 'bg-rose-50/50 border-rose-100';
      }

      return `
        <div class="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 ${bgColor}">
          <div class="flex items-center gap-2">
            <span class="text-sm">${icon}</span>
            <span class="text-xs font-medium text-slate-700">${label}</span>
          </div>
          <span class="text-[11px] ${textColor}">${statusText}</span>
        </div>
      `;
    };

    elements.modalContent.innerHTML = `
      <div class="flex items-start gap-3 mb-3">
        <span class="text-3xl p-2 rounded-xl bg-slate-100 flex items-center justify-center">${iconEmoji}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs px-2 py-0.5 rounded-full font-semibold ${catClass}">${spot.categoryName}</span>
            ${spot.verificationStatus === 'verified' 
              ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">🟢 公式フロア情報確認済</span>`
              : `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">🔵 OSM車いすタグ明記</span>`
            }
            <span class="text-xs font-bold text-blue-600">約 ${window.formatDistance(spot.distance)}</span>
          </div>
          <h2 class="text-base font-bold text-slate-900 mt-1">${spot.name}</h2>
          ${spot.address ? `<p class="text-xs text-slate-500 mt-0.5">${spot.address}</p>` : ''}
        </div>
      </div>

      <!-- 安全注意コールアウト -->
      <div class="bg-amber-50 border border-amber-200/80 rounded-xl p-3 mb-3.5 flex items-start gap-2.5">
        <svg class="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <p class="text-[11px] text-amber-800 leading-relaxed font-medium">
          安全のため推測データは一切含めていません。車いすの全幅・段差昇降能力や当日の混雑状況により利用条件が異なる場合があるため、事前のご確認をおすすめします。
        </p>
      </div>

      <!-- バリアフリー設備明記状況 -->
      <div class="space-y-2 mb-4">
        <h4 class="text-xs font-bold text-slate-700 flex items-center justify-between">
          <span>バリアフリー設備・タグ明記状況</span>
          <span class="text-[10px] font-normal text-slate-400">※未確認項目は推測していません</span>
        </h4>
        <div class="flex flex-col gap-1.5">
          ${renderFacilityItem('車いす対応トイレ', spot.accessibility.hasWheelchairToilet)}
          ${renderFacilityItem('段差なし / スロープ対応', spot.accessibility.hasStepFreeAccess)}
          ${renderFacilityItem('エレベーター', spot.accessibility.hasElevator)}
          ${renderFacilityItem('オストメイト設備', spot.accessibility.hasOstomate)}
        </div>
      </div>

      <!-- 施設備考・出所 -->
      ${spot.description ? `
        <div class="mb-4">
          <h4 class="text-xs font-semibold text-slate-600 mb-1">登録情報・備考</h4>
          <p class="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200 leading-relaxed">${spot.description}</p>
        </div>
      ` : ''}

      <!-- 営業時間・電話確認ボタン -->
      ${spot.openingHours || spot.phone ? `
        <div class="mb-4 space-y-1.5 text-xs text-slate-600">
          ${spot.openingHours ? `<div class="flex items-center gap-2"><span class="font-medium text-slate-400">🕒 営業時間:</span> <span>${spot.openingHours}</span></div>` : ''}
          ${spot.phone ? `
            <div class="flex items-center justify-between p-2.5 bg-blue-50/60 rounded-xl border border-blue-100">
              <span class="font-medium text-slate-600">📞 事前確認用電話番号:</span>
              <a href="tel:${spot.phone}" class="text-blue-700 font-bold underline text-xs flex items-center gap-1">
                ${spot.phone}
              </a>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- アクションボタン群 -->
      <div class="flex items-center gap-2.5 mt-5">
        ${spot.phone ? `
          <a href="tel:${spot.phone}" 
             class="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-3 rounded-xl shadow-md transition active:scale-98 text-xs">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
            </svg>
            電話で確認する
          </a>
        ` : ''}
        <a href="${googleMapUrl}" target="_blank" rel="noopener noreferrer"
           class="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-3 rounded-xl shadow-md transition active:scale-98 text-xs">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          Googleマップ案内
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
