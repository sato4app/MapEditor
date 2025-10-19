// ルート編集機能

import { DEFAULTS } from './constants.js';
import { showMessage } from './message.js';

// ルート編集の状態管理
export const state = {
    allPoints: [],
    allRoutes: [],
    selectedRouteId: null,
    selectedRouteLine: null,
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

        // ポイントGPSを収集
        if (geometryType === 'Point' && featureType === 'ポイントGPS') {
            const pointId = feature.properties && feature.properties.id;
            if (pointId) {
                state.allPoints.push(pointId);
            }
        }

        // ルート中間点からroute_idを収集
        if (geometryType === 'Point' && featureType === 'route_waypoint') {
            const routeId = feature.properties && feature.properties.route_id;
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

    const routePathSelect = document.getElementById('routePath');
    const previousSelection = routePathSelect.value;
    updateRoutePathDropdown(loadedData);

    if (previousSelection && routePathSelect.value !== previousSelection) {
        resetRouteHighlight();
    }
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

    if (previousSelection && routePathSelect.value !== previousSelection) {
        resetRouteHighlight();
    }
}

// GeoJSONから座標を取得
export function getCoordinatesFromGeoJSON(routeId, loadedData) {
    if (!loadedData || !loadedData.features) return null;

    const coordinates = [];
    const match = routeId.match(/^route_(.+)_to_(.+)$/);
    if (!match) return null;

    const startId = match[1];
    const endId = match[2];

    const startFeature = loadedData.features.find(f =>
        f.properties && f.properties.type === 'ポイントGPS' && f.properties.id === startId
    );
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

    const endFeature = loadedData.features.find(f =>
        f.properties && f.properties.type === 'ポイントGPS' && f.properties.id === endId
    );
    if (endFeature && endFeature.geometry && endFeature.geometry.coordinates) {
        const [lng, lat] = endFeature.geometry.coordinates;
        coordinates.push([lat, lng]);
    }

    return coordinates.length >= 2 ? coordinates : null;
}

// ルートハイライト
export function highlightRoute(routeId, loadedData, markerMap, map) {
    resetRouteHighlight(markerMap, map);

    if (!routeId) return;

    state.selectedRouteId = routeId;

    const match = routeId.match(/^route_(.+)_to_(.+)$/);
    if (!match) return;

    const startId = match[1];
    const endId = match[2];

    const startMarker = markerMap.get(startId);
    const endMarker = markerMap.get(endId);

    if (startMarker && startMarker.setStyle) {
        startMarker.setStyle({ fillColor: '#ff0000', color: '#ff0000' });
    }
    if (endMarker && endMarker.setStyle) {
        endMarker.setStyle({ fillColor: '#ff0000', color: '#ff0000' });
    }

    const waypointMarkers = markerMap.get(routeId);
    if (Array.isArray(waypointMarkers)) {
        waypointMarkers.forEach(marker => {
            if (marker && marker.getElement) {
                const element = marker.getElement();
                if (element) {
                    const div = element.querySelector('div');
                    if (div) {
                        div.style.backgroundColor = '#ef454a';
                    }
                }
            }
        });
    }

    const coordinates = getCoordinatesFromGeoJSON(routeId, loadedData);
    if (coordinates) {
        state.selectedRouteLine = L.polyline(coordinates, {
            color: '#ef454a',
            weight: 2
        }).addTo(map);
    }
}

// ルートハイライトのリセット
export function resetRouteHighlight(markerMap, map) {
    if (!state.selectedRouteId) return;

    const match = state.selectedRouteId.match(/^route_(.+)_to_(.+)$/);
    if (match) {
        const startId = match[1];
        const endId = match[2];

        const startMarker = markerMap.get(startId);
        const endMarker = markerMap.get(endId);

        if (startMarker && startMarker.setStyle) {
            startMarker.setStyle(DEFAULTS.FEATURE_STYLES['ポイントGPS']);
        }
        if (endMarker && endMarker.setStyle) {
            endMarker.setStyle(DEFAULTS.FEATURE_STYLES['ポイントGPS']);
        }
    }

    const waypointMarkers = markerMap.get(state.selectedRouteId);
    if (Array.isArray(waypointMarkers)) {
        waypointMarkers.forEach(marker => {
            if (marker && marker.getElement) {
                const element = marker.getElement();
                if (element) {
                    const div = element.querySelector('div');
                    if (div) {
                        div.style.backgroundColor = '#f58220';
                    }
                }
            }
        });
    }

    if (state.selectedRouteLine) {
        map.removeLayer(state.selectedRouteLine);
        state.selectedRouteLine = null;
    }

    state.selectedRouteId = null;
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

    const coordinates = getCoordinatesFromGeoJSON(routeId, loadedData);
    if (coordinates) {
        state.selectedRouteLine = L.polyline(coordinates, {
            color: '#ef454a',
            weight: 2
        }).addTo(map);
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
    const newMarkers = [];
    const style = DEFAULTS.FEATURE_STYLES['route_waypoint'];

    waypoints.forEach(wp => {
        if (wp.geometry && wp.geometry.coordinates) {
            const [lng, lat] = wp.geometry.coordinates;
            const marker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'diamond-marker',
                    html: `<div style="width: ${style.radius * 2}px; height: ${style.radius * 2}px; background-color: ${markerColor}; transform: rotate(45deg); opacity: ${style.fillOpacity};"></div>`,
                    iconSize: [style.radius * 2, style.radius * 2],
                    iconAnchor: [style.radius, style.radius]
                })
            }).addTo(geoJsonLayer);

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
        map.removeLayer(marker);

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

    const startFeature = loadedData.features.find(f =>
        f.properties && f.properties.type === 'ポイントGPS' && f.properties.id === startId
    );
    const endFeature = loadedData.features.find(f =>
        f.properties && f.properties.type === 'ポイントGPS' && f.properties.id === endId
    );

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

// 中間点をクリック可能にする（追加・移動モード用）
export function makeWaypointsClickableForAddMove(routeId, loadedData, markerMap, map) {
    const waypointMarkers = markerMap.get(routeId);
    if (!Array.isArray(waypointMarkers)) return;

    waypointMarkers.forEach((marker, index) => {
        if (marker && marker.getElement) {
            const element = marker.getElement();
            if (element) {
                element.style.cursor = 'pointer';

                // 既存のイベントハンドラーを削除してから新しいものを追加
                marker.off('click');
                marker.off('drag');
                marker.off('dragend');

                marker.on('click', function(e) {
                    if (!state.isAddMoveMode) return;

                    L.DomEvent.stopPropagation(e);

                    if (state.draggableMarkers.length > 0) {
                        state.draggableMarkers.forEach(m => {
                            if (m && m.dragging) {
                                m.dragging.disable();
                            }
                            const el = m.getElement && m.getElement();
                            if (el) {
                                el.style.cursor = 'pointer';
                            }
                        });
                        state.draggableMarkers = [];
                    }

                    element.style.cursor = 'move';
                    marker.dragging = marker.dragging || new L.Handler.MarkerDrag(marker);
                    marker.dragging.enable();

                    marker.off('drag');
                    marker.on('drag', function(e) {
                        const newLatLng = marker.getLatLng();
                        updateWaypointCoordinates(routeId, index, newLatLng, loadedData);
                        redrawRouteLine(routeId, loadedData, map);
                    });

                    marker.off('dragend');
                    marker.on('dragend', function(e) {
                        const newLatLng = marker.getLatLng();
                        updateWaypointCoordinates(routeId, index, newLatLng, loadedData);

                        // ドラッグを無効化してイベントをクリア
                        if (marker.dragging) {
                            marker.dragging.disable();
                        }
                        marker.off('drag');
                        marker.off('dragend');
                        marker.off('click');

                        // カーソルをリセット
                        const el = marker.getElement && marker.getElement();
                        if (el) {
                            el.style.cursor = '';
                        }

                        // ドラッグ可能マーカーをクリア（古いマーカーへの参照を削除）
                        state.draggableMarkers = [];

                        // ルートを最適化（この中でマーカーが再作成される）
                        optimizeRoute(routeId, false, loadedData, markerMap);
                        redrawRouteLine(routeId, loadedData, map);

                        // マーカーが再描画された後、再度クリック可能にする
                        if (state.isAddMoveMode) {
                            makeWaypointsClickableForAddMove(routeId, loadedData, markerMap, map);
                        }
                    });

                    state.draggableMarkers = [...state.draggableMarkers, marker];
                });
            }
        }
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
