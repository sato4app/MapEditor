// スポット編集機能

import { DEFAULTS, MODES, SPOT_CATEGORIES } from './constants.js';
import { showMessage } from './message.js';
import { updateStats } from './stats.js';

// スポット編集の状態管理
export let allSpots = [];
export let selectedSpotFeature = null;
export let selectedSpotMarker = null;
export let isAddMoveSpotMode = false;
export let spotMapClickHandler = null;
export let draggableSpotMarker = null;

// 重複スポット抽出モードの状態管理
export let isExtractDuplicateMode = false;
let duplicateExtractHandlers = null; // { mousedown, mousemove, mouseup }
let duplicateExtractRectangle = null; // ドラッグ中/直近の長方形レイヤー
const duplicateMarkedSpots = new Set(); // アクア色に変えたマーカー(featureを保持)
const duplicateClickHandlerMap = new Map(); // feature -> 削除用clickハンドラ

// 状態変更用のセッター関数
export function setSelectedSpotFeature(value) {
    selectedSpotFeature = value;
}

export function setSelectedSpotMarker(value) {
    selectedSpotMarker = value;
}

export function setIsAddMoveSpotMode(value) {
    isAddMoveSpotMode = value;
}

export function setSpotMapClickHandler(handler) {
    spotMapClickHandler = handler;
}

export function setDraggableSpotMarker(marker) {
    draggableSpotMarker = marker;
}

// スポット一覧の抽出
export function extractSpots(geoJsonData) {
    allSpots = [];

    if (!geoJsonData || !geoJsonData.features) {
        return;
    }

    geoJsonData.features.forEach(feature => {
        const featureType = feature.properties && feature.properties.type;
        const geometryType = feature.geometry && feature.geometry.type;

        if (geometryType === 'Point' && featureType === 'spot') {
            const name = feature.properties && feature.properties.name;
            if (name) {
                allSpots.push({
                    name: name,
                    feature: feature
                });
            }
        }
    });
}

// スポット区分ドロップダウンの初期化
export function initSpotCategoryDropdown() {
    const spotCategorySelect = document.getElementById('spotCategory');

    spotCategorySelect.innerHTML = '<option value="">選択してください</option>';
    SPOT_CATEGORIES.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        spotCategorySelect.appendChild(option);
    });
}

// スポットドロップダウンの更新
export function updateSpotDropdown() {
    const spotSelect = document.getElementById('spotSelect');
    const spotCountDisplay = document.getElementById('spotCountDisplay');

    spotCountDisplay.value = allSpots.length;

    const previousSelection = spotSelect.value;

    spotSelect.innerHTML = '<option value="">選択してください</option>';
    allSpots.forEach((spot, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = spot.name;
        spotSelect.appendChild(option);
    });

    if (previousSelection) {
        spotSelect.value = previousSelection;
    }
}

// スポット選択時の処理
export function highlightSpot(spotIndex, spotMarkerMap) {
    const previousSpotMarker = selectedSpotMarker;
    const previousSpotFeature = selectedSpotFeature;

    if (spotIndex === '' || spotIndex === null || spotIndex === undefined) {
        if (previousSpotMarker && previousSpotFeature) {
            resetSpotHighlightWithParams(previousSpotMarker, previousSpotFeature);
        }
        setSelectedSpotFeature(null);
        setSelectedSpotMarker(null);
        document.getElementById('selectedSpotName').value = '';
        document.getElementById('spotCategory').value = '';
        return;
    }

    const spot = allSpots[spotIndex];
    if (!spot) {
        return;
    }

    setSelectedSpotFeature(spot.feature);

    const layer = spotMarkerMap.get(spot.feature);

    if (!layer) {
        return;
    }

    setSelectedSpotMarker(layer);

    if (previousSpotMarker && previousSpotFeature && previousSpotMarker !== selectedSpotMarker) {
        resetSpotHighlightWithParams(previousSpotMarker, previousSpotFeature);
    }

    document.getElementById('selectedSpotName').value = spot.name;

    // スポット区分を表示
    const category = spot.feature.properties && spot.feature.properties.category;
    document.getElementById('spotCategory').value = category || '';


    const featureType = spot.feature.properties && spot.feature.properties.type;
    const geometryType = spot.feature.geometry && spot.feature.geometry.type;
    const isSpotType = featureType === 'spot' || featureType === 'スポット';

    if (geometryType === 'Point' && isSpotType) {
        if (layer.getElement) {
            const element = layer.getElement();
            if (element) {
                const div = element.querySelector('div');
                if (div) {
                    div.style.setProperty('background-color', '#00ffff', 'important');
                }
            }
        } else if (layer.setStyle) {
            layer.setStyle({ fillColor: '#00ffff', color: '#00ffff' });
        }
    } else if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
        if (layer.setStyle) {
            layer.setStyle({ fillColor: '#00ffff', color: '#00ffff' });
        }
    }

    if (isAddMoveSpotMode) {
        // 追加・移動モード中は全スポットがドラッグ可能。選択スポットも確実に有効化しておく
        makeSpotDraggable(selectedSpotMarker, selectedSpotFeature);
    }
}

// スポットハイライトのリセット（パラメータ付き）
export function resetSpotHighlightWithParams(marker, feature) {
    if (!marker || !feature) {
        return;
    }

    const featureType = feature.properties && feature.properties.type;
    const geometryType = feature.geometry && feature.geometry.type;
    const isSpotType = featureType === 'spot' || featureType === 'スポット';

    if (geometryType === 'Point' && isSpotType) {
        if (marker.getElement) {
            const element = marker.getElement();
            if (element) {
                const div = element.querySelector('div');
                if (div) {
                    const defaultColor = (DEFAULTS && DEFAULTS.FEATURE_STYLES && DEFAULTS.FEATURE_STYLES['spot'] && DEFAULTS.FEATURE_STYLES['spot'].fillColor) || '#0000ff';
                    div.style.setProperty('background-color', defaultColor, 'important');
                }
            }
        } else if (marker.setStyle) {
            marker.setStyle(DEFAULTS.FEATURE_STYLES['spot']);
        }
    } else if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
        if (marker.setStyle) {
            marker.setStyle(DEFAULTS.LINE_STYLE);
        }
    }
}

// スポットハイライトのリセット
export function resetSpotHighlight() {
    if (!selectedSpotMarker || !selectedSpotFeature) {
        return;
    }

    resetSpotHighlightWithParams(selectedSpotMarker, selectedSpotFeature);

    setSelectedSpotFeature(null);
    setSelectedSpotMarker(null);
}

// 新しいスポットを追加
export function addSpotToMap(latlng, loadedData, spotMarkerMap, geoJsonLayer) {
    if (!loadedData) return;

    let spotNumber = 1;
    let newSpotName = '';
    let nameExists = true;

    while (nameExists) {
        newSpotName = `仮${spotNumber}`;
        nameExists = allSpots.some(spot => spot.name === newSpotName);
        if (nameExists) spotNumber++;
    }

    const newSpotFeature = {
        type: 'Feature',
        properties: {
            type: 'spot',
            name: newSpotName
        },
        geometry: {
            type: 'Point',
            coordinates: [latlng.lng, latlng.lat]
        }
    };

    if (!loadedData.features) {
        loadedData.features = [];
    }
    loadedData.features.push(newSpotFeature);

    const style = DEFAULTS.FEATURE_STYLES['spot'];
    const marker = L.marker(latlng, {
        draggable: true,
        icon: L.divIcon({
            className: 'square-marker',
            html: `<div style="width: ${style.radius}px; height: ${style.radius}px; background-color: ${style.fillColor}; opacity: ${style.fillOpacity};"></div>`,
            iconSize: [style.radius, style.radius],
            iconAnchor: [style.radius / 2, style.radius / 2]
        })
    }).addTo(geoJsonLayer);

    // 既定はドラッグ無効（追加・移動モードでのみ有効化する）
    if (marker.dragging) marker.dragging.disable();

    marker.bindPopup(`${newSpotName}<br>(Spot)`);

    marker.on('click', function(e) {
        // 重複スポット抽出モード中はドロップダウン選択を行わない
        if (isExtractDuplicateMode) return;
        const currentMode = document.querySelector('input[name="mode"]:checked').value;
        if (currentMode === MODES.SPOT) {
            const spotIndex = allSpots.findIndex(spot => spot.feature === newSpotFeature);
            if (spotIndex !== -1) {
                document.getElementById('spotSelect').value = spotIndex;
                highlightSpot(spotIndex, spotMarkerMap);
            }
        }
    });

    marker.feature = newSpotFeature;
    spotMarkerMap.set(newSpotFeature, marker);

    allSpots.push({
        name: newSpotName,
        feature: newSpotFeature
    });

    updateSpotDropdown();

    const spotIndex = allSpots.findIndex(spot => spot.feature === newSpotFeature);
    if (spotIndex !== -1) {
        document.getElementById('spotSelect').value = spotIndex;
        highlightSpot(spotIndex, spotMarkerMap);
    }

    updateStats(loadedData);
}

// スポットマーカーをドラッグ可能にする
export function makeSpotDraggable(marker, feature) {
    if (!marker) return;

    setDraggableSpotMarker(marker);

    if (marker.getElement) {
        const element = marker.getElement();
        if (element) {
            element.style.cursor = 'move';
        }
    }

    // マーカーは draggable:true で生成済みのため dragging ハンドラは存在する。有効化のみ行う
    if (marker.dragging) marker.dragging.enable();

    // ドラッグハンドラはマーカーごとに1度だけ登録（モード再入時の二重登録を防ぐ）
    if (marker._spotDragBound) return;
    marker._spotDragBound = true;

    marker.on('drag', function(e) {
        const newLatLng = marker.getLatLng();
        if (feature.geometry && feature.geometry.coordinates) {
            feature.geometry.coordinates = [newLatLng.lng, newLatLng.lat];
        }
    });

    marker.on('dragend', function(e) {
        const newLatLng = marker.getLatLng();
        if (feature.geometry && feature.geometry.coordinates) {
            feature.geometry.coordinates = [newLatLng.lng, newLatLng.lat];
        }
        showMessage('スポットの位置を更新しました', 'success');
    });
}

// 追加・移動モード中、全てのスポットマーカーをドラッグ可能にする
// （任意のスポットを直接掴んで移動できるようにする）
export function enableAllSpotDragging(spotMarkerMap) {
    if (!spotMarkerMap) return;
    spotMarkerMap.forEach((marker, feature) => {
        makeSpotDraggable(marker, feature);
    });
}

// 全てのスポットマーカーのドラッグを無効化する
export function disableAllSpotDragging(spotMarkerMap) {
    if (!spotMarkerMap) return;
    spotMarkerMap.forEach((marker) => {
        if (marker.dragging) marker.dragging.disable();
        const element = marker.getElement && marker.getElement();
        if (element) element.style.cursor = '';
    });
}

// 追加・移動モードを解除
export function exitAddMoveSpotMode(map, spotMarkerMap) {
    if (!isAddMoveSpotMode) return;

    setIsAddMoveSpotMode(false);

    const addMoveBtn = document.getElementById('addMoveSpotBtn');
    addMoveBtn.classList.remove('active');

    if (spotMapClickHandler) {
        map.off('click', spotMapClickHandler);
        setSpotMapClickHandler(null);
    }

    // 全てのスポットのドラッグを無効化
    disableAllSpotDragging(spotMarkerMap);
    setDraggableSpotMarker(null);

    map.getContainer().style.cursor = '';
}

// スポットマーカーの色をアクアに変更
function applySpotAquaColor(marker) {
    if (!marker) return;
    if (marker.getElement) {
        const element = marker.getElement();
        if (element) {
            const div = element.querySelector('div');
            if (div) {
                div.style.setProperty('background-color', '#00ffff', 'important');
            }
        }
    } else if (marker.setStyle) {
        marker.setStyle({ fillColor: '#00ffff', color: '#00ffff' });
    }
}

// 長方形内の重複スポットを抽出
function findDuplicateSpotsInBounds(bounds, spotMarkerMap) {
    const distanceLimit = DEFAULTS.DUPLICATE_SPOT_DISTANCE_M;
    const candidates = [];

    spotMarkerMap.forEach((marker, feature) => {
        if (!marker || !marker.getLatLng) return;
        const latlng = marker.getLatLng();
        if (!bounds.contains(latlng)) return;
        const name = feature.properties && feature.properties.name;
        if (!name) return;
        candidates.push({ feature, marker, latlng, name });
    });

    const duplicateSet = new Set();
    for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
            if (candidates[i].name !== candidates[j].name) continue;
            const dist = candidates[i].latlng.distanceTo(candidates[j].latlng);
            if (dist <= distanceLimit) {
                duplicateSet.add(candidates[i]);
                duplicateSet.add(candidates[j]);
            }
        }
    }
    return Array.from(duplicateSet);
}

// 重複と判定されたスポットを削除する内部処理
function removeDuplicateSpot(feature, marker, map, spotMarkerMap, getLoadedData, geoJsonLayer) {
    // GeoJSONデータから削除
    const data = getLoadedData && getLoadedData();
    if (data && data.features) {
        const idx = data.features.findIndex(f => f === feature);
        if (idx !== -1) data.features.splice(idx, 1);
    }

    // 地図からマーカー削除
    if (marker) {
        if (geoJsonLayer && geoJsonLayer.hasLayer && geoJsonLayer.hasLayer(marker)) {
            geoJsonLayer.removeLayer(marker);
        }
        if (map && map.hasLayer && map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    }

    // spotMarkerMap から削除
    if (spotMarkerMap) spotMarkerMap.delete(feature);

    // allSpots から削除
    const sIdx = allSpots.findIndex(s => s.feature === feature);
    if (sIdx !== -1) allSpots.splice(sIdx, 1);

    // 内部状態を整理
    duplicateMarkedSpots.delete(feature);
    duplicateClickHandlerMap.delete(feature);

    // 選択中スポットだった場合は解除
    if (selectedSpotFeature === feature) {
        setSelectedSpotFeature(null);
        setSelectedSpotMarker(null);
        const nameInput = document.getElementById('selectedSpotName');
        if (nameInput) nameInput.value = '';
        const categorySelect = document.getElementById('spotCategory');
        if (categorySelect) categorySelect.value = '';
        const spotSelect = document.getElementById('spotSelect');
        if (spotSelect) spotSelect.value = '';
    }

    // ドロップダウンと統計を更新
    updateSpotDropdown();
    updateStats(data);
}

// スポットマーカーの色を既定色に強制リセット
function resetSpotMarkerColor(marker, feature) {
    if (!marker) return;
    const defaultColor = (DEFAULTS && DEFAULTS.FEATURE_STYLES && DEFAULTS.FEATURE_STYLES['spot'] && DEFAULTS.FEATURE_STYLES['spot'].fillColor) || '#0000ff';
    if (marker.getElement) {
        const element = marker.getElement();
        if (element) {
            const div = element.querySelector('div');
            if (div) {
                div.style.removeProperty('background-color');
                div.style.setProperty('background-color', defaultColor, 'important');
            }
        }
    } else if (marker.setStyle) {
        marker.setStyle({ fillColor: defaultColor, color: defaultColor });
    }
}

// 重複マーカーの色とclickハンドラを全て解除
function clearDuplicateMarkings(spotMarkerMap) {
    duplicateClickHandlerMap.forEach(({ marker, handler }) => {
        if (marker && marker.off) marker.off('click', handler);
    });
    duplicateClickHandlerMap.clear();

    duplicateMarkedSpots.forEach(feature => {
        const marker = spotMarkerMap && spotMarkerMap.get(feature);
        if (marker) resetSpotMarkerColor(marker, feature);
    });
    duplicateMarkedSpots.clear();
}

// 指定された長方形内で重複抽出を実行(既存の重複表示はクリアして再抽出)
function applyDuplicateExtraction(bounds, map, spotMarkerMap, getLoadedData, geoJsonLayer) {
    clearDuplicateMarkings(spotMarkerMap);

    const duplicates = findDuplicateSpotsInBounds(bounds, spotMarkerMap);
    duplicates.forEach(d => {
        applySpotAquaColor(d.marker);
        duplicateMarkedSpots.add(d.feature);

        const handler = (ev) => {
            if (!isExtractDuplicateMode) return;
            if (!duplicateMarkedSpots.has(d.feature)) return;
            const name = (d.feature.properties && d.feature.properties.name) || '';
            // bindPopupで開いたポップアップを閉じる(隣接する残存スポットを覆い隠さないように)
            if (map && map.closePopup) map.closePopup();
            removeDuplicateSpot(d.feature, d.marker, map, spotMarkerMap, getLoadedData, geoJsonLayer);
            showMessage(`重複スポット「${name}」を削除しました`, 'success');
            if (ev && ev.originalEvent) {
                L.DomEvent.stopPropagation(ev.originalEvent);
            }
            // 削除後、一旦重複判定をクリアする
            clearDuplicateMarkings(spotMarkerMap);

            if (duplicateExtractRectangle) {
                const bounds = duplicateExtractRectangle.getBounds();
                // 抽出を再実行して再度判定する (UIにクリアが反映されるように少し遅延させる)
                setTimeout(() => {
                    if (isExtractDuplicateMode) {
                        const count = applyDuplicateExtraction(bounds, map, spotMarkerMap, getLoadedData, geoJsonLayer);
                        if (count > 0) {
                            showMessage(`再判定: 重複スポットが ${count} 件残っています`, 'info');
                        } else {
                            showMessage(`この範囲の重複スポットはなくなりました`, 'success');
                        }
                    }
                }, 100);
            }
        };
        d.marker.on('click', handler);
        duplicateClickHandlerMap.set(d.feature, { marker: d.marker, handler });
    });
    return duplicates.length;
}

// 重複スポット抽出モードを開始
export function enterExtractDuplicateMode(map, spotMarkerMap, getLoadedData, geoJsonLayer) {
    if (isExtractDuplicateMode) return;
    isExtractDuplicateMode = true;

    const btn = document.getElementById('extractDuplicateSpotsBtn');
    if (btn) btn.classList.add('active');

    // 地図ドラッグ・ボックスズームを無効化(長方形描画と競合するため)
    if (map.dragging) map.dragging.disable();
    if (map.boxZoom) map.boxZoom.disable();
    map.getContainer().style.cursor = 'crosshair';

    let startLatLng = null;
    let isDrawing = false;
    let hasMoved = false;

    const onMouseDown = (e) => {
        isDrawing = true;
        hasMoved = false;
        startLatLng = e.latlng;
        // マウスクリックのみで長方形が消えてしまうのを防ぐため、ここでは削除しない
    };

    const onMouseMove = (e) => {
        if (!isDrawing || !startLatLng) return;
        hasMoved = true;
        const bounds = L.latLngBounds(startLatLng, e.latlng);
        if (duplicateExtractRectangle) {
            duplicateExtractRectangle.setBounds(bounds);
        } else {
            duplicateExtractRectangle = L.rectangle(bounds, {
                color: '#ff69b4',
                weight: 1,
                fillColor: '#ffb6c1',
                fillOpacity: 0.3,
                interactive: false
            }).addTo(map);
        }
    };

    const onMouseUp = (e) => {
        if (!isDrawing) return;
        isDrawing = false;
        startLatLng = null;

        // 実際にドラッグが行われなかった場合（単なるクリック）は、抽出を再実行しない
        if (!hasMoved || !duplicateExtractRectangle) {
            return;
        }

        const bounds = duplicateExtractRectangle.getBounds();
        const count = applyDuplicateExtraction(bounds, map, spotMarkerMap, getLoadedData, geoJsonLayer);
        showMessage(`重複スポットを${count}件抽出しました`, 'success');
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);

    duplicateExtractHandlers = { onMouseDown, onMouseMove, onMouseUp };
}

// 重複スポット抽出モードを解除
export function exitExtractDuplicateMode(map, spotMarkerMap) {
    if (!isExtractDuplicateMode) return;
    isExtractDuplicateMode = false;

    const btn = document.getElementById('extractDuplicateSpotsBtn');
    if (btn) btn.classList.remove('active');

    if (duplicateExtractHandlers) {
        map.off('mousedown', duplicateExtractHandlers.onMouseDown);
        map.off('mousemove', duplicateExtractHandlers.onMouseMove);
        map.off('mouseup', duplicateExtractHandlers.onMouseUp);
        duplicateExtractHandlers = null;
    }

    if (duplicateExtractRectangle) {
        map.removeLayer(duplicateExtractRectangle);
        duplicateExtractRectangle = null;
    }

    // 重複マーカーの色とclickハンドラをクリア
    clearDuplicateMarkings(spotMarkerMap);

    // 現在選択中のスポットがリセットされた場合は再ハイライト
    if (selectedSpotMarker && selectedSpotFeature) {
        applySpotAquaColor(selectedSpotMarker);
    }

    if (map.dragging) map.dragging.enable();
    if (map.boxZoom) map.boxZoom.enable();
    map.getContainer().style.cursor = '';
}
