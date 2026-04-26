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
        if (draggableSpotMarker && draggableSpotMarker !== selectedSpotMarker) {
            if (draggableSpotMarker.dragging) {
                draggableSpotMarker.dragging.disable();
            }
            const element = draggableSpotMarker.getElement && draggableSpotMarker.getElement();
            if (element) {
                element.style.cursor = '';
            }
        }
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
        icon: L.divIcon({
            className: 'square-marker',
            html: `<div style="width: ${style.radius}px; height: ${style.radius}px; background-color: ${style.fillColor}; opacity: ${style.fillOpacity};"></div>`,
            iconSize: [style.radius, style.radius],
            iconAnchor: [style.radius / 2, style.radius / 2]
        })
    }).addTo(geoJsonLayer);

    marker.bindPopup(`${newSpotName}<br>(Spot)`);

    marker.on('click', function(e) {
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

    marker.dragging = marker.dragging || new L.Handler.MarkerDrag(marker);
    marker.dragging.enable();

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

// 追加・移動モードを解除
export function exitAddMoveSpotMode(map) {
    if (!isAddMoveSpotMode) return;

    setIsAddMoveSpotMode(false);

    const addMoveBtn = document.getElementById('addMoveSpotBtn');
    addMoveBtn.classList.remove('active');

    if (spotMapClickHandler) {
        map.off('click', spotMapClickHandler);
        setSpotMapClickHandler(null);
    }

    if (draggableSpotMarker) {
        if (draggableSpotMarker.dragging) {
            draggableSpotMarker.dragging.disable();
        }
        const element = draggableSpotMarker.getElement && draggableSpotMarker.getElement();
        if (element) {
            element.style.cursor = '';
        }
        setDraggableSpotMarker(null);
    }

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

// 重複スポット抽出モードを開始
export function enterExtractDuplicateMode(map, spotMarkerMap) {
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

    const onMouseDown = (e) => {
        isDrawing = true;
        startLatLng = e.latlng;
        if (duplicateExtractRectangle) {
            map.removeLayer(duplicateExtractRectangle);
            duplicateExtractRectangle = null;
        }
    };

    const onMouseMove = (e) => {
        if (!isDrawing || !startLatLng) return;
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
        if (!duplicateExtractRectangle) {
            startLatLng = null;
            return;
        }
        const bounds = duplicateExtractRectangle.getBounds();
        const duplicates = findDuplicateSpotsInBounds(bounds, spotMarkerMap);
        duplicates.forEach(d => {
            applySpotAquaColor(d.marker);
            duplicateMarkedSpots.add(d.feature);
        });
        showMessage(`重複スポットを${duplicates.length}件抽出しました`, 'success');
        startLatLng = null;
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

    // アクア色にしたマーカーを既定色に戻す
    duplicateMarkedSpots.forEach(feature => {
        const marker = spotMarkerMap && spotMarkerMap.get(feature);
        if (marker) {
            resetSpotHighlightWithParams(marker, feature);
        }
    });
    duplicateMarkedSpots.clear();

    // 現在選択中のスポットがリセットされた場合は再ハイライト
    if (selectedSpotMarker && selectedSpotFeature) {
        applySpotAquaColor(selectedSpotMarker);
    }

    if (map.dragging) map.dragging.enable();
    if (map.boxZoom) map.boxZoom.enable();
    map.getContainer().style.cursor = '';
}
