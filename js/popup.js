// 地図上のマーカー・ルート線に表示するポップアップの内容（ポイントGPS・ルート・スポット共通）

// 文字列をポップアップ用のHTMLに変換する
// 改行(\n)は <br> に変換して2行以上で表示する。CSSの white-space: pre-line は
// Leafletのポップアップ幅計算（一時的に nowrap にして1行幅を測る処理）を無効にし、
// 改行の無い名称まで数文字ごとに折り返されてしまうため使わない
function toPopupTextHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r?\n/g, '<br>');
}

// 値のある項目（ID・名称・英語名など）を1行ずつ並べ、最後の行に種別（'(Spot)' など）を付ける
export function popupHtml(values, label) {
    const lines = values
        .map(value => (value === undefined || value === null) ? '' : String(value).trim())
        .filter(text => text !== '')
        .map(toPopupTextHtml);
    return [...lines, label].join('<br>');
}
