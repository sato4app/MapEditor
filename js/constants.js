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
        // ポイントGPS: 緑(#00AA00)、円形、半径6px、白枠1px（minoh-hikingの緊急ポイントに合わせる）
        'ポイントGPS': {
            radius: 6,
            fillColor: '#00AA00',
            color: '#ffffff',
            weight: 1,
            stroke: true,
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
        // スポット: 青色(#1E90FF)、正方形、12x12px、白枠1px（minoh-hikingのスポットに合わせる）
        'spot': {
            radius: 12,
            fillColor: '#1E90FF',
            color: '#1E90FF',
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

// ===== 通行止め・通行困難地点（closure）の表示 =====

// 区分（kind）ごとのマーカースタイル。公開後にユーザーが見る地図（minoh-hiking）の
// 既定値に合わせ、見え方を揃える。
// closed: 赤の進入禁止（円に白の横棒）/ difficult: 黄色の警戒（三角に「!」）
export const CLOSURE_STYLES = {
    closed: { color: '#DC2626', shape: 'noEntry', size: 20 },
    difficult: { color: '#FACC15', shape: 'warning', size: 24 }
};

// 新規登録時の既定値。区分・登録理由は未選択にできないため、
// 読み込んだデータの区分が不正な場合もこの値へ寄せる。
export const CLOSURE_DEFAULT_KIND = 'closed';
export const CLOSURE_DEFAULT_REASON = '工事';

// マーカーアイコンの当たり領域（px）。形状の縁ぎりぎりでも掴んでドラッグできるよう、
// 実際の描画サイズより大きい正方形を確保する。
export const CLOSURE_ICON_BOX = 28;

// 選択中マーカーのハイライト色（アクア）
export const CLOSURE_HIGHLIGHT_COLOR = '#00ffff';

// 区分（kind）の表示ラベル
export const CLOSURE_KIND_LABELS = {
    closed: '通行止め',
    difficult: '通行困難'
};

// 統合GeoJSONで使われるclosure以外のtype。
// 統合GeoJSONを誤って「登録地点のファイル読み込み」で選んでも取り込まないための除外リスト。
export const NON_CLOSURE_TYPES = [
    'ポイントGPS', 'point', 'route', 'route_waypoint', 'spot', 'スポット', 'area'
];

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