// ルート編集機能

import { DEFAULTS } from './constants.js';
import { showMessage } from './message.js';

// ルート編集の状態管理
export const state = {
    allPoints: [],
    allRoutes: [],
    selectedRouteId: null,
    selectedRouteLine: null,
    routeLineMap: new Map(), // routeId -> 背景ポリライン (geoJsonLayerに追加したもの)
    isAddMoveMode: false,
    isDeleteMode: false,
    mapClickHandler: null,
    draggableMarkers: []
};

// ポイントとルートの抽出
export function extractPointsAndRoutes(geoJsonData) {
    state.allPoints = [];
    state.allRoutes = [];

    if (!geoJsonData || !geoJsonData.features) {
        return;
    }

    const routeIdSet = new Set();

    geoJsonData.features.forEach(feature => {
        const featureType = feature.properties && feature.properties.type;
        const geometryType = feature.geometry && feature.geometry.type;

        // ポイントGPS / point を収集
        if (geometryType === 'Point' && (featureType === 'ポイントGPS' || featureType === 'point')) {
            const pointId = feature.properties && feature.properties.id;
            if (pointId) {
                state.allPoints.push(pointId);
            }
        }

        // ルート中間点(Point)からroute_idを収集
        if (geometryType === 'Point' && featureType === 'route_waypoint') {
            const routeId = feature.properties && feature.properties.route_id;
            if (routeId) {
                routeIdSet.add(routeId);
            }
        }

        // LineString ルート (type='route') からも route_id を収集
        if (geometryType === 'LineString' && featureType === 'route') {
            const routeId = feature.properties && feature.properties.id;
            if (routeId) {
                routeIdSet.add(routeId);
            }
        }

        // LineString ルート (type='route_waypoint') からも route_id を収集（GeoReferencer形式）
        if (geometryType === 'LineString' && featureType === 'route_waypoint') {
            const routeId = feature.properties && feature.properties.id;
            if (routeId) {
                routeIdSet.add(routeId);
            }
        }
    });

    // route_idからルートを構築
    routeIdSet.forEach(routeId => {
        const match = routeId.match(/^route_(.+)_to_(.+)$/);
        if (match) {
            state.allRoutes.push({
                routeId: routeId,
                startId: match[1],
                endId: match[2]
            });
        }
    });
}

// ドロップダウンの更新
export function updateDropdowns(loadedData) {
    const routeStartSelect = document.getElementById('routeStart');
    const previousStartSelection = routeStartSelect.value;

    // allRoutesから実際にルートが存在するポイントIDの1文字目を収集
    const routePointIds = new Set();
    state.allRoutes.forEach(route => {
        routePointIds.add(route.startId);
        routePointIds.add(route.endId);
    });
    const firstChars = [...new Set([...routePointIds].map(id => id.charAt(0)))].sort();

    routeStartSelect.innerHTML = '<option value=""></option>';
    firstChars.forEach(char => {
        const option = document.createElement('option');
        option.value = char;
        option.textContent = char;
        routeStartSelect.appendChild(option);
    });

    if (previousStartSelection) {
        routeStartSelect.value = previousStartSelection;
    }

    updateRouteLongDropdown(loadedData);
}

export function updateRouteLongDropdown(loadedData) {
    const routeStartSelect = document.getElementById('routeStart');
    const routeEndSelect = document.getElementById('routeEnd');
    const startCharFilter = routeStartSelect.value;
    const previousEndSelection = routeEndSelect.value;

    let filteredPointIds = [];
    if (startCharFilter) {
        const routePointIds = new Set();
        state.allRoutes.forEach(route => {
            if (route.startId.charAt(0) === startCharFilter) {
                routePointIds.add(route.startId);
            }
            if (route.endId.charAt(0) === startCharFilter) {
                routePointIds.add(route.endId);
            }
        });
        filteredPointIds = [...routePointIds].sort();
    } else {
        const allRoutePointIds = new Set();
        state.allRoutes.forEach(route => {
            allRoutePointIds.add(route.startId);
            allRoutePointIds.add(route.endId);
        });
        filteredPointIds = [...allRoutePointIds].sort();
    }

    routeEndSelect.innerHTML = '<option value="">選択</option>';
    filteredPointIds.forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = id;
        routeEndSelect.appendChild(option);
    });

    if (previousEndSelection) {
        routeEndSelect.value = previousEndSelection;
    }

    updateRoutePathDropdown(loadedData);

}

export function updateRoutePathDropdown(loadedData) {
    const routeStartSelect = document.getElementById('routeStart');
    const routeEndSelect = document.getElementById('routeEnd');
    const routePathSelect = document.getElementById('routePath');
    const startCharFilter = routeStartSelect.value;
    const endIdFilter = routeEndSelect.value;
    const previousSelection = routePathSelect.value;

    let filteredRoutes = state.allRoutes;

    if (startCharFilter) {
        filteredRoutes = filteredRoutes.filter(r =>
            r.startId.charAt(0) === startCharFilter || r.endId.charAt(0) === startCharFilter
        );
    }

    if (endIdFilter) {
        filteredRoutes = filteredRoutes.filter(r =>
            r.startId === endIdFilter || r.endId === endIdFilter
        );
    }

    filteredRoutes = [...filteredRoutes].sort((a, b) => {
        const cmp = a.startId.localeCompare(b.startId, undefined, { numeric: true });
        return cmp !== 0 ? cmp : a.endId.localeCompare(b.endId, undefined, { numeric: true });
    });

    routePathSelect.innerHTML = '<option value="">開始 ～ 終了ポイント</option>';
    filteredRoutes.forEach(route => {
        const waypointCount = loadedData.features.filter(f =>
            f.properties && f.properties.route_id === route.routeId && f.properties.type === 'route_waypoint'
        ).length;

        const option = document.createElement('option');
        option.value = route.routeId;
        option.textContent = `${route.startId} ～ ${route.endId} (${waypointCount})`;
        routePathSelect.appendChild(option);
    });

    if (previousSelection) {
        routePathSelect.value = previousSelection;
    }

}

// ポイントIDからフィーチャーを取得（ポイントGPS優先、スポットにフォールバック）
function getPointFeature(id, loadedData) {
    if (!loadedData || !loadedData.features) return null;
    return loadedData.features.find(f => f.properties && f.properties.type === 'ポイントGPS' && (f.properties.id === id || f.properties.pointId === id))
        || loadedData.features.find(f => f.properties && f.properties.type === 'point' && (f.properties.id === id || f.properties.pointId === id))
        || loadedData.features.find(f => f.properties && f.properties.type === 'spot' && (f.properties.id === id || f.properties.name === id) && f.geometry && f.geometry.type === 'Point');
}

// スポットを名前またはIDで検索（全マッチを返す）
function findSpotsByNameOrId(nameOrId, loadedData) {
    if (!loadedData || !loadedData.features) return [];
    return loadedData.features.filter(f =>
        f.properties && f.properties.type === 'spot' &&
        f.geometry && f.geometry.type === 'Point' &&
        (f.properties.id === nameOrId || f.properties.name === nameOrId)
    );
}

// 基準座標に最も近いフィーチャーを返す
function findNearestFeature(features, refLat, refLng) {
    if (features.length === 0) return null;
    if (features.length === 1) return features[0];
    let nearest = null;
    let minDist = Infinity;
    features.forEach(f => {
        if (!f.geometry || !f.geometry.coordinates) return;
        const [lng, lat] = f.geometry.coordinates;
        const d = (lat - refLat) ** 2 + (lng - refLng) ** 2;
        if (d < minDist) { minDist = d; nearest = f; }
    });
    return nearest;
}

// GeoJSONから座標を取得
export function getCoordinatesFromGeoJSON(routeId, loadedData) {
    if (!loadedData || !loadedData.features) return null;

    const coordinates = [];
    const match = routeId.match(/^route_(.+)_to_(.+)$/);
    if (!match) return null;

    const startId = match[1];
    const endId = match[2];

    // type='ポイントGPS' を優先、なければ type='point' にフォールバック（spotは含まない）
    function findGpsOrPoint(id) {
        return loadedData.features.find(f => f.properties && f.properties.type === 'ポイントGPS' && f.properties.id === id)
            || loadedData.features.find(f => f.properties && f.properties.type === 'point' && f.properties.id === id);
    }

    let startFeature = findGpsOrPoint(startId);
    let endFeature = findGpsOrPoint(endId);

    // GPS/pointで見つからなかった場合、スポットにフォールバック（相手の座標を参照して最近傍を選択）
    if (!startFeature) {
        const refCoords = endFeature && endFeature.geometry ? endFeature.geometry.coordinates : null;
        const spots = findSpotsByNameOrId(startId, loadedData);
        startFeature = (spots.length <= 1 || !refCoords)
            ? (spots[0] || null)
            : findNearestFeature(spots, refCoords[1], refCoords[0]);
    }
    if (!endFeature) {
        const refCoords = startFeature && startFeature.geometry ? startFeature.geometry.coordinates : null;
        const spots = findSpotsByNameOrId(endId, loadedData);
        endFeature = (spots.length <= 1 || !refCoords)
            ? (spots[0] || null)
            : findNearestFeature(spots, refCoords[1], refCoords[0]);
    }

    if (startFeature && startFeature.geometry && startFeature.geometry.coordinates) {
        const [lng, lat] = startFeature.geometry.coordinates;
        coordinates.push([lat, lng]);
    }

    const waypoints = loadedData.features
        .filter(f => f.properties && f.properties.route_id === routeId && f.properties.type === 'route_waypoint')
        .sort((a, b) => {
            const numA = parseInt(a.properties.waypoint_number) || 0;
            const numB = parseInt(b.properties.waypoint_number) || 0;
            return numA - numB;
        });

    waypoints.forEach(wp => {
        if (wp.geometry && wp.geometry.coordinates) {
            const [lng, lat] = wp.geometry.coordinates;
            coordinates.push([lat, lng]);
        }
    });

    // フォールバック: route_waypoint Point がない場合、type='route_waypoint' LineString の座標を中間点として使用（GeoReferencer形式）
    if (waypoints.length === 0) {
        const waypointLine = loadedData.features.find(f =>
            f.properties && f.properties.type === 'route_waypoint' &&
            f.properties.id === routeId &&
            f.geometry && f.geometry.type === 'LineString'
        );
        if (waypointLine) {
            waypointLine.geometry.coordinates.forEach(coord => {
                coordinates.push([coord[1], coord[0]]);
            });
        }
    }

    if (endFeature && endFeature.geometry && endFeature.geometry.coordinates) {
        const [lng, lat] = endFeature.geometry.coordinates;
        coordinates.push([lat, lng]);
    }

    // ポイントGPS + route_waypoint から座標が取れた場合はそれを返す
    if (coordinates.length >= 2) return coordinates;

    // フォールバック: type='route' LineString から直接座標を取得（GeoReferencer形式互換）
    const routeLineFeature = loadedData.features.find(f =>
        f.properties && f.properties.type === 'route' &&
        f.properties.id === routeId &&
        f.geometry && f.geometry.type === 'LineString'
    );
    if (routeLineFeature && routeLineFeature.geometry.coordinates.length >= 2) {
        return routeLineFeature.geometry.coordinates.map(c => [c[1], c[0]]);
    }

    return null;
}

// 全ルートの背景ポリラインを初期化（選択状態によらず常に表示）
export function initAllRouteLines(loadedData, geoJsonLayer) {
    state.allRoutes.forEach(({ routeId }) => {
        const coordinates = getCoordinatesFromGeoJSON(routeId, loadedData);
        if (coordinates && coordinates.length >= 2) {
            if (state.routeLineMap.has(routeId)) {
                state.routeLineMap.get(routeId).setLatLngs(coordinates);
            } else {
                const line = L.polyline(coordinates, { color: '#f58220', weight: 2, opacity: 0.7 });
                geoJsonLayer.addLayer(line);
                state.routeLineMap.set(routeId, line);
            }
        }
    });
}

// ルートハイライト
export function highlightRoute(routeId, loadedData, markerMap, map) {
    resetRouteHighlight(markerMap, map, loadedData);

    if (!routeId) return;

    state.selectedRouteId = routeId;

    const match = routeId.match(/^route_(.+)_to_(.+)$/);
    if (!match) return;

    const startId = match[1];
    const endId = match[2];

    const startMarker = markerMap.get(startId);
    const endMarker = markerMap.get(endId);

    // ポイントGPS・スポットはアクア、geojsonポイントはピンクでハイライト
    const startFeature = getPointFeature(startId, loadedData);
    const endFeature = getPointFeature(endId, loadedData);
    const startType = startFeature && startFeature.properties.type;
    const endType = endFeature && endFeature.properties.type;
    const startColor = (startType === 'ポイントGPS') ? '#00FF00' : '#ff69b4';
    const endColor = (endType === 'ポイントGPS') ? '#00FF00' : '#ff69b4';

    if (startMarker && startMarker.setStyle) {
        startMarker.setStyle({ fillColor: startColor, color: startColor });
        if (startMarker.setRadius) startMarker.setRadius(6.5);
    } else if (startType === 'spot' && startMarker && startMarker.setIcon) {
        startMarker.setIcon(L.divIcon({
            className: 'custom-div-icon',
            html: '<div class="marker-pin marker-square" style="background-color: #00FFFF; border-color: #00FFFF;"></div>',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        }));
    }
    if (endMarker && endMarker.setStyle) {
        endMarker.setStyle({ fillColor: endColor, color: endColor });
        if (endMarker.setRadius) endMarker.setRadius(6.5);
    } else if (endType === 'spot' && endMarker && endMarker.setIcon) {
        endMarker.setIcon(L.divIcon({
            className: 'custom-div-icon',
            html: '<div class="marker-pin marker-square" style="background-color: #00FFFF; border-color: #00FFFF;"></div>',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        }));
    }

    // 中間点マーカーをサイズ拡大（radius=3）・色変更して再描画
    redrawWaypointMarkers(routeId, loadedData, markerMap, window.geoJsonLayer);

    const coordinates = getCoordinatesFromGeoJSON(routeId, loadedData);
    if (coordinates) {
        state.selectedRouteLine = L.polyline(coordinates, {
            color: '#ef454a',
            weight: 2
        }).addTo(map);
    }
}

// ルートハイライトのリセット
export function resetRouteHighlight(markerMap, map, loadedData) {
    if (!state.selectedRouteId) return;

    const prevRouteId = state.selectedRouteId;

    const match = prevRouteId.match(/^route_(.+)_to_(.+)$/);
    if (match) {
        const startId = match[1];
        const endId = match[2];

        const startMarker = markerMap.get(startId);
        const endMarker = markerMap.get(endId);

        // タイプに応じたデフォルトスタイルに戻す
        const startFeature = loadedData ? getPointFeature(startId, loadedData) : null;
        const endFeature = loadedData ? getPointFeature(endId, loadedData) : null;
        const startType = startFeature && startFeature.properties.type;
        const endType = endFeature && endFeature.properties.type;
        const startDefaultStyle = (startType === 'point')
            ? DEFAULTS.FEATURE_STYLES['point']
            : DEFAULTS.FEATURE_STYLES['ポイントGPS'];
        const endDefaultStyle = (endType === 'point')
            ? DEFAULTS.FEATURE_STYLES['point']
            : DEFAULTS.FEATURE_STYLES['ポイントGPS'];

        if (startMarker && startMarker.setStyle) {
            startMarker.setStyle(startDefaultStyle);
            if (startMarker.setRadius) startMarker.setRadius(startDefaultStyle.radius);
        } else if (startType === 'spot' && startMarker && startMarker.setIcon) {
            startMarker.setIcon(L.divIcon({
                className: 'custom-div-icon',
                html: '<div class="marker-pin marker-square" style="width: 10px; height: 10px;"></div>',
                iconSize: [10, 10],
                iconAnchor: [5, 5]
            }));
        }
        if (endMarker && endMarker.setStyle) {
            endMarker.setStyle(endDefaultStyle);
            if (endMarker.setRadius) endMarker.setRadius(endDefaultStyle.radius);
        } else if (endType === 'spot' && endMarker && endMarker.setIcon) {
            endMarker.setIcon(L.divIcon({
                className: 'custom-div-icon',
                html: '<div class="marker-pin marker-square" style="width: 10px; height: 10px;"></div>',
                iconSize: [10, 10],
                iconAnchor: [5, 5]
            }));
        }
    }

    if (state.selectedRouteLine) {
        map.removeLayer(state.selectedRouteLine);
        state.selectedRouteLine = null;
    }

    state.selectedRouteId = null;

    // 中間点マーカーをデフォルトサイズ・色に戻す
    if (loadedData && window.geoJsonLayer) {
        redrawWaypointMarkers(prevRouteId, loadedData, markerMap, window.geoJsonLayer);
    }
}

// 中間点を追加
export function addWaypointToRoute(routeId, latlng, loadedData, markerMap, geoJsonLayer) {
    if (!loadedData || !loadedData.features) return;

    let maxWaypointNumber = 0;
    loadedData.features.forEach(feature => {
        if (feature.properties && feature.properties.route_id === routeId && feature.properties.type === 'route_waypoint') {
            const num = parseInt(feature.properties.waypoint_number) || 0;
            if (num > maxWaypointNumber) {
                maxWaypointNumber = num;
            }
        }
    });

    const newWaypoint = {
        type: 'Feature',
        properties: {
            type: 'route_waypoint',
            route_id: routeId,
            waypoint_number: (maxWaypointNumber + 1).toString()
        },
        geometry: {
            type: 'Point',
            coordinates: [latlng.lng, latlng.lat]
        }
    };

    loadedData.features.push(newWaypoint);

    const style = DEFAULTS.FEATURE_STYLES['route_waypoint'];
    const marker = L.marker(latlng, {
        icon: L.divIcon({
            className: 'diamond-marker',
            html: `<div style="width: ${style.radius * 2}px; height: ${style.radius * 2}px; background-color: #ef454a; transform: rotate(45deg); opacity: ${style.fillOpacity};"></div>`,
            iconSize: [style.radius * 2, style.radius * 2],
            iconAnchor: [style.radius, style.radius]
        })
    }).addTo(geoJsonLayer);

    if (!markerMap.has(routeId)) {
        markerMap.set(routeId, []);
    }
    markerMap.get(routeId).push(marker);

    updateRoutePathDropdown(loadedData);
    optimizeRoute(routeId, false, loadedData, markerMap);
}

// ルート線を再描画
export function redrawRouteLine(routeId, loadedData, map) {
    if (state.selectedRouteLine) {
        map.removeLayer(state.selectedRouteLine);
        state.selectedRouteLine = null;
    }

    // 背景ポリライン: 常に古い線を削除
    const bgLine = state.routeLineMap.get(routeId);
    if (bgLine && window.geoJsonLayer) {
        window.geoJsonLayer.removeLayer(bgLine);
        state.routeLineMap.delete(routeId);
    }

    const coordinates = getCoordinatesFromGeoJSON(routeId, loadedData);
    if (coordinates) {
        state.selectedRouteLine = L.polyline(coordinates, {
            color: '#ef454a',
            weight: 2
        }).addTo(map);

        if (window.geoJsonLayer) {
            const newBgLine = L.polyline(coordinates, { color: '#f58220', weight: 2, opacity: 0.7 });
            window.geoJsonLayer.addLayer(newBgLine);
            state.routeLineMap.set(routeId, newBgLine);
        }
    }
}

// 中間点マーカーを再描画
export function redrawWaypointMarkers(routeId, loadedData, markerMap, geoJsonLayer) {
    // markerMapに登録されているマーカーを削除
    const waypointMarkers = markerMap.get(routeId);
    if (Array.isArray(waypointMarkers)) {
        waypointMarkers.forEach(marker => {
            // ドラッグを確実に無効化
            if (marker.dragging) {
                marker.dragging.disable();
            }
            // すべてのイベントリスナーを削除
            marker.off();
            // レイヤーから削除
            geoJsonLayer.removeLayer(marker);
        });
        markerMap.delete(routeId);
    }

    const waypoints = loadedData.features
        .filter(f => f.properties && f.properties.route_id === routeId && f.properties.type === 'route_waypoint')
        .sort((a, b) => {
            const numA = parseInt(a.properties.waypoint_number) || 0;
            const numB = parseInt(b.properties.waypoint_number) || 0;
            return numA - numB;
        });

    const isSelected = state.selectedRouteId === routeId;
    const markerColor = isSelected ? '#ef454a' : '#f58220';
    const style = DEFAULTS.FEATURE_STYLES['route_waypoint'];
    const radius = isSelected ? 3 : style.radius; // 選択中は radius=3 (6px)、それ以外はデフォルト (2.5px)
    const markerPx = radius * 2;
    const newMarkers = [];

    waypoints.forEach(wp => {
        if (wp.geometry && wp.geometry.coordinates) {
            const [lng, lat] = wp.geometry.coordinates;
            const marker = L.marker([lat, lng], {
                draggable: true,
                icon: L.divIcon({
                    className: 'diamond-marker',
                    html: `<div style="width: ${markerPx}px; height: ${markerPx}px; background-color: ${markerColor}; transform: rotate(45deg); opacity: ${style.fillOpacity};"></div>`,
                    iconSize: [markerPx, markerPx],
                    iconAnchor: [radius, radius]
                })
            }).addTo(geoJsonLayer);
            // 追加・移動モード以外ではドラッグを無効化
            if (marker.dragging) marker.dragging.disable();

            newMarkers.push(marker);
        }
    });

    markerMap.set(routeId, newMarkers);
}

// 中間点の座標を更新
export function updateWaypointCoordinates(routeId, waypointIndex, latlng, loadedData) {
    if (!loadedData || !loadedData.features) return;

    const waypoints = loadedData.features
        .filter(f => f.properties && f.properties.route_id === routeId && f.properties.type === 'route_waypoint')
        .sort((a, b) => {
            const numA = parseInt(a.properties.waypoint_number) || 0;
            const numB = parseInt(b.properties.waypoint_number) || 0;
            return numA - numB;
        });

    if (waypoints[waypointIndex]) {
        waypoints[waypointIndex].geometry.coordinates = [latlng.lng, latlng.lat];
    }
}

// 中間点を削除
export function deleteWaypoint(routeId, marker, loadedData, markerMap, map) {
    if (!loadedData || !loadedData.features) return;

    const markerLatLng = marker.getLatLng();

    const waypointIndex = loadedData.features.findIndex(f => {
        if (f.properties && f.properties.route_id === routeId && f.properties.type === 'route_waypoint') {
            if (f.geometry && f.geometry.coordinates) {
                const [lng, lat] = f.geometry.coordinates;
                return Math.abs(lat - markerLatLng.lat) < 0.000001 && Math.abs(lng - markerLatLng.lng) < 0.000001;
            }
        }
        return false;
    });

    if (waypointIndex !== -1) {
        loadedData.features.splice(waypointIndex, 1);
        if (window.geoJsonLayer) {
            window.geoJsonLayer.removeLayer(marker);
        } else {
            map.removeLayer(marker);
        }

        const waypointMarkers = markerMap.get(routeId);
        if (Array.isArray(waypointMarkers)) {
            const markerIdx = waypointMarkers.indexOf(marker);
            if (markerIdx !== -1) {
                waypointMarkers.splice(markerIdx, 1);
            }
        }

        optimizeRoute(routeId, false, loadedData, markerMap);
        redrawRouteLine(routeId, loadedData, map);
        updateRoutePathDropdown(loadedData);

        // 削除モードが有効な場合、再描画されたマーカーに削除イベントを再設定
        if (state.isDeleteMode) {
            makeWaypointsClickable(routeId, loadedData, markerMap, map);
        }
    }
}

// 2点間の距離を計算（ハバーサイン公式）
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ルートを最適化（貪欲法）
export function optimizeRoute(routeId, showMessages = true, loadedData, markerMap) {
    if (!loadedData || !loadedData.features) return;

    const match = routeId.match(/^route_(.+)_to_(.+)$/);
    if (!match) return;

    const startId = match[1];
    const endId = match[2];

    // type='ポイントGPS' を優先、なければ type='point'、最後に type='spot' にフォールバック
    const startFeature = loadedData.features.find(f => f.properties && f.properties.type === 'ポイントGPS' && f.properties.id === startId)
        || loadedData.features.find(f => f.properties && f.properties.type === 'point' && f.properties.id === startId)
        || findSpotsByNameOrId(startId, loadedData)[0] || null;
    const endFeature = loadedData.features.find(f => f.properties && f.properties.type === 'ポイントGPS' && f.properties.id === endId)
        || loadedData.features.find(f => f.properties && f.properties.type === 'point' && f.properties.id === endId)
        || findSpotsByNameOrId(endId, loadedData)[0] || null;

    if (!startFeature || !endFeature) {
        if (showMessages) {
            showMessage('開始ポイントまたは終了ポイントが見つかりません', 'error');
        }
        return;
    }

    const [startLng, startLat] = startFeature.geometry.coordinates;
    const [endLng, endLat] = endFeature.geometry.coordinates;

    const waypoints = loadedData.features.filter(f =>
        f.properties && f.properties.route_id === routeId && f.properties.type === 'route_waypoint'
    );

    if (waypoints.length === 0) {
        return;
    }

    const optimizedWaypoints = [];
    const remainingWaypoints = [...waypoints];
    let currentLat = startLat;
    let currentLng = startLng;

    while (remainingWaypoints.length > 0) {
        let nearestIndex = 0;
        let minDistance = Infinity;

        remainingWaypoints.forEach((wp, index) => {
            const [wpLng, wpLat] = wp.geometry.coordinates;
            const distance = calculateDistance(currentLat, currentLng, wpLat, wpLng);
            if (distance < minDistance) {
                minDistance = distance;
                nearestIndex = index;
            }
        });

        const nearestWaypoint = remainingWaypoints.splice(nearestIndex, 1)[0];
        optimizedWaypoints.push(nearestWaypoint);
        [currentLng, currentLat] = nearestWaypoint.geometry.coordinates;
    }

    optimizedWaypoints.forEach((wp, index) => {
        wp.properties.waypoint_number = (index + 1).toString();
    });

    redrawWaypointMarkers(routeId, loadedData, markerMap, window.geoJsonLayer);

    if (showMessages) {
        showMessage(`ルートを最適化しました（${optimizedWaypoints.length}個の中間点）`, 'success');
    }
}

// 中間点をドラッグ可能にする（追加・移動モード用）
export function makeWaypointsClickableForAddMove(routeId, loadedData, markerMap, map) {
    const waypointMarkers = markerMap.get(routeId);
    if (!Array.isArray(waypointMarkers)) return;

    waypointMarkers.forEach((marker, index) => {
        marker.off('drag');
        marker.off('dragend');
        marker.off('click');

        if (marker.dragging) marker.dragging.enable();

        const el = marker.getElement && marker.getElement();
        if (el) el.style.cursor = 'move';

        marker.on('drag', function () {
            const newLatLng = marker.getLatLng();
            updateWaypointCoordinates(routeId, index, newLatLng, loadedData);
            redrawRouteLine(routeId, loadedData, map);
        });

        marker.on('dragend', function () {
            const newLatLng = marker.getLatLng();
            updateWaypointCoordinates(routeId, index, newLatLng, loadedData);
            optimizeRoute(routeId, false, loadedData, markerMap);
            redrawRouteLine(routeId, loadedData, map);
            if (state.isAddMoveMode) {
                makeWaypointsClickableForAddMove(routeId, loadedData, markerMap, map);
            }
        });
    });
}

// 中間点をクリック可能にする（削除モード用）
export function makeWaypointsClickable(routeId, loadedData, markerMap, map) {
    const waypointMarkers = markerMap.get(routeId);
    if (!Array.isArray(waypointMarkers)) return;

    waypointMarkers.forEach(marker => {
        if (marker && marker.getElement) {
            const element = marker.getElement();
            if (element) {
                element.style.cursor = 'pointer';

                marker.on('click', function(e) {
                    if (!state.isDeleteMode) return;

                    L.DomEvent.stopPropagation(e);
                    deleteWaypoint(routeId, marker, loadedData, markerMap, map);
                });
            }
        }
    });
}

// 追加・移動モードを解除
export function exitAddMoveMode(markerMap, map) {
    if (!state.isAddMoveMode) return;

    state.isAddMoveMode = false;

    const addMoveBtn = document.getElementById('addMoveRouteBtn');
    if (addMoveBtn) {
        addMoveBtn.classList.remove('active');
    }

    if (state.mapClickHandler) {
        map.off('click', state.mapClickHandler);
        state.mapClickHandler = null;
    }

    if (state.selectedRouteId) {
        const waypointMarkers = markerMap.get(state.selectedRouteId);
        if (Array.isArray(waypointMarkers)) {
            waypointMarkers.forEach(marker => {
                if (marker && marker.dragging) {
                    marker.dragging.disable();
                }
                const element = marker.getElement && marker.getElement();
                if (element) {
                    element.style.cursor = '';
                }
                marker.off('click');
            });
        }
    }

    state.draggableMarkers = [];
    map.getContainer().style.cursor = '';
}

// 削除モードを解除
export function exitDeleteMode(markerMap) {
    if (!state.isDeleteMode) return;

    state.isDeleteMode = false;

    const deleteBtn = document.getElementById('deleteRouteBtn');
    deleteBtn.classList.remove('active');

    if (state.selectedRouteId) {
        const waypointMarkers = markerMap.get(state.selectedRouteId);
        if (Array.isArray(waypointMarkers)) {
            waypointMarkers.forEach(marker => {
                const element = marker.getElement && marker.getElement();
                if (element) {
                    element.style.cursor = '';
                }
                marker.off('click');
            });
        }
    }
}

// 状態管理用のセッター関数
export function setSelectedRouteId(id) {
    state.selectedRouteId = id;
}

export function setIsAddMoveMode(value) {
    state.isAddMoveMode = value;
}

export function setIsDeleteMode(value) {
    state.isDeleteMode = value;
}

export function setMapClickHandler(handler) {
    state.mapClickHandler = handler;
}

export function setDraggableMarkers(markers) {
    state.draggableMarkers = markers;
}
