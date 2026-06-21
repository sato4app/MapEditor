// 統計情報管理

// 統計情報の更新
export function updateStats(geoJsonData) {
    let pointCount = 0;        // ポイントGPS (type='ポイントGPS')
    let regularPointCount = 0; // ポイント (type='point')
    let waypointCount = 0;     // ルート中間点 (type='route_waypoint')
    let spotCount = 0;         // スポット (Point)
    let areaCount = 0;         // エリア (Polygon/MultiPolygon, type!=spot)
    let spotPolygonCount = 0;  // スポット (Polygon/MultiPolygon, type==spot)
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
                } else if (featureType === 'area') {
                    // Point area? Unusual but possible.
                    areaCount++;
                } else if (featureType === 'point') {
                    regularPointCount++;
                } else if (featureType === 'closure') {
                    // 通行止め・通行困難場所は専用パネルで管理するため統計には含めない
                } else {
                    // typeが指定されていない場合はポイントGPSとしてカウント
                    pointCount++;
                }
            }
            // Polygonはスポットまたはエリアとしてカウント
            else if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
                if (featureType === 'spot' || featureType === 'スポット') {
                    spotPolygonCount++;
                } else {
                    areaCount++;
                }
            }
        });
    }

    const lineBasedRouteCount = countRoutes(geoJsonData);
    const routeCount = lineBasedRouteCount > 0 ? lineBasedRouteCount : waypointRouteIdSet.size;

    document.getElementById('pointCount').value = pointCount;
    // ルートカウントはLineString/MultiLineStringの本数。無ければ中間点のroute_idユニーク数
    document.getElementById('routeCount').value = routeCount;
    // スポットカウントはスポットポイントとポリゴン(spot)の合計
    document.getElementById('spotCount').value = spotCount + spotPolygonCount;

    const areaCountDisplay = document.getElementById('areaCountDisplay');
    if (areaCountDisplay) {
        areaCountDisplay.value = areaCount;
    }

    const statsAreaCount = document.getElementById('statsAreaCount');
    if (statsAreaCount) {
        statsAreaCount.value = areaCount;
    }

    const waypointCountDisplay = document.getElementById('waypointCountDisplay');
    if (waypointCountDisplay) {
        waypointCountDisplay.value = regularPointCount;
    }
}

// 日付文字列生成関数（yyyymmdd形式）
export function getDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

// 日付文字列生成関数（ISO 8601 / YYYY-MM-DD形式）
export function getDateIso() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 日時文字列生成関数（ISO 8601 / タイムゾーンオフセット付き）
export function getDateTimeIso() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const offsetMinutes = -now.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(offsetMinutes);
    const offsetHH = pad(Math.floor(absMinutes / 60));
    const offsetMM = pad(absMinutes % 60);
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
        `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
        `${sign}${offsetHH}:${offsetMM}`;
}
