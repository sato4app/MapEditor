// エリア編集機能

import { DEFAULTS, MODES } from './constants.js';
import { showMessage } from './message.js';
import { updateStats } from './stats.js';

// エリア編集の状態管理
export let allAreas = [];
export let selectedAreaFeature = null;
export let selectedAreaLayer = null;
export let isAddMoveAreaMode = false;
export let areaMapClickHandler = null;

// 描画中の一時データ
let drawingPolyline = null;
let drawingCoordinates = [];
let centerMarker = null;

// 状態変更用のセッター関数
export function setSelectedAreaFeature(value) {
    selectedAreaFeature = value;
}

export function setSelectedAreaLayer(value) {
    selectedAreaLayer = value;
}

export function setIsAddMoveAreaMode(value) {
    isAddMoveAreaMode = value;
}

export function setAreaMapClickHandler(handler) {
    areaMapClickHandler = handler;
}

// エリア一覧の抽出
export function extractAreas(geoJsonData) {
    allAreas = [];

    if (!geoJsonData || !geoJsonData.features) {
        return;
    }

    geoJsonData.features.forEach(feature => {
        const featureType = feature.properties && feature.properties.type;
        const geometryType = feature.geometry && feature.geometry.type;

        // ポリゴンかつタイプが'spot'でない、または明示的に'area'の場合 (今のところPolygonはすべてAreaとする)
        if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
            const name = feature.properties && feature.properties.name;
            const type = feature.properties && feature.properties.type;

            // スポットとして扱われているPolygonを除外するかどうか検討が必要だが、
            // 現状spotEditor.jsはPolygonも吸い上げている。
            // ここでは、typeが'spot'でない、またはtypeが未設定のPolygonをAreaとして扱う
            // ポイントGPS等はPointなのでPolygonにはならない
            if (type !== 'spot' && type !== 'スポット') {
                allAreas.push({
                    name: name || '名称未設定エリア',
                    feature: feature
                });
            }
        }
    });
}

// エリアドロップダウンの更新
export function updateAreaDropdown() {
    const areaSelect = document.getElementById('areaSelect');
    const areaCountDisplay = document.getElementById('areaCountDisplay');

    if (areaCountDisplay) {
        areaCountDisplay.value = allAreas.length;
    }

    if (!areaSelect) return;

    const previousSelection = areaSelect.value;

    areaSelect.innerHTML = '<option value="">選択してください</option>';
    allAreas.forEach((area, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = area.name;
        areaSelect.appendChild(option);
    });

    if (previousSelection) {
        areaSelect.value = previousSelection;
    }
}

// 重心計算
function getPolygonCenter(coordinates) {
    // 簡易的な重心計算（GeoJSONのPolygon座標構造に対応: [[[lng, lat], ...]]）
    // MultiPolygonの場合は最初のPolygonを使用
    let ring = coordinates[0];
    if (coordinates.length > 0 && Array.isArray(coordinates[0][0])) {
        // MultiPolygonの場合 ring[0] -> Polygon coordinates -> ring[0][0] -> LinearRing
        // 構造: MultiPolygon [ Polygon [ LinearRing [ [lng, lat] ] ] ]
        // ここではPolygonのcoordinatesを想定: [ LinearRing [ [lng, lat] ] ]
        // もしMultiPolygonのcoordinatesが渡された場合は [ Polygon [ ... ] ] なので
        if (Array.isArray(ring[0][0])) {
            ring = ring[0][0]; // MultiPolygonの最初のPolygonの最初のリング
        }
    }

    let latSum = 0;
    let lngSum = 0;
    let count = 0;

    ring.forEach(coord => {
        lngSum += coord[0];
        latSum += coord[1];
        count++;
    });

    // 閉じたリングの場合、最後の点は最初の点と同じなので重心計算には除外する（一般的には）
    // Leaflet/GeoJSONは閉じたリング。
    if (count > 1 && ring[0] === ring[ring.length - 1]) { // Array compare needs checking content, but simpler check
        // check coords
        if (ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) {
            count--;
            latSum -= ring[ring.length - 1][1];
            lngSum -= ring[ring.length - 1][0];
        }
    }

    // fallback for empty
    if (count === 0) return null;

    return L.latLng(latSum / count, lngSum / count);
}

// エリア選択時の処理
export function highlightArea(areaIndex, areaLayerMap, map) {
    resetAreaHighlight(map);

    if (areaIndex === '' || areaIndex === null || areaIndex === undefined) {
        return;
    }

    const area = allAreas[areaIndex];
    if (!area) return;

    setSelectedAreaFeature(area.feature);

    const layer = areaLayerMap.get(area.feature);
    if (!layer) return;

    setSelectedAreaLayer(layer);

    // 名称を表示
    document.getElementById('selectedAreaName').value = area.name;

    // ハイライト（水色）
    if (layer.setStyle) {
        layer.setStyle({ fillColor: '#00ffff', color: '#00ffff', weight: 3 });
    }

    // 移動モードなら重心にマーカーを表示してドラッグ可能にする
    if (isAddMoveAreaMode) {
        setupAreaDragMarker(layer, area.feature, map, areaLayerMap);
    }
}

// ジオメトリの種類に応じた座標更新処理
function updateGeometryCoordinates(feature, latDiff, lngDiff) {
    const geometryType = feature.geometry.type;
    const coordinates = feature.geometry.coordinates;

    if (geometryType === 'Polygon') {
        // coordinates: [LinearRing, LinearRing...]
        coordinates.forEach(ring => {
            ring.forEach(coord => {
                coord[0] += lngDiff;
                coord[1] += latDiff;
            });
        });
    } else if (geometryType === 'MultiPolygon') {
        // coordinates: [Polygon, Polygon...]
        coordinates.forEach(polygon => {
            polygon.forEach(ring => {
                ring.forEach(coord => {
                    coord[0] += lngDiff;
                    coord[1] += latDiff;
                });
            });
        });
    }
}

// Leafletレイヤーの再描画（座標更新後）
function refreshLayer(layer, feature) {
    // GeoJSON feature coordinates are updated, now update Leaflet layer
    // Leaflet's L.GeoJSON.coordsToLatLngs is internal, but available
    // simpler to convert manually for Polygon/MultiPolygon

    // We can use setLatLngs
    // setLatLngs takes LatLngs structure.
    // L.GeoJSON.geometryToLayer is powerful but re-creates layer.

    // We can use setLatLngs by converting GeoJSON coords to LatLngs
    // But MultiPolygon structure is complex.

    // Simplest approach: remove layer and add new one? No, we need implementation.
    // Let's rely on map reload for persistent save, but for immediate feedback:
    // We update the feature (which is done), then we need visual feedback.

    // Since we are dragging the center marker, the user sees where it goes.
    // We want the polygon to follow.

    // Because implementing full GeoJSON->LatLngs conversion for MultiPolygon is tedious here,
    // we will re-create the layer using L.geoJSON logic for this single feature.

    // Wait, layer is already on map.
    // Let's implement coordinates update for Polygon (most common).
    if (feature.geometry.type === 'Polygon') {
        const latLngs = feature.geometry.coordinates.map(ring => {
            return ring.map(coord => [coord[1], coord[0]]); // [lng, lat] -> [lat, lng]
        });
        layer.setLatLngs(latLngs);
    } else if (feature.geometry.type === 'MultiPolygon') {
        const multiLatLngs = feature.geometry.coordinates.map(polygon => {
            return polygon.map(ring => {
                return ring.map(coord => [coord[1], coord[0]]);
            });
        });
        layer.setLatLngs(multiLatLngs);
    }
}

// ドラッグマーカーの設定
export function setupAreaDragMarker(layer, feature, map, areaLayerMap) {
    if (centerMarker) {
        map.removeLayer(centerMarker);
        centerMarker = null;
    }

    if (!layer || !feature.geometry || !feature.geometry.coordinates) return;

    let centerLatLng = null;
    if (feature.geometry.type === 'Polygon') {
        centerLatLng = getPolygonCenter(feature.geometry.coordinates);
    } else if (feature.geometry.type === 'MultiPolygon') {
        centerLatLng = getPolygonCenter(feature.geometry.coordinates[0]);
    }

    if (!centerLatLng) return;

    // ドラッグ用中心マーカー
    centerMarker = L.marker(centerLatLng, {
        draggable: true,
        icon: L.divIcon({
            className: 'area-drag-marker',
            html: '<div style="width: 12px; height: 12px; background-color: #ff00ff; border: 2px solid white; border-radius: 50%; cursor: move;"></div>',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        })
    }).addTo(map);

    // ドラッグ開始時の座標を記録
    let dragStartLatLng = centerLatLng;

    centerMarker.on('dragstart', function (e) {
        dragStartLatLng = e.target.getLatLng();
    });

    centerMarker.on('drag', function (e) {
        // ドラッグ中のリアルタイム更新は重いかもしれないが、やってみる
        const currentLatLng = e.target.getLatLng();
        const latDiff = currentLatLng.lat - dragStartLatLng.lat;
        const lngDiff = currentLatLng.lng - dragStartLatLng.lng;

        // 元のfeatureを更新してしまうとずれていくので、
        // 実際には「元のfeature + 差分」を表示すべきだが、
        // getLatLng()は現在位置を返すので、直前の位置からの差分をとるのがよい？
        // dragイベントは連続発生する。
        // diffを計算して、featureを更新し、dragStartを現在位置に更新する。

        updateGeometryCoordinates(feature, latDiff, lngDiff);
        refreshLayer(layer, feature);

        dragStartLatLng = currentLatLng;
    });

    centerMarker.on('dragend', function (e) {
        showMessage('エリアの位置を更新しました', 'success');
    });
}

// エリアハイライトのリセット
export function resetAreaHighlight(map) {
    if (centerMarker) {
        map.removeLayer(centerMarker);
        centerMarker = null;
    }

    if (selectedAreaLayer) {
        // 元の色に戻す
        if (selectedAreaLayer.setStyle) {
            selectedAreaLayer.setStyle(DEFAULTS.LINE_STYLE);
        }
    }

    setSelectedAreaFeature(null);
    setSelectedAreaLayer(null);
    const nameInput = document.getElementById('selectedAreaName');
    if (nameInput) nameInput.value = '';
}

// エリア追加・移動モードの開始・終了
export function exitAddMoveAreaMode(map) {
    if (!isAddMoveAreaMode) return;

    setIsAddMoveAreaMode(false);

    const addMoveBtn = document.getElementById('addMoveAreaBtn');
    if (addMoveBtn) addMoveBtn.classList.remove('active');

    if (areaMapClickHandler) {
        map.off('click', areaMapClickHandler);
        setAreaMapClickHandler(null);
    }

    // 描画中のラインを削除
    if (drawingPolyline) {
        map.removeLayer(drawingPolyline);
        drawingPolyline = null;
    }
    drawingCoordinates = [];

    // マーカー削除
    if (centerMarker) {
        map.removeLayer(centerMarker);
        centerMarker = null;
    }

    map.getContainer().style.cursor = '';

    // 選択状態は維持したいが、マーカーが消えるので再選択（ハイライト）が必要？
    // highlightAreaはcenterMarkerを再作成する。
    // exitAddMoveAreaModeはモード終了時。
    // モード終了時はcenterMarkerはいらない。
    // しかしhighlightAreaはselectedAreaLayerを持っている。
    // リセットしたい場合は resetAreaHighlightを呼ぶべきだが、
    // ここでは「編集モードだけ終わる」ので、選択はそのままでいい。
}

// エリアの追加（頂点追加）
export function addAreaVertex(latlng, map, loadedData, areaLayerMap, geoJsonLayer) {
    // 座標は [lat, lng] for Leaflet

    // 開始点が設定されていない場合（1点目）
    if (drawingCoordinates.length === 0) {
        showMessage('始点を設定しました。続けて頂点をクリックしてください。始点付近をクリックで完了します。', 'info');
    }

    drawingCoordinates.push([latlng.lat, latlng.lng]);

    if (!drawingPolyline) {
        drawingPolyline = L.polyline(drawingCoordinates, { color: 'red' }).addTo(map);
    } else {
        drawingPolyline.setLatLngs(drawingCoordinates);
    }

    // 閉じる判定: 3点以上かつ始点に近い
    if (drawingCoordinates.length > 2) {
        const startPoint = drawingCoordinates[0];
        const dist = map.distance(latlng, L.latLng(startPoint[0], startPoint[1]));

        // 20メートル以内で閉じる (画面上の距離のほうがいいかもしれないが、一旦緯度経度距離で)
        // ズームレベルによるので、できればピクセル距離がいいが、mapが必要。
        // Leafletのmap.latLngToContainerPointを使えばピクセル距離が出る。

        const p1 = map.latLngToContainerPoint(latlng);
        const p2 = map.latLngToContainerPoint(L.latLng(startPoint[0], startPoint[1]));
        const pixelDist = p1.distanceTo(p2);

        if (pixelDist < 20) {
            // 最後の点（始点に近い点）を除外してポリゴン化
            drawingCoordinates.pop();
            completeAreaCreation(loadedData, areaLayerMap, geoJsonLayer, map);
        }
    }
}

// エリア作成完了
export function completeAreaCreation(loadedData, areaLayerMap, geoJsonLayer, map) {
    if (drawingCoordinates.length < 3) {
        showMessage('エリアを作成するには3点以上必要です', 'warning');
        return;
    }

    // Leaflet LatLng ([lat, lng]) -> GeoJSON Coordinate ([lng, lat])
    const geoJsonCoords = drawingCoordinates.map(coord => [coord[1], coord[0]]);
    // 閉じる (GeoJSON Polygon require first and last to be same)
    geoJsonCoords.push(geoJsonCoords[0]);

    let areaNumber = 1;
    let newAreaName = '';
    let nameExists = true;

    while (nameExists) {
        newAreaName = `エリア${areaNumber}`;
        nameExists = allAreas.some(area => area.name === newAreaName);
        if (nameExists) areaNumber++;
    }

    const newAreaFeature = {
        type: 'Feature',
        properties: {
            type: 'area', // 明示的にareaとする (ポイントGPS等は type: 'ポイントGPS')
            name: newAreaName
        },
        geometry: {
            type: 'Polygon',
            coordinates: [geoJsonCoords]
        }
    };

    if (!loadedData.features) {
        loadedData.features = [];
    }
    loadedData.features.push(newAreaFeature);

    // レイヤー作成と追加
    const layer = L.geoJSON(newAreaFeature, {
        style: DEFAULTS.LINE_STYLE,
        onEachFeature: function (feature, layer) {
            // イベントリスナー設定
            layer.on('click', function (e) {
                const currentMode = document.querySelector('input[name="mode"]:checked').value;
                if (currentMode === MODES.AREA) {
                    // 自分のインデックスを探す
                    const index = allAreas.findIndex(a => a.feature === feature);
                    if (index !== -1) {
                        document.getElementById('areaSelect').value = index;
                        highlightArea(index, areaLayerMap, map);
                        L.DomEvent.stopPropagation(e);
                    }
                }
            });
        }
    }).addTo(geoJsonLayer);

    // getLayers returns array of layers derived from GeoJSON
    const actualLayer = layer.getLayers()[0];

    // mapCore/fileIOで使われている feature -> layer マップに登録
    areaLayerMap.set(newAreaFeature, actualLayer);

    const newArea = {
        name: newAreaName,
        feature: newAreaFeature
    };
    allAreas.push(newArea);

    updateAreaDropdown();
    updateStats(loadedData);

    // 作成したエリアを選択
    const index = allAreas.length - 1;
    document.getElementById('areaSelect').value = index;
    highlightArea(index, areaLayerMap, map);

    // 描画リセット
    if (drawingPolyline) {
        map.removeLayer(drawingPolyline);
        drawingPolyline = null;
    }
    drawingCoordinates = [];

    showMessage('新しいエリアを作成しました', 'success');
}
