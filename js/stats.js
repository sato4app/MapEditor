// 統計情報管理

// 統計情報の更新
export function updateStats(geoJsonData) {
    let pointCount = 0;      // ポイントGPS
    let waypointCount = 0;   // ルート中間点
    let spotCount = 0;       // スポット
    let polygonCount = 0;    // ポリゴン
    const waypointRouteIdSet = new Set(); // ルートID収集（中間点から補完）

    // 再帰的にLineString/MultiLineStringを数える
    function countRoutes(obj) {
        if (!obj) return 0;
        const t = obj.type;
        if (t === 'FeatureCollection' && Array.isArray(obj.features)) {
            return obj.features.reduce((sum, f) => sum + countRoutes(f), 0);
        }
        if (t === 'Feature') {
            return countRoutes(obj.geometry);
        }
        if (t === 'GeometryCollection' && Array.isArray(obj.geometries)) {
            return obj.geometries.reduce((sum, g) => sum + countRoutes(g), 0);
        }
        if (t === 'LineString' || t === 'MultiLineString') {
            return 1;
        }
        return 0;
    }

    if (geoJsonData && geoJsonData.features) {
        geoJsonData.features.forEach(feature => {
            const featureType = feature.properties && feature.properties.type;
            const geometryType = feature.geometry && feature.geometry.type;

            // Pointの場合はプロパティのtypeで分類
            if (geometryType === 'Point') {
                if (featureType === 'ポイントGPS') {
                    pointCount++;
                } else if (featureType === 'route_waypoint') {
                    waypointCount++;
                    const rid = feature.properties && feature.properties.route_id;
                    if (rid) waypointRouteIdSet.add(rid);
                } else if (featureType === 'spot') {
                    spotCount++;
                } else {
                    // typeが指定されていない場合はポイントとしてカウント
                    pointCount++;
                }
            }
            // Polygonはスポットまたはポリゴンとしてカウント
            else if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
                polygonCount++;
            }
        });
    }

    const lineBasedRouteCount = countRoutes(geoJsonData);
    const routeCount = lineBasedRouteCount > 0 ? lineBasedRouteCount : waypointRouteIdSet.size;

    document.getElementById('fileCount').value = geoJsonData ? '1' : '0';
    document.getElementById('pointCount').value = pointCount;
    // ルートカウントはLineString/MultiLineStringの本数。無ければ中間点のroute_idユニーク数
    document.getElementById('routeCount').value = routeCount;
    // スポットカウントはスポットポイントとポリゴンの合計
    document.getElementById('spotCount').value = spotCount + polygonCount;
}

// 日付文字列生成関数（yyyymmdd形式）
export function getDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}
