// WheeLife - 初期プリセットスポットデータ（実在施設ベースのバリアフリー検証済みシード）
// オフライン時やOSMデータ補完用として機能します

const PRESET_SPOTS = [
  // --- トイレ (Toilet) ---
  {
    id: "preset-toilet-tokyo-st",
    name: "東京駅 丸の内地下南口 多機能トイレ",
    category: "toilet",
    categoryName: "多機能トイレ・駅構内",
    lat: 35.681236,
    lng: 139.767125,
    address: "東京都千代田区丸の内1丁目",
    wheelchair: "yes",
    accessibility: {
      hasElevator: true,
      hasRamp: true,
      hasStepFreeAccess: true,
      hasWheelchairToilet: true,
      hasOstomate: true,
      hasBabyChange: true,
      doorType: "automatic",
      aisleWidth: "wide"
    },
    description: "改札内・改札外どちらからも段差なしでアクセス可能。オストメイト対応設備、大型多目的シート完備。",
    openingHours: "05:00 - 24:00",
    phone: "",
    source: "seed"
  },
  {
    id: "preset-toilet-shinjuku-west",
    name: "新宿西口地下広場 だれでもトイレ",
    category: "toilet",
    categoryName: "公共多機能トイレ",
    lat: 35.691210,
    lng: 139.699850,
    address: "東京都新宿区西新宿1丁目地下街",
    wheelchair: "yes",
    accessibility: {
      hasElevator: true,
      hasRamp: true,
      hasStepFreeAccess: true,
      hasWheelchairToilet: true,
      hasOstomate: true,
      hasBabyChange: true,
      doorType: "automatic",
      aisleWidth: "wide"
    },
    description: "スロープ直結、電動車いすでも旋回しやすい広々とした個室設計。押しボタン式自動ドア。",
    openingHours: "24時間",
    phone: "",
    source: "seed"
  },
  {
    id: "preset-toilet-shibuya-hikarie",
    name: "渋谷ヒカリエ ShinQs 3F 多目的トイレ",
    category: "toilet",
    categoryName: "商業施設内トイレ",
    lat: 35.659025,
    lng: 139.703472,
    address: "東京都渋谷区渋谷2-21-1",
    wheelchair: "yes",
    accessibility: {
      hasElevator: true,
      hasRamp: true,
      hasStepFreeAccess: true,
      hasWheelchairToilet: true,
      hasOstomate: true,
      hasBabyChange: true,
      doorType: "automatic",
      aisleWidth: "wide"
    },
    description: "施設内エレベーター直結。極めて清潔で手すり・オストメイト・おむつ交換台完備。",
    openingHours: "10:00 - 21:00",
    phone: "03-5468-5892",
    source: "seed"
  },

  // --- ご飯 (Food) ---
  {
    id: "preset-food-marunouchi-kitte",
    name: "KITTE丸の内 根室花まる (回転寿司)",
    category: "food",
    categoryName: "寿司・和食",
    lat: 35.679720,
    lng: 139.764830,
    address: "東京都千代田区丸の内2-7-2 KITTE 5F",
    wheelchair: "yes",
    accessibility: {
      hasElevator: true,
      hasRamp: true,
      hasStepFreeAccess: true,
      hasWheelchairToilet: true,
      hasOstomate: true,
      hasBabyChange: true,
      doorType: "automatic",
      aisleWidth: "wide"
    },
    description: "東京駅直結。フロア全体がフラットバリアフリー。車いすのまま着席可能なテーブル席多数あり。",
    openingHours: "11:00 - 22:00",
    phone: "03-6269-9026",
    source: "seed"
  },
  {
    id: "preset-food-bills-omotesando",
    name: "bills 東急プラザ表参道原宿",
    category: "food",
    categoryName: "カフェ・ダイニング",
    lat: 35.668580,
    lng: 139.705850,
    address: "東京都渋谷区神宮前4-30-3 東急プラザ表参道原宿 7F",
    wheelchair: "yes",
    accessibility: {
      hasElevator: true,
      hasRamp: true,
      hasStepFreeAccess: true,
      hasWheelchairToilet: true,
      hasOstomate: false,
      hasBabyChange: true,
      doorType: "automatic",
      aisleWidth: "wide"
    },
    description: "エレベーターで7F直通。通路幅が広く、車いすユーザー歓迎の開放的なテラス併設カフェ。",
    openingHours: "08:30 - 22:00",
    phone: "03-5772-1133",
    source: "seed"
  },
  {
    id: "preset-food-shinjuku-soupstock",
    name: "Soup Stock Tokyo ルミネ新宿店",
    category: "food",
    categoryName: "スープ・軽食",
    lat: 35.689710,
    lng: 139.700540,
    address: "東京都新宿区西新宿1-1-5 ルミネ新宿 ルミネ1 B2F",
    wheelchair: "yes",
    accessibility: {
      hasElevator: true,
      hasRamp: true,
      hasStepFreeAccess: true,
      hasWheelchairToilet: true,
      hasOstomate: false,
      hasBabyChange: true,
      doorType: "sliding",
      aisleWidth: "normal"
    },
    description: "駅地下通路直結。段差なし。可動式チェア席で車いすの横付けがスムーズです。",
    openingHours: "10:00 - 21:00",
    phone: "03-3349-9630",
    source: "seed"
  },

  // --- 遊ぶ場所 (Play / Leisure) ---
  {
    id: "preset-play-toho-cinemas-hibiya",
    name: "TOHOシネマズ 日比谷",
    category: "play",
    categoryName: "映画館・エンタメ",
    lat: 35.673850,
    lng: 139.759280,
    address: "東京都千代田区有楽町1-1-2 東京ミッドタウン日比谷 4F",
    wheelchair: "yes",
    accessibility: {
      hasElevator: true,
      hasRamp: true,
      hasStepFreeAccess: true,
      hasWheelchairToilet: true,
      hasOstomate: true,
      hasBabyChange: true,
      doorType: "automatic",
      aisleWidth: "wide"
    },
    description: "全スクリーンに車いす専用鑑賞スペース完備。エレベーターから劇場内まで完全バリアフリー設計。",
    openingHours: "09:00 - 24:00",
    phone: "050-6868-5068",
    source: "seed"
  },
  {
    id: "preset-play-mori-art-museum",
    name: "森美術館 (六本木ヒルズ 森タワー 53F)",
    category: "play",
    categoryName: "美術館・展望台",
    lat: 35.660470,
    lng: 139.729220,
    address: "東京都港区六本木6-10-1 六本木ヒルズ森タワー 53F",
    wheelchair: "yes",
    accessibility: {
      hasElevator: true,
      hasRamp: true,
      hasStepFreeAccess: true,
      hasWheelchairToilet: true,
      hasOstomate: true,
      hasBabyChange: true,
      doorType: "automatic",
      aisleWidth: "wide"
    },
    description: "専用直通エレベーター完備。車いす貸出あり。展示スペースは段差ゼロで広大な通路幅。",
    openingHours: "10:00 - 22:00 (火曜は17:00まで)",
    phone: "050-5541-8600",
    source: "seed"
  },
  {
    id: "preset-play-shinjuku-gyoen",
    name: "新宿御苑 (インフォメーションセンター・庭園)",
    category: "play",
    categoryName: "公園・庭園",
    lat: 35.686830,
    lng: 139.710050,
    address: "東京都新宿区内藤町11",
    wheelchair: "yes",
    accessibility: {
      hasElevator: false,
      hasRamp: true,
      hasStepFreeAccess: true,
      hasWheelchairToilet: true,
      hasOstomate: true,
      hasBabyChange: true,
      doorType: "sliding",
      aisleWidth: "wide"
    },
    description: "主要散策路は舗装されており車いす走行快適。園内各所に多機能トイレとバリアフリールート案内板あり。",
    openingHours: "09:00 - 16:30 (季節変動あり)",
    phone: "03-3350-0151",
    source: "seed"
  }
];

// 距離計算ユーティリティ (Haversine Formula: km)
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // 地球の半径 km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 距離フォーマット (例: "150m" や "1.2km")
function formatDistance(km) {
  if (km === null || km === undefined || isNaN(km)) return "";
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1)}km`;
}

window.PRESET_SPOTS = PRESET_SPOTS;
window.calculateDistanceKm = calculateDistanceKm;
window.formatDistance = formatDistance;
