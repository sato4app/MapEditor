// 通行禁止・困難場所の指定機能（closure）

import { DEFAULTS, MODES } from './constants.js';
import { showMessage } from './message.js';
import { updateStats, getDateIso } from './stats.js';
import { fetchElevation } from './elevation.js';

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

// 地点の標高を国土地理院APIから取得し、座標の3番目の要素として付与する
async function applyElevation(feature) {
    if (!feature || !feature.geometry || !feature.geometry.coordinates) return;

    const lng = feature.geometry.coordinates[0];
    const lat = feature.geometry.coordinates[1];
    const elevation = await fetchElevation(lat, lng);

    if (elevation != null) {
        // 取得中に位置が変わっている可能性があるため、最新の経度・緯度に標高を付与
        const coords = feature.geometry.coordinates;
        feature.geometry.coordinates = [coords[0], coords[1], elevation];
        touchUpdatedAt(feature);
        showMessage(`標高を取得しました（${elevation}m）`, 'success');
    } else {
        showMessage('標高の取得に失敗しました', 'warning');
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

// 区分（kind）の表示用ラベル
function kindLabel(kind) {
    if (kind === 'closed') return '通行止め';
    if (kind === 'difficult') return '通行困難';
    return '';
}

// 選択中マーカーのハイライト色（アクア）
const CLOSURE_HIGHLIGHT_COLOR = '#00ffff';

// 区分（kind）に応じたマーカー形状のHTMLを生成
// closed: ×印 / difficult: 三角形 / 未選択: ？（疑問符）
function closureShapeHtml(kind, color) {
    const style = DEFAULTS.FEATURE_STYLES['closure'];
    const size = style.radius;
    const opacity = style.fillOpacity;

    // 透明な背景矩形でアイコン全体をクリック・ドラッグの当たり領域にする
    // （×印のように描画部分が細い形状でも、アイコン全域を掴めるようにするため）
    const hitArea = `<rect x="0" y="0" width="${size}" height="${size}" fill="transparent" pointer-events="all" />`;

    let shape;
    if (kind === 'closed') {
        // ×印（2本の交差線）
        shape = `<line x1="1.5" y1="1.5" x2="${size - 1.5}" y2="${size - 1.5}" stroke="${color}" stroke-width="3" stroke-linecap="round" />`
            + `<line x1="${size - 1.5}" y1="1.5" x2="1.5" y2="${size - 1.5}" stroke="${color}" stroke-width="3" stroke-linecap="round" />`;
    } else if (kind === 'difficult') {
        // 三角形（頂点を上にした警告形状）
        shape = `<polygon points="${size / 2},0.5 ${size - 0.5},${size - 0.5} 0.5,${size - 0.5}" fill="${color}" />`;
    } else {
        // ？（未選択・疑問符）
        shape = `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" `
            + `font-family="sans-serif" font-size="${size + 1}" font-weight="bold" fill="${color}">?</text>`;
    }

    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="opacity: ${opacity}; display: block;">`
        + hitArea + shape + `</svg>`;
}

// 区分（kind）に応じたマーカーアイコン（L.divIcon）を生成
function buildClosureIcon(kind, color) {
    const size = DEFAULTS.FEATURE_STYLES['closure'].radius;
    return L.divIcon({
        className: 'closure-marker',
        html: closureShapeHtml(kind, color),
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
    });
}

// マーカーの色・形状を更新（選択時のハイライト・既定色リセット共通）
// kindに応じた形状を保ったままアイコン要素の中身を差し替える（setIconを使わずドラッグ状態を維持）
function applyClosureColor(marker, color) {
    if (!marker || !marker.getElement) return;
    const element = marker.getElement();
    if (!element) return;
    const kind = marker.feature && marker.feature.properties && marker.feature.properties.kind;
    element.innerHTML = closureShapeHtml(kind, color);
}

// 選択中マーカーのアイコンを現在の区分（kind）で再描画（ハイライト色を維持）
export function refreshSelectedClosureIcon() {
    if (selectedClosureMarker) {
        applyClosureColor(selectedClosureMarker, CLOSURE_HIGHLIGHT_COLOR);
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
    const kind = feature.properties && feature.properties.kind;

    const marker = L.marker([lat, lng], {
        draggable: true,
        icon: buildClosureIcon(kind, style.fillColor)
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

    // 既定はドラッグ無効。追加・移動モード中に生成された場合のみドラッグ可能にする
    if (marker.dragging) marker.dragging.disable();
    if (isAddMoveClosureMode) {
        makeClosureDraggable(marker, feature);
    }

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
    document.getElementById('closureNote').value = props.note || '';
    setKindRadios(props.kind || '');
    setReasonRadios(props.reason || '');

    // ハイライト（アクア色）
    applyClosureColor(layer, CLOSURE_HIGHLIGHT_COLOR);

    if (isAddMoveClosureMode) {
        // 追加・移動モード中は全地点がドラッグ可能。選択地点も確実に有効化しておく
        makeClosureDraggable(selectedClosureMarker, selectedClosureFeature);
    }
}

// 入力欄（名称・各ラジオ）をクリア
export function clearClosureInputs() {
    const nameInput = document.getElementById('selectedClosureName');
    if (nameInput) nameInput.value = '';
    const noteInput = document.getElementById('closureNote');
    if (noteInput) noteInput.value = '';
    setKindRadios('');
    setReasonRadios('');
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
export async function addClosureToMap(latlng, loadedData, closureMarkerMap, geoJsonLayer) {
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

    // 標高を取得して座標に付与（非同期。上の同期処理が完了してから実行される）
    await applyElevation(newFeature);
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

    // マーカーは draggable:true で生成済みのため dragging ハンドラは存在する。有効化のみ行う
    if (marker.dragging) marker.dragging.enable();

    // ドラッグハンドラはマーカーごとに1度だけ登録（モード再入時の二重登録を防ぐ）
    if (marker._closureDragBound) return;
    marker._closureDragBound = true;

    marker.on('drag', function () {
        const newLatLng = marker.getLatLng();
        if (feature.geometry && feature.geometry.coordinates) {
            feature.geometry.coordinates = [newLatLng.lng, newLatLng.lat];
        }
    });

    marker.on('dragend', async function () {
        const newLatLng = marker.getLatLng();
        if (feature.geometry && feature.geometry.coordinates) {
            feature.geometry.coordinates = [newLatLng.lng, newLatLng.lat];
        }
        touchUpdatedAt(feature);
        showMessage('登録地点の位置を更新しました', 'success');
        // 移動後の位置で標高を再取得して付与
        await applyElevation(feature);
    });
}

// 追加・移動モード中、全ての登録地点マーカーをドラッグ可能にする
// （任意の地点を直接掴んで移動できるようにする）
export function enableAllClosureDragging(closureMarkerMap) {
    if (!closureMarkerMap) return;
    closureMarkerMap.forEach((marker, feature) => {
        makeClosureDraggable(marker, feature);
    });
}

// 全ての登録地点マーカーのドラッグを無効化する
export function disableAllClosureDragging(closureMarkerMap) {
    if (!closureMarkerMap) return;
    closureMarkerMap.forEach((marker) => {
        if (marker.dragging) marker.dragging.disable();
        const element = marker.getElement && marker.getElement();
        if (element) element.style.cursor = '';
    });
}

// 追加・移動モードを解除
export function exitAddMoveClosureMode(map, closureMarkerMap) {
    if (!isAddMoveClosureMode) return;

    setIsAddMoveClosureMode(false);

    const addMoveBtn = document.getElementById('addMoveClosureBtn');
    if (addMoveBtn) addMoveBtn.classList.remove('active');

    if (closureMapClickHandler) {
        map.off('click', closureMapClickHandler);
        setClosureMapClickHandler(null);
    }

    // 全ての登録地点のドラッグを無効化
    disableAllClosureDragging(closureMarkerMap);
    setDraggableClosureMarker(null);

    map.getContainer().style.cursor = '';
}
