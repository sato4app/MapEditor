// アプリケーション全体で使用する定数定義

// デフォルト設定
export const DEFAULTS = {
    // 地図設定
    MAP_CENTER: [34.853667, 135.472041], // 箕面大滝
    MAP_ZOOM: 15,
    MAP_MAX_ZOOM: 18,

    // 地理院地図タイル
    GSI_TILE_URL: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    GSI_ATTRIBUTION: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',

    // スタイル設定
    POINT_STYLE: {
        radius: 6,
        fillColor: '#006400',
        color: '#006400',
        weight: 0,
        stroke: false,
        opacity: 1,
        fillOpacity: 1
    },

    LINE_STYLE: {
        color: '#3388ff',
        weight: 3,
        opacity: 0.8,
        fillOpacity: 0.3
    },

    // フィーチャータイプ別スタイル設定
    FEATURE_STYLES: {
        // ポイントGPS: 緑(#008000)、円形、半径6px（枠なし）
        'ポイントGPS': {
            radius: 6,
            fillColor: '#008000',
            color: '#008000',
            weight: 0,
            stroke: false,
            opacity: 1,
            fillOpacity: 1
        },
        // ルート中間点: 橙色(#f58220)、菱形（ダイヤモンド型）、8x8px（枠なし）
        'route_waypoint': {
            radius: 4,
            fillColor: '#f58220',
            color: '#f58220',
            weight: 0,
            stroke: false,
            opacity: 1,
            fillOpacity: 0.8,
            shape: 'diamond'
        },
        // スポット: 青色(#0000ff)、正方形、12x12px（枠なし）
        'spot': {
            radius: 12,
            fillColor: '#0000ff',
            color: '#0000ff',
            weight: 0,
            stroke: false,
            opacity: 1,
            fillOpacity: 0.8,
            shape: 'square'
        }
    },

};

// モード定数
export const MODES = {
    GEOJSON: 'geojson',
    ROUTE: 'route',
    SPOT: 'spot'
};

// スポット区分のリスト
export const SPOT_CATEGORIES = [
    '旧跡',
    '神社・仏閣',
    '石碑・記念碑',
    '展望台',
    '休憩所',
    'トイレ',
    'バス停',
    '交差点'
];