// 通行禁止・困難場所の指定機能（closure）

import { DEFAULTS, MODES } from './constants.js';
import { showMessage } from './message.js';
import { updateStats, getDateIso } from './stats.js';

// closure編集の状態管理
export let allClosures = [];
export let selectedClosureFeature = null;
export let selectedClosureMarker = null;
export let isAddMoveClosureMode = false;
export let closureMapClickHandler = null;
export let draggableClosureMarker = null;

// 状態変更用のセッター関数
export function setSelectedClosureFeature(value) {
    selectedClosureFeature = value;
}

export function setSelectedClosureMarker(value) {
    selectedClosureMarker = value;
}

export function setIsAddMoveClosureMode(value) {
    isAddMoveClosureMode = value;
}

export function setClosureMapClickHandler(handler) {
    closureMapClickHandler = handler;
}

export function setDraggableClosureMarker(marker) {
    draggableClosureMarker = marker;
}

// 登録地点一覧の抽出
export function extractClosures(geoJsonData) {
    allClosures = [];

    if (!geoJsonData || !geoJsonData.features) {
        return;
    }

    geoJsonData.features.forEach(feature => {
        const featureType = feature.properties && feature.properties.type;
        const geometryType = feature.geometry && feature.geometry.type;

        if (geometryType === 'Point' && featureType === 'closure') {
            const name = feature.properties && feature.properties.name;
            allClosures.push({
                name: name || '名称未設定',
                feature: feature
            });
        }
    });
}

// 登録地点ドロップダウンの更新
export function updateClosureDropdown() {
    const closureSelect = document.getElementById('closureSelect');
    const closureCountDisplay = document.getElementById('closureCountDisplay');

    if (closureCountDisplay) {
        closureCountDisplay.value = allClosures.length;
    }

    if (!closureSelect) return;

    const previousSelection = closureSelect.value;

    closureSelect.innerHTML = '<option value="">選択してください</option>';
    allClosures.forEach((closure, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = closure.name;
        closureSelect.appendChild(option);
    });

    if (previousSelection) {
        closureSelect.value = previousSelection;
    }
}

// 既存IDの一覧から次の一意なID（C-01形式）を生成
export function nextClosureId(existingIds) {
    let maxNum = 0;
    existingIds.forEach(id => {
        const m = /^C-(\d+)$/.exec(id);
        if (m) {
            const n = parseInt(m[1], 10);
            if (n > maxNum) maxNum = n;
        }
    });
    return `C-${String(maxNum + 1).padStart(2, '0')}`;
}

// updatedAtを本日の日付に更新
export function touchUpdatedAt(feature) {
    if (feature && feature.properties) {
        feature.properties.updatedAt = getDateIso();
    }
}

// 区分（kind）ラジオボタンの設定
export function setKindRadios(value) {
    const radios = document.querySelectorAll('input[name="closureKind"]');
    radios.forEach(radio => {
        radio.checked = (radio.value === value);
    });
}

// 選択中の区分（kind）を取得
export function getSelectedKind() {
    const checked = document.querySelector('input[name="closureKind"]:checked');
    return checked ? checked.value : '';
}

// 登録理由（reason）ラジオボタンの設定
export function setReasonRadios(value) {
    const radios = document.querySelectorAll('input[name="closureReason"]');
    radios.forEach(radio => {
        radio.checked = (radio.value === value);
    });
}

// 選択中の登録理由（reason）を取得
export function getSelectedReason() {
    const checked = document.querySelector('input[name="closureReason"]:checked');
    return checked ? checked.value : '';
}

// 状態（status）ラジオボタンの設定
export function setStatusRadios(value) {
    const radios = document.querySelectorAll('input[name="closureStatus"]');
    radios.forEach(radio => {
        radio.checked = (radio.value === value);
    });
}

// 選択中の状態（status）を取得
export function getSelectedStatus() {
    const checked = document.querySelector('input[name="closureStatus"]:checked');
    return checked ? checked.value : '';
}

// 区分（kind）の表示用ラベル
function kindLabel(kind) {
    if (kind === 'closed') return '通行止め';
    if (kind === 'difficult') return '通行困難';
    return '';
}

// マーカーの色を変更（選択時のハイライト・既定色リセット共通）
function applyClosureColor(marker, color) {
    if (!marker) return;
    if (marker.getElement) {
        const element = marker.getElement();
        if (element) {
            const div = element.querySelector('div');
            if (div) {
                div.style.setProperty('background-color', color, 'important');
            }
        }
    } else if (marker.setStyle) {
        marker.setStyle({ fillColor: color, color: color });
    }
}

// ポップアップの内容を生成
function formatClosurePopup(feature) {
    const p = feature.properties || {};
    const name = p.name || '';
    const sub = kindLabel(p.kind);
    const reason = p.reason || '';
    const detail = `${sub}${reason ? '（' + reason + '）' : ''}`;
    return `${name}${detail ? '<br>' + detail : ''}`;
}

// closureマーカーを生成して地図に追加（追加処理・ファイル読み込みで共通利用）
export function createClosureMarker(feature, closureMarkerMap, geoJsonLayer) {
    if (!feature || !feature.geometry || !feature.geometry.coordinates) return null;

    const [lng, lat] = feature.geometry.coordinates;
    const style = DEFAULTS.FEATURE_STYLES['closure'];

    const marker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'closure-marker',
            html: `<div style="width: ${style.radius}px; height: ${style.radius}px; background-color: ${style.fillColor}; opacity: ${style.fillOpacity};"></div>`,
            iconSize: [style.radius, style.radius],
            iconAnchor: [style.radius / 2, style.radius / 2]
        })
    });

    marker.bindPopup(formatClosurePopup(feature));

    marker.on('click', function () {
        const currentMode = document.querySelector('input[name="mode"]:checked').value;
        if (currentMode === MODES.CLOSURE) {
            const index = allClosures.findIndex(c => c.feature === feature);
            if (index !== -1) {
                document.getElementById('closureSelect').value = index;
                highlightClosure(index, closureMarkerMap);
            }
        }
    });

    marker.feature = feature;
    geoJsonLayer.addLayer(marker);

    if (closureMarkerMap) {
        closureMarkerMap.set(feature, marker);
    }

    return marker;
}

// マーカーのポップアップを最新の内容で更新
export function updateClosurePopup(feature, closureMarkerMap) {
    const marker = closureMarkerMap && closureMarkerMap.get(feature);
    if (marker) {
        marker.bindPopup(formatClosurePopup(feature));
    }
}

// 登録地点選択時の処理
export function highlightClosure(closureIndex, closureMarkerMap) {
    const previousMarker = selectedClosureMarker;
    const previousFeature = selectedClosureFeature;

    if (closureIndex === '' || closureIndex === null || closureIndex === undefined) {
        if (previousMarker && previousFeature) {
            resetClosureHighlightWithParams(previousMarker, previousFeature);
        }
        setSelectedClosureFeature(null);
        setSelectedClosureMarker(null);
        clearClosureInputs();
        return;
    }

    const closure = allClosures[closureIndex];
    if (!closure) {
        return;
    }

    setSelectedClosureFeature(closure.feature);

    const layer = closureMarkerMap.get(closure.feature);
    if (!layer) {
        return;
    }

    setSelectedClosureMarker(layer);

    if (previousMarker && previousFeature && previousMarker !== selectedClosureMarker) {
        resetClosureHighlightWithParams(previousMarker, previousFeature);
    }

    const props = closure.feature.properties || {};
    document.getElementById('selectedClosureName').value = closure.name;
    setKindRadios(props.kind || '');
    setReasonRadios(props.reason || '');
    setStatusRadios(props.status || '');

    // ハイライト（アクア色）
    applyClosureColor(layer, '#00ffff');

    if (isAddMoveClosureMode) {
        if (draggableClosureMarker && draggableClosureMarker !== selectedClosureMarker) {
            if (draggableClosureMarker.dragging) {
                draggableClosureMarker.dragging.disable();
            }
            const element = draggableClosureMarker.getElement && draggableClosureMarker.getElement();
            if (element) {
                element.style.cursor = '';
            }
        }
        makeClosureDraggable(selectedClosureMarker, selectedClosureFeature);
    }
}

// 入力欄（名称・各ラジオ）をクリア
export function clearClosureInputs() {
    const nameInput = document.getElementById('selectedClosureName');
    if (nameInput) nameInput.value = '';
    setKindRadios('');
    setReasonRadios('');
    setStatusRadios('');
}

// ハイライトのリセット（パラメータ付き）
export function resetClosureHighlightWithParams(marker, feature) {
    if (!marker || !feature) {
        return;
    }
    const defaultColor = (DEFAULTS && DEFAULTS.FEATURE_STYLES && DEFAULTS.FEATURE_STYLES['closure'] && DEFAULTS.FEATURE_STYLES['closure'].fillColor) || '#e60000';
    applyClosureColor(marker, defaultColor);
}

// ハイライトのリセット
export function resetClosureHighlight() {
    if (!selectedClosureMarker || !selectedClosureFeature) {
        return;
    }

    resetClosureHighlightWithParams(selectedClosureMarker, selectedClosureFeature);

    setSelectedClosureFeature(null);
    setSelectedClosureMarker(null);
}

// 新しい登録地点を追加
export function addClosureToMap(latlng, loadedData, closureMarkerMap, geoJsonLayer) {
    if (!loadedData) return;

    let closureNumber = 1;
    let newName = '';
    let nameExists = true;

    while (nameExists) {
        newName = `地点${closureNumber}`;
        nameExists = allClosures.some(c => c.name === newName);
        if (nameExists) closureNumber++;
    }

    const existingIds = allClosures
        .map(c => c.feature.properties && c.feature.properties.id)
        .filter(Boolean);

    const newFeature = {
        type: 'Feature',
        properties: {
            type: 'closure',
            id: nextClosureId(existingIds),
            name: newName,
            kind: 'closed',
            reason: '',
            status: 'draft',
            updatedAt: getDateIso()
        },
        geometry: {
            type: 'Point',
            coordinates: [latlng.lng, latlng.lat]
        }
    };

    if (!loadedData.features) {
        loadedData.features = [];
    }
    loadedData.features.push(newFeature);

    createClosureMarker(newFeature, closureMarkerMap, geoJsonLayer);

    allClosures.push({
        name: newName,
        feature: newFeature
    });

    updateClosureDropdown();

    const closureIndex = allClosures.findIndex(c => c.feature === newFeature);
    if (closureIndex !== -1) {
        document.getElementById('closureSelect').value = closureIndex;
        highlightClosure(closureIndex, closureMarkerMap);
    }

    updateStats(loadedData);
}

// マーカーをドラッグ可能にする
export function makeClosureDraggable(marker, feature) {
    if (!marker) return;

    setDraggableClosureMarker(marker);

    if (marker.getElement) {
        const element = marker.getElement();
        if (element) {
            element.style.cursor = 'move';
        }
    }

    marker.dragging = marker.dragging || new L.Handler.MarkerDrag(marker);
    marker.dragging.enable();

    marker.on('drag', function () {
        const newLatLng = marker.getLatLng();
        if (feature.geometry && feature.geometry.coordinates) {
            feature.geometry.coordinates = [newLatLng.lng, newLatLng.lat];
        }
    });

    marker.on('dragend', function () {
        const newLatLng = marker.getLatLng();
        if (feature.geometry && feature.geometry.coordinates) {
            feature.geometry.coordinates = [newLatLng.lng, newLatLng.lat];
        }
        touchUpdatedAt(feature);
        showMessage('登録地点の位置を更新しました', 'success');
    });
}

// 追加・移動モードを解除
export function exitAddMoveClosureMode(map) {
    if (!isAddMoveClosureMode) return;

    setIsAddMoveClosureMode(false);

    const addMoveBtn = document.getElementById('addMoveClosureBtn');
    if (addMoveBtn) addMoveBtn.classList.remove('active');

    if (closureMapClickHandler) {
        map.off('click', closureMapClickHandler);
        setClosureMapClickHandler(null);
    }

    if (draggableClosureMarker) {
        if (draggableClosureMarker.dragging) {
            draggableClosureMarker.dragging.disable();
        }
        const element = draggableClosureMarker.getElement && draggableClosureMarker.getElement();
        if (element) {
            element.style.cursor = '';
        }
        setDraggableClosureMarker(null);
    }

    map.getContainer().style.cursor = '';
}
