// 地図上のマーカー・ルート線に表示するポップアップの内容（ポイントGPS・ルート・スポット共通）と、HTMLのエスケープ

// HTMLのエスケープ。Leaflet のポップアップ・ラベルは文字列を HTML として解釈するため、
// ファイルや入力欄に由来する値は必ずこれを通してから埋め込む
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 文字列をポップアップ用のHTMLに変換する
// 改行(\n)は <br> に変換して2行以上で表示する。CSSの white-space: pre-line は
// Leafletのポップアップ幅計算（一時的に nowrap にして1行幅を測る処理）を無効にし、
// 改行の無い名称まで数文字ごとに折り返されてしまうため使わない
function toPopupTextHtml(text) {
    return escapeHtml(text).replace(/\r?\n/g, '<br>');
}

// 値のある項目（ID・名称・英語名など）を1行ずつ並べ、最後の行に種別（'(Spot)' など）を付ける
export function popupHtml(values, label) {
    const lines = values
        .map(value => (value === undefined || value === null) ? '' : String(value).trim())
        .filter(text => text !== '')
        .map(toPopupTextHtml);
    return [...lines, label].join('<br>');
}
