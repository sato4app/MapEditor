// 標高取得機能（国土地理院 標高API）

// 指定した緯度経度の標高(メートル)を返す。
// 取得できない場合（海上・データ無し・通信エラー）は null を返す。
export async function fetchElevation(lat, lng) {
    const url = `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=${lng}&lat=${lat}&outtype=JSON`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }
        const data = await response.json();
        const ele = data && data.elevation;

        if (typeof ele === 'number') {
            return ele;
        }

        // データ無しの場合は "-----" 等の文字列が返るため数値変換を試みる
        const parsed = parseFloat(ele);
        return Number.isFinite(parsed) ? parsed : null;
    } catch (error) {
        console.warn('標高の取得に失敗しました:', error);
        return null;
    }
}
