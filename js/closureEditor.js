// 通行止め・通行困難地点（closure）の登録機能
// 統合GeoJSON（ポイント・ルート・スポット・エリア）とは別に、本モジュール内で
// closureのFeatureを保持し、専用ファイルとして入出力する（fileIO.js）。

import { MODES, CLOSURE_STYLES, CLOSURE_ICON_BOX, CLOSURE_HIGHLIGHT_COLOR, CLOSURE_KIND_LABELS } from './constants.js';
import { showMessage } from './message.js';
import { getDateIso } from './stats.js';
import { fetchElevation } from './elevation.js';

// closure編集の状態管理
export const state = {
    map: null,
    layer: null,             // マーカーを追加するレイヤー（geoJsonLayer）
    features: [],            // closure Featureの配列（内部の正本）
    closures: [],            // ドロップダウン用 { name, feature }
    markerMap: new Map(),    // feature -> marker
    selectedFeature: null,
    selectedMarker: null,
    isAddMoveMode: false,
    mapClickHandler: null,
    loadedVersion: ''        // 読み込んだファイルのversion（出力時に引き継ぐ）
};

// 地図とレイヤーを受け取って初期化（app.jsから呼ぶ）
export function initClosureEditor(map, layer) {
    state.map = map;
    state.layer = layer;
}

// ===== データへのアクセス（ファイル入出力から使用） =====

// 内部に保持しているclosure Featureの配列
export function getClosureFeatures() {
    return state.features;
}

// 区分別の件数（件数表示・出力ファイル名で使用）
export function getClosureCounts() {
    const counts = { closed: 0, difficult: 0, unknown: 0, total: state.features.length };

    state.features.forEach(feature => {
        const kind = feature.properties && feature.properties.kind;
        if (kind === 'closed') counts.closed++;
        else if (kind === 'difficult') counts.difficult++;
        else counts.unknown++;
    });

    return counts;
}

// 既存IDの集合（ID重複の検出・新規採番で使用）
export function getExistingClosureIds() {
    return new Set(
        state.features
            .map(feature => feature.properties && feature.properties.id)
            .filter(Boolean)
    );
}

// 既存IDの一覧から次の一意なID（C-01形式）を生成
export function nextClosureId(existingIds) {
    let maxNum = 0;

    existingIds.forEach(id => {
        const matched = /^C-(\d+)$/.exec(id);
        if (matched) {
            const num = parseInt(matched[1], 10);
            if (num > maxNum) maxNum = num;
        }
    });

    return `C-${String(maxNum + 1).padStart(2, '0')}`;
}

// updatedAtを本日の日付に更新（追加・移動・属性編集で呼ぶ）
export function touchUpdatedAt(feature) {
    if (feature && feature.properties) {
        feature.properties.updatedAt = getDateIso();
    }
}

// 読み込んだFeatureを内部データへ追加し、マーカーを生成する（fileIO.jsから呼ぶ）
export function addLoadedClosure(feature) {
    state.features.push(feature);
    createClosureMarker(feature);
}

// ===== マーカーの描画 =====

// ポップアップに地点名・備考を埋め込む際のHTMLエスケープ
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 区分（kind）に応じたマーカー形状のHTMLを生成
// closed: ✖印 / difficult: 三角形 / 未選択: ？（疑問符）
function closureShapeHtml(kind, colorOverride) {
    const style = CLOSURE_STYLES[kind] || CLOSURE_STYLES.unknown;
    const color = colorOverride || style.color;
    const box = CLOSURE_ICON_BOX;
    const size = style.size;
    const offset = (box - size) / 2; // 当たり領域の中央に形状を置く

    // 透明な背景矩形でアイコン全体をクリック・ドラッグの当たり領域にする
    const hitArea = `<rect x="0" y="0" width="${box}" height="${box}" fill="transparent" pointer-events="all" />`;

    let shape;
    if (style.shape === 'x') {
        const weight = Math.max(2, Math.round(size / 3));
        shape = `<line x1="${offset}" y1="${offset}" x2="${offset + size}" y2="${offset + size}" stroke="${color}" stroke-width="${weight}" stroke-linecap="round" />`
            + `<line x1="${offset + size}" y1="${offset}" x2="${offset}" y2="${offset + size}" stroke="${color}" stroke-width="${weight}" stroke-linecap="round" />`;
    } else if (style.shape === 'triangle') {
        shape = `<polygon points="${box / 2},${offset} ${offset + size},${offset + size} ${offset},${offset + size}" fill="${color}" />`;
    } else {
        shape = `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" `
            + `font-family="sans-serif" font-size="${size}" font-weight="bold" fill="${color}">?</text>`;
    }

    return `<svg width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" style="display: block;">`
        + hitArea + shape + `</svg>`;
}

// 区分（kind）に応じたマーカーアイコン（L.divIcon）を生成
function buildClosureIcon(kind) {
    const box = CLOSURE_ICON_BOX;

    return L.divIcon({
        className: 'closure-marker',
        html: closureShapeHtml(kind),
        iconSize: [box, box],
        iconAnchor: [box / 2, box / 2]
    });
}

// マーカーの色・形状を更新（選択時のハイライト・既定色リセットで共通利用）
// 区分に応じた形状を保ったままアイコン要素の中身を差し替える
// （setIconを使わずドラッグ状態を維持するため）
function applyClosureColor(marker, colorOverride) {
    if (!marker || !marker.getElement) return;

    const element = marker.getElement();
    if (!element) return;

    const kind = marker.feature && marker.feature.properties && marker.feature.properties.kind;
    element.innerHTML = closureShapeHtml(kind, colorOverride);
}

// 選択中マーカーのアイコンを現在の区分（kind）で再描画（ハイライト色を維持）
export function refreshSelectedClosureIcon() {
    if (state.selectedMarker) {
        applyClosureColor(state.selectedMarker, CLOSURE_HIGHLIGHT_COLOR);
    }
}

// ポップアップの内容を生成
function formatClosurePopup(feature) {
    const props = feature.properties || {};
    const lines = [`<strong>${escapeHtml(props.name || props.id || '')}</strong>`];

    const kindLabel = CLOSURE_KIND_LABELS[props.kind];
    if (kindLabel && props.kind !== 'unknown') lines.push(escapeHtml(kindLabel));
    if (props.reason) lines.push(`理由: ${escapeHtml(props.reason)}`);
    if (props.note) lines.push(escapeHtml(props.note));
    if (props.updatedAt) lines.push(`更新日: ${escapeHtml(props.updatedAt)}`);

    return lines.join('<br>');
}

// closureマーカーを生成して地図に追加（追加処理・ファイル読み込みで共通利用）
function createClosureMarker(feature) {
    if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates)) return null;

    const [lng, lat] = feature.geometry.coordinates;
    const kind = feature.properties && feature.properties.kind;

    const marker = L.marker([lat, lng], {
        draggable: true,
        icon: buildClosureIcon(kind)
    });

    marker.bindPopup(formatClosurePopup(feature));

    marker.on('click', function () {
        const currentMode = document.querySelector('input[name="mode"]:checked').value;
        if (currentMode !== MODES.CLOSURE) return;

        const index = state.closures.findIndex(closure => closure.feature === feature);
        if (index !== -1) {
            document.getElementById('closureSelect').value = index;
            highlightClosure(index);
        }
    });

    marker.feature = feature;
    state.layer.addLayer(marker);

    // 既定はドラッグ無効。追加・移動モード中に生成された場合のみドラッグ可能にする
    if (marker.dragging) marker.dragging.disable();
    if (state.isAddMoveMode) {
        makeClosureDraggable(marker, feature);
    }

    state.markerMap.set(feature, marker);
    return marker;
}

// マーカーのポップアップを最新の内容で更新
export function updateClosurePopup(feature) {
    const marker = state.markerMap.get(feature);
    if (marker) {
        marker.bindPopup(formatClosurePopup(feature));
    }
}

// ===== ドロップダウン・入力欄 =====

// 登録地点一覧を内部データから作り直す
function extractClosures() {
    state.closures = state.features.map(feature => ({
        name: (feature.properties && feature.properties.name) || '名称未設定',
        feature: feature
    }));
}

// 登録地点ドロップダウン・件数表示の更新
export function updateClosureDropdown() {
    extractClosures();

    const counts = getClosureCounts();

    const countDisplay = document.getElementById('closureCountDisplay');
    if (countDisplay) countDisplay.value = counts.total;

    const breakdown = document.getElementById('closureBreakdown');
    if (breakdown) {
        breakdown.textContent = `通行止め ${counts.closed} / 通行困難 ${counts.difficult}`
            + (counts.unknown > 0 ? ` / 未選択 ${counts.unknown}` : '');
    }

    const closureSelect = document.getElementById('closureSelect');
    if (!closureSelect) return;

    const previousSelection = closureSelect.value;

    closureSelect.innerHTML = '<option value="">選択してください</option>';
    state.closures.forEach((closure, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = closure.name;
        closureSelect.appendChild(option);
    });

    if (previousSelection) {
        closureSelect.value = previousSelection;
    }
}

// 区分（kind）ラジオボタンの設定。nullを渡すとすべて未選択になる
function setKindRadios(value) {
    document.querySelectorAll('input[name="closureKind"]').forEach(radio => {
        radio.checked = (radio.value === value);
    });
}

// 登録理由（reason）ラジオボタンの設定。空文字は「なし」、nullはすべて未選択
function setReasonRadios(value) {
    document.querySelectorAll('input[name="closureReason"]').forEach(radio => {
        radio.checked = (radio.value === value);
    });
}

// 入力欄（名称・備考・各ラジオ）をクリア
export function clearClosureInputs() {
    const nameInput = document.getElementById('selectedClosureName');
    if (nameInput) nameInput.value = '';

    const noteInput = document.getElementById('closureNote');
    if (noteInput) noteInput.value = '';

    setKindRadios(null);
    setReasonRadios(null);
}

// ===== 選択・ハイライト =====

// 登録地点選択時の処理
export function highlightClosure(closureIndex) {
    const previousMarker = state.selectedMarker;

    if (closureIndex === '' || closureIndex === null || closureIndex === undefined) {
        if (previousMarker) applyClosureColor(previousMarker, null);
        state.selectedFeature = null;
        state.selectedMarker = null;
        clearClosureInputs();
        return;
    }

    const closure = state.closures[closureIndex];
    if (!closure) return;

    const marker = state.markerMap.get(closure.feature);
    if (!marker) return;

    state.selectedFeature = closure.feature;
    state.selectedMarker = marker;

    if (previousMarker && previousMarker !== marker) {
        applyClosureColor(previousMarker, null);
    }

    const props = closure.feature.properties || {};
    document.getElementById('selectedClosureName').value = closure.name;
    document.getElementById('closureNote').value = props.note || '';
    setKindRadios(props.kind === 'closed' || props.kind === 'difficult' ? props.kind : null);
    setReasonRadios(props.reason || '');

    // ハイライト（アクア色）
    applyClosureColor(marker, CLOSURE_HIGHLIGHT_COLOR);

    if (state.isAddMoveMode) {
        // 追加・移動モード中は全地点がドラッグ可能。選択地点も確実に有効化しておく
        makeClosureDraggable(marker, closure.feature);
    }
}

// ハイライトのリセット（モード切り替え時に呼ぶ）
export function resetClosureHighlight() {
    if (!state.selectedMarker) return;

    applyClosureColor(state.selectedMarker, null);

    state.selectedFeature = null;
    state.selectedMarker = null;
}

// ===== 地点の追加・移動・削除 =====

// 地点の標高を国土地理院APIから取得し、座標の3番目の要素として付与する
async function applyElevation(feature) {
    if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates)) return;

    const [lng, lat] = feature.geometry.coordinates;
    const elevation = await fetchElevation(lat, lng);

    if (elevation != null) {
        // 取得中に位置が変わっている可能性があるため、最新の経度・緯度に標高を付与
        const coords = feature.geometry.coordinates;
        feature.geometry.coordinates = [coords[0], coords[1], elevation];
        touchUpdatedAt(feature);
        updateClosurePopup(feature);
        showMessage(`標高を取得しました（${elevation}m）`, 'success');
    } else {
        showMessage('標高の取得に失敗しました', 'warning');
    }
}

// 新しい登録地点を追加
async function addClosureAt(latlng) {
    let closureNumber = 1;
    let newName = '';
    let nameExists = true;

    while (nameExists) {
        newName = `地点${closureNumber}`;
        nameExists = state.closures.some(closure => closure.name === newName);
        if (nameExists) closureNumber++;
    }

    const newFeature = {
        type: 'Feature',
        properties: {
            type: 'closure',
            id: nextClosureId(getExistingClosureIds()),
            name: newName,
            kind: 'closed',
            reason: '',
            updatedAt: getDateIso()
        },
        geometry: {
            type: 'Point',
            coordinates: [latlng.lng, latlng.lat]
        }
    };

    state.features.push(newFeature);
    createClosureMarker(newFeature);
    updateClosureDropdown();

    const index = state.closures.findIndex(closure => closure.feature === newFeature);
    if (index !== -1) {
        document.getElementById('closureSelect').value = index;
        highlightClosure(index);
    }

    // 標高を取得して座標に付与（非同期。上の同期処理が完了してから実行される）
    await applyElevation(newFeature);
}

// マーカーをドラッグ可能にする
function makeClosureDraggable(marker, feature) {
    if (!marker) return;

    if (marker.getElement) {
        const element = marker.getElement();
        if (element) element.style.cursor = 'move';
    }

    // マーカーは draggable:true で生成済みのため dragging ハンドラは存在する。有効化のみ行う
    if (marker.dragging) marker.dragging.enable();

    // ドラッグハンドラはマーカーごとに1度だけ登録（モード再入時の二重登録を防ぐ）
    if (marker._closureDragBound) return;
    marker._closureDragBound = true;

    marker.on('drag', function () {
        const newLatLng = marker.getLatLng();
        if (feature.geometry) {
            feature.geometry.coordinates = [newLatLng.lng, newLatLng.lat];
        }
    });

    marker.on('dragend', async function () {
        const newLatLng = marker.getLatLng();
        if (feature.geometry) {
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
function enableAllClosureDragging() {
    state.markerMap.forEach((marker, feature) => makeClosureDraggable(marker, feature));
}

// 全ての登録地点マーカーのドラッグを無効化する
function disableAllClosureDragging() {
    state.markerMap.forEach(marker => {
        if (marker.dragging) marker.dragging.disable();
        const element = marker.getElement && marker.getElement();
        if (element) element.style.cursor = '';
    });
}

// 追加・移動モードを開始
export function enterAddMoveClosureMode() {
    state.isAddMoveMode = true;

    const addMoveBtn = document.getElementById('addMoveClosureBtn');
    if (addMoveBtn) addMoveBtn.classList.add('active');

    // 全ての登録地点をドラッグ可能にする
    enableAllClosureDragging();

    // カーソルを十字に変更
    state.map.getContainer().style.cursor = 'crosshair';

    // 地図クリックイベントを設定（地点追加用）
    const handler = function (e) {
        if (!state.isAddMoveMode) return;

        addClosureAt(e.latlng);
        showMessage('地点を追加しました', 'success');
    };

    state.mapClickHandler = handler;
    state.map.on('click', handler);
}

// 追加・移動モードを解除
export function exitAddMoveClosureMode() {
    if (!state.isAddMoveMode) return;

    state.isAddMoveMode = false;

    const addMoveBtn = document.getElementById('addMoveClosureBtn');
    if (addMoveBtn) addMoveBtn.classList.remove('active');

    if (state.mapClickHandler) {
        state.map.off('click', state.mapClickHandler);
        state.mapClickHandler = null;
    }

    disableAllClosureDragging();
    state.map.getContainer().style.cursor = '';
}

// 選択中の地点を削除する
export function deleteSelectedClosure() {
    if (!state.selectedFeature || !state.selectedMarker) return;

    // 削除直後に地図クリックで地点が増えないよう、追加・移動モードを解除しておく
    exitAddMoveClosureMode();

    const featureToDelete = state.selectedFeature;
    const markerToDelete = state.selectedMarker;

    const index = state.features.indexOf(featureToDelete);
    if (index !== -1) state.features.splice(index, 1);

    // 地図からマーカーを削除
    if (state.layer.hasLayer(markerToDelete)) {
        state.layer.removeLayer(markerToDelete);
    }
    if (state.map.hasLayer(markerToDelete)) {
        state.map.removeLayer(markerToDelete);
    }
    state.markerMap.delete(featureToDelete);

    state.selectedFeature = null;
    state.selectedMarker = null;

    document.getElementById('closureSelect').value = '';
    updateClosureDropdown();
    clearClosureInputs();
}
