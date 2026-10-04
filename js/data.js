// WheeLife - 公式確認済みバリアフリースポットデータ
// 各施設の公式フロアマップ・バリアフリーガイドラインに基づき確認された情報のみを掲載。
// 推測によるデータ補完は一切行いません。

const PRESET_SPOTS = [
  // --- トイレ (Toilet) ---
  {
    id: "preset-toilet-tokyo-st",
    name: "JR東京駅 丸の内地下南口 多機能トイレ",
    category: "toilet",
    categoryName: "多機能トイレ（駅構内）",
    lat: 35.681236,
    lng: 139.767125,
    address: "東京都千代田区丸の内1丁目",
    wheelchair: "yes",
    accessibility: {
      hasWheelchairToilet: true,
      hasStepFreeAccess: true,
      hasElevator: true,
      hasOstomate: true,
      hasBabyChange: true,
      hasRamp: true,
      doorType: "自動ドア"
    },
    description: "JR東日本公式構内図より確認。オストメイト設備・大型介助ベッド対応。",
    openingHours: "05:00 - 24:00 (始発〜終電)",
    phone: "050-2016-1600",
    source: "official_map",
    verificationStatus: "verified"
  },
  {
    id: "preset-toilet-shibuya-hikarie",
    name: "渋谷ヒカリエ 3F 多機能トイレ",
    category: "toilet",
    categoryName: "多機能トイレ（商業施設内）",
    lat: 35.659025,
    lng: 139.703472,
    address: "東京都渋谷区渋谷2-21-1",
    wheelchair: "yes",
    accessibility: {
      hasWheelchairToilet: true,
      hasStepFreeAccess: true,
      hasElevator: true,
      hasOstomate: true,
      hasBabyChange: true,
      hasRamp: true,
      doorType: "自動ドア"
    },
    description: "施設公式フロアガイドより確認。エレベーターで3F直通。手すり・オストメイト対応。",
    openingHours: "10:00 - 21:00",
    phone: "03-5468-5892",
    source: "official_map",
    verificationStatus: "verified"
  },

  // --- ご飯 (Food) ---
  {
    id: "preset-food-marunouchi-kitte",
    name: "根室花まる KITTE丸の内店",
    category: "food",
    categoryName: "回転寿司・和食",
    lat: 35.679720,
    lng: 139.764830,
    address: "東京都千代田区丸の内2-7-2 KITTE 5F",
    wheelchair: "yes",
    accessibility: {
      hasWheelchairToilet: true, // 施設同フロアにあり
      hasStepFreeAccess: true,
      hasElevator: true,
      hasOstomate: true,
      hasBabyChange: true,
      hasRamp: true,
      doorType: "開放型エントランス"
    },
    description: "KITTE公式バリアフリー情報より確認。施設内完全フラット・車いす対応テーブル席あり。",
    openingHours: "11:00 - 22:00",
    phone: "03-6269-9026",
    source: "official_map",
    verificationStatus: "verified"
  },

  // --- 遊ぶ場所 (Play) ---
  {
    id: "preset-play-toho-cinemas-hibiya",
    name: "TOHOシネマズ 日比谷",
    category: "play",
    categoryName: "映画館",
    lat: 35.673850,
    lng: 139.759280,
    address: "東京都千代田区有楽町1-1-2 東京ミッドタウン日比谷 4F",
    wheelchair: "yes",
    accessibility: {
      hasWheelchairToilet: true,
      hasStepFreeAccess: true,
      hasElevator: true,
      hasOstomate: true,
      hasBabyChange: true,
      hasRamp: true,
      doorType: "自動ドア"
    },
    description: "TOHOシネマズ公式劇場案内より確認。全スクリーン車いす専用鑑賞スペース設置（要事前予約推奨）。",
    openingHours: "09:00 - 24:00",
    phone: "050-6868-5068",
    source: "official_map",
    verificationStatus: "verified"
  },
  {
    id: "preset-play-mori-art-museum",
    name: "森美術館 (六本木ヒルズ 森タワー 53F)",
    category: "play",
    categoryName: "美術館",
    lat: 35.660470,
    lng: 139.729220,
    address: "東京都港区六本木6-10-1 六本木ヒルズ森タワー 53F",
    wheelchair: "yes",
    accessibility: {
      hasWheelchairToilet: true,
      hasStepFreeAccess: true,
      hasElevator: true,
      hasOstomate: true,
      hasBabyChange: true,
      hasRamp: true,
      doorType: "自動ドア"
    },
    description: "森美術館公式アクセシビリティ案内より確認。専用EV完備、展示室内完全フラット、車いす無料貸出あり。",
    openingHours: "10:00 - 22:00 (火曜は17:00まで)",
    phone: "050-5541-8600",
    source: "official_map",
    verificationStatus: "verified"
  }
];

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

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
