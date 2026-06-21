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

    // Excel読み込み制限
    MAX_EXCEL_ROWS: 1000, // ヘッダー行含む最大読み込み行数

    // 重複スポット判定: 同名かつこの距離(メートル)以内のものを重複とみなす
    DUPLICATE_SPOT_DISTANCE_M: 30,

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
        // ポイント: 赤色(#ff0000)、円形
        'point': {
            radius: 6,
            fillColor: '#ff0000',
            color: '#ff0000',
            weight: 0,
            stroke: false,
            opacity: 1,
            fillOpacity: 1
        },
        // ルート中間点: 橙色(#f58220)、菱形（ダイヤモンド型）、5x5px（枠なし）
        'route_waypoint': {
            radius: 2.5,
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
        },
        // 通行止め・通行困難場所: 赤色(#e60000)、正方形、12x12px（枠なし）
        'closure': {
            radius: 12,
            fillColor: '#e60000',
            color: '#e60000',
            weight: 0,
            stroke: false,
            opacity: 1,
            fillOpacity: 0.8,
            shape: 'square'
        },
        // エリア: シアン(#00ffff)、ポリゴン境界線、頂点は円形(radius 4)
        'area': {
            color: '#00ffff',
            weight: 3,
            opacity: 1,
            fillOpacity: 0.2,
            vertex: {
                radius: 4,
                shape: 'circle'
            }
        }
    },

};

// モード定数
export const MODES = {
    GEOJSON: 'geojson',
    ROUTE: 'route',
    SPOT: 'spot',
    CLOSURE: 'closure',
    AREA: 'area'
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