// メインアプリケーションファイル

import { MODES } from './constants.js';
import { showMessage } from './message.js';
import { updateStats } from './stats.js';
import { initializeMap } from './mapCore.js';
import { getLoadedData, setupFileInput, setupFileExport } from './fileIO.js';
import * as RouteEditor from './routeEditor.js';
import * as SpotEditor from './spotEditor.js';

// 地図とレイヤーの初期化
const { map, geoJsonLayer, markerMap, spotMarkerMap } = initializeMap();

// グローバルアクセス用（最適化関数で使用）
window.geoJsonLayer = geoJsonLayer;

// ファイル入出力の設定
setupFileInput(map, geoJsonLayer, markerMap, spotMarkerMap);
setupFileExport();

// モード切り替え処理
document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', function() {
        // 選択状態の表示更新
        document.querySelectorAll('.control-section label span').forEach(span => {
            span.classList.remove('selected');
        });

        if (this.checked) {
            this.nextElementSibling.classList.add('selected');
        }

        // スポットモードから離れる場合、スポット関連の状態をリセット
        if (this.value !== MODES.SPOT) {
            SpotEditor.resetSpotHighlight();

            if (SpotEditor.isAddMoveSpotMode) {
                SpotEditor.exitAddMoveSpotMode(map);
            }

            document.getElementById('spotSelect').value = '';
            document.getElementById('selectedSpotName').value = '';
            document.getElementById('spotCategory').value = '';
        }

        // パネルの表示切り替え
        const geojsonPanel = document.getElementById('geojsonPanel');
        const routePanel = document.getElementById('routePanel');
        const spotPanel = document.getElementById('spotPanel');

        if (this.value === MODES.GEOJSON) {
            geojsonPanel.style.display = 'block';
            routePanel.style.display = 'none';
            spotPanel.style.display = 'none';
        } else if (this.value === MODES.ROUTE) {
            geojsonPanel.style.display = 'none';
            routePanel.style.display = 'block';
            spotPanel.style.display = 'none';
        } else if (this.value === MODES.SPOT) {
            geojsonPanel.style.display = 'none';
            routePanel.style.display = 'none';
            spotPanel.style.display = 'block';
        }
    });
});

// ========================================
// ルート編集モードのイベントハンドラー
// ========================================

// 絞り込みドロップダウンの変更イベントリスナー
document.getElementById('routeStart').addEventListener('change', function() {
    RouteEditor.updateRouteLongDropdown(getLoadedData());
});

document.getElementById('routeEnd').addEventListener('change', function() {
    RouteEditor.updateRoutePathDropdown(getLoadedData());
});

// route-dropdown-fullの変更イベントリスナー（ルートハイライト）
document.getElementById('routePath').addEventListener('change', function() {
    const selectedRouteId = this.value;

    // モードが有効な場合は一旦すべて解除
    if (RouteEditor.state.isAddMoveMode) {
        RouteEditor.exitAddMoveMode(markerMap, map);
        showMessage('ルート選択変更により追加・移動モードを解除しました', 'success');
    }
    if (RouteEditor.state.isDeleteMode) {
        RouteEditor.exitDeleteMode(markerMap);
        showMessage('ルート選択変更により削除モードを解除しました', 'success');
    }

    // ルートをハイライト
    RouteEditor.highlightRoute(selectedRouteId, getLoadedData(), markerMap, map);
});

// 追加・移動ボタン
document.getElementById('addMoveRouteBtn').addEventListener('click', function() {
    const path = document.getElementById('routePath').value;

    if (!path) {
        showMessage('ルートを選択してください', 'warning');
        return;
    }

    // 既に追加・移動モードの場合は解除
    if (RouteEditor.state.isAddMoveMode) {
        RouteEditor.exitAddMoveMode(markerMap, map);
        showMessage('追加・移動モードを解除しました', 'success');
        return;
    }

    // 他のモードが有効な場合は解除
    if (RouteEditor.state.isDeleteMode) {
        RouteEditor.exitDeleteMode(markerMap);
    }

    // 追加・移動モードを開始
    RouteEditor.state.isAddMoveMode = true;
    this.classList.add('active');

    // カーソルを十字に変更
    map.getContainer().style.cursor = 'crosshair';

    // 中間点をクリック可能にする（移動モード用）
    RouteEditor.makeWaypointsClickableForAddMove(path, getLoadedData(), markerMap, map);

    showMessage('地図上をクリックして中間点を追加できます。\n中間点をクリックして、ドラッグして移動できます。\nボタンをもう一度クリックで解除', 'success');

    // 地図クリックイベントを設定（追加用）
    const handler = function(e) {
        if (!RouteEditor.state.isAddMoveMode) return;

        // クリック位置に中間点を追加
        RouteEditor.addWaypointToRoute(path, e.latlng, getLoadedData(), markerMap, geoJsonLayer);

        // ルート線を再描画
        RouteEditor.redrawRouteLine(path, getLoadedData(), map);

        // 中間点を再度クリック可能にする（新しいマーカーも移動可能にする）
        RouteEditor.makeWaypointsClickableForAddMove(path, getLoadedData(), markerMap, map);

        showMessage('中間点を追加しました', 'success');
    };

    RouteEditor.state.mapClickHandler = handler;
    map.on('click', handler);
});

// 削除ボタン
document.getElementById('deleteRouteBtn').addEventListener('click', function() {
    const path = document.getElementById('routePath').value;

    if (!path) {
        showMessage('ルートを選択してください', 'warning');
        return;
    }

    // 既に削除モードの場合は解除
    if (RouteEditor.state.isDeleteMode) {
        RouteEditor.exitDeleteMode(markerMap);
        showMessage('削除モードを解除しました', 'success');
        return;
    }

    // 他のモードが有効な場合は解除
    if (RouteEditor.state.isAddMoveMode) {
        RouteEditor.exitAddMoveMode(markerMap, map);
    }

    // 削除モードを開始
    RouteEditor.state.isDeleteMode = true;
    this.classList.add('active');

    // 中間点をクリック可能にする
    RouteEditor.makeWaypointsClickable(path, getLoadedData(), markerMap, map);

    showMessage('中間点をクリックして削除できます。削除ボタンをもう一度クリックで解除', 'success');
});

// クリアボタン
document.getElementById('clearRouteBtn').addEventListener('click', async function() {
    const path = document.getElementById('routePath').value;

    if (!path) {
        showMessage('ルートを選択してください', 'warning');
        return;
    }

    // 他のモードが有効な場合は解除
    if (RouteEditor.state.isAddMoveMode) {
        RouteEditor.exitAddMoveMode(markerMap, map);
    }
    if (RouteEditor.state.isDeleteMode) {
        RouteEditor.exitDeleteMode(markerMap);
    }

    // ルート名を取得
    const routePathSelect = document.getElementById('routePath');
    const selectedOption = routePathSelect.options[routePathSelect.selectedIndex];
    const routeName = selectedOption ? selectedOption.textContent : path;

    // 確認メッセージを表示
    const confirmed = confirm(`ルート ${routeName} を削除しますか？`);
    if (!confirmed) {
        return;
    }

    // ルートの中間点をすべて削除
    const data = getLoadedData();
    if (data && data.features) {
        for (let i = data.features.length - 1; i >= 0; i--) {
            const feature = data.features[i];
            if (feature.properties &&
                feature.properties.route_id === path &&
                feature.properties.type === 'route_waypoint') {
                data.features.splice(i, 1);
            }
        }
    }

    // 地図から中間点マーカーを削除
    const waypointMarkers = markerMap.get(path);
    if (Array.isArray(waypointMarkers)) {
        waypointMarkers.forEach(marker => {
            map.removeLayer(marker);
        });
        markerMap.delete(path);
    }

    // ルート線を削除
    if (RouteEditor.state.selectedRouteLine) {
        map.removeLayer(RouteEditor.state.selectedRouteLine);
        RouteEditor.state.selectedRouteLine = null;
    }

    // 開始・終了ポイントのマーカー色を元に戻す
    const match = path.match(/^route_(.+)_to_(.+)$/);
    if (match) {
        const startId = match[1];
        const endId = match[2];

        const startMarker = markerMap.get(startId);
        const endMarker = markerMap.get(endId);

        if (startMarker && startMarker.setStyle) {
            const { DEFAULTS } = await import('./constants.js');
            startMarker.setStyle(DEFAULTS.FEATURE_STYLES['ポイントGPS']);
        }
        if (endMarker && endMarker.setStyle) {
            const { DEFAULTS } = await import('./constants.js');
            endMarker.setStyle(DEFAULTS.FEATURE_STYLES['ポイントGPS']);
        }
    }

    // selectedRouteIdをリセット
    RouteEditor.setSelectedRouteId(null);

    // allRoutesから削除したルートを除外
    const routeIndex = RouteEditor.state.allRoutes.findIndex(r => r.routeId === path);
    if (routeIndex !== -1) {
        RouteEditor.state.allRoutes.splice(routeIndex, 1);
    }

    // route-dropdown-shortとroute-dropdown-longを更新
    RouteEditor.updateDropdowns(getLoadedData());

    // route-dropdown-fullを更新して選択無し状態にする
    document.getElementById('routePath').value = '';

    showMessage('ルートを削除(=クリア)しました', 'success');
});

// リセットボタン
document.getElementById('resetDropdownBtn').addEventListener('click', function() {
    // ハイライトをリセット
    RouteEditor.resetRouteHighlight(markerMap, map);

    document.getElementById('routeStart').value = '';
    document.getElementById('routeEnd').value = '';
    document.getElementById('routePath').value = '';
    RouteEditor.updateRouteLongDropdown(getLoadedData());
});

// ========================================
// スポット編集モードのイベントハンドラー
// ========================================

// スポット区分ドロップダウンの初期化
SpotEditor.initSpotCategoryDropdown();

// スポットドロップダウンの変更イベントリスナー
document.getElementById('spotSelect').addEventListener('change', function() {
    const selectedIndex = this.value;
    SpotEditor.highlightSpot(selectedIndex, spotMarkerMap);
});

// テキストボックスのフォーカス離脱時の処理
document.getElementById('selectedSpotName').addEventListener('blur', function() {
    const newName = this.value.trim();

    if (!SpotEditor.selectedSpotFeature || !newName) return;

    // GeoJSONデータの名称を更新
    if (SpotEditor.selectedSpotFeature.properties) {
        SpotEditor.selectedSpotFeature.properties.name = newName;
    }

    // 現在の選択インデックスを取得
    const spotSelect = document.getElementById('spotSelect');
    const currentIndex = parseInt(spotSelect.value);

    // allSpotsのデータを更新
    if (SpotEditor.allSpots[currentIndex]) {
        SpotEditor.allSpots[currentIndex].name = newName;
    }

    // ドロップダウンを更新
    SpotEditor.updateSpotDropdown();

    // 選択を維持
    spotSelect.value = currentIndex;

    showMessage('スポット名を更新しました', 'success');
});

// スポット区分ドロップダウンの変更イベントリスナー
document.getElementById('spotCategory').addEventListener('change', function() {
    const newCategory = this.value;

    if (!SpotEditor.selectedSpotFeature) return;

    // GeoJSONデータのスポット区分を更新
    if (SpotEditor.selectedSpotFeature.properties) {
        SpotEditor.selectedSpotFeature.properties.category = newCategory;
    }

    showMessage('スポット区分を更新しました', 'success');
});

// 追加・移動ボタン
document.getElementById('addMoveSpotBtn').addEventListener('click', function() {
    // 既に追加・移動モードの場合は解除
    if (SpotEditor.isAddMoveSpotMode) {
        SpotEditor.exitAddMoveSpotMode(map);
        showMessage('追加・移動モードを解除しました', 'success');
        return;
    }

    // データが読み込まれていない場合
    if (!getLoadedData()) {
        showMessage('先にGeoJSONファイルを読み込んでください', 'warning');
        return;
    }

    // 追加・移動モードを開始
    SpotEditor.setIsAddMoveSpotMode(true);
    this.classList.add('active');

    // スポットが選択されている場合は移動モードとして動作
    if (SpotEditor.selectedSpotFeature && SpotEditor.selectedSpotMarker) {
        // スポットマーカーをドラッグ可能にする
        SpotEditor.makeSpotDraggable(SpotEditor.selectedSpotMarker, SpotEditor.selectedSpotFeature);
        showMessage('スポットをドラッグして移動できます。\n地図をクリックで新しいスポットを追加できます。\nボタンをもう一度クリックで解除', 'success');
    } else {
        // スポットが選択されていない場合は追加モードのみ
        showMessage('地図上をクリックして新しいスポットを追加してください。\nボタンをもう一度クリックで解除', 'success');
    }

    // カーソルを十字に変更
    map.getContainer().style.cursor = 'crosshair';

    // 地図クリックイベントを設定（スポット追加用）
    const spotHandler = function(e) {
        if (!SpotEditor.isAddMoveSpotMode) return;

        // クリック位置に新しいスポットを追加
        SpotEditor.addSpotToMap(e.latlng, getLoadedData(), spotMarkerMap, geoJsonLayer);

        showMessage('スポットを追加しました', 'success');
    };

    SpotEditor.setSpotMapClickHandler(spotHandler);
    map.on('click', spotHandler);
});

// 削除ボタン
document.getElementById('deleteSpotBtn').addEventListener('click', function() {
    // スポットが選択されていない場合
    if (!SpotEditor.selectedSpotFeature || !SpotEditor.selectedSpotMarker) {
        showMessage('削除するスポットを選択してください', 'warning');
        return;
    }

    // スポット名を取得
    const spotName = SpotEditor.selectedSpotFeature.properties && SpotEditor.selectedSpotFeature.properties.name;

    // 確認メッセージを表示
    const confirmed = confirm(`スポット「${spotName}」を削除しますか？`);
    if (!confirmed) {
        return;
    }

    // 他のモードが有効な場合は解除
    if (SpotEditor.isAddMoveSpotMode) {
        SpotEditor.exitAddMoveSpotMode(map);
    }

    // GeoJSONデータから削除
    const data = getLoadedData();
    if (data && data.features) {
        const featureIndex = data.features.findIndex(f => f === SpotEditor.selectedSpotFeature);
        if (featureIndex !== -1) {
            data.features.splice(featureIndex, 1);
        }
    }

    // 地図からマーカーを削除
    if (SpotEditor.selectedSpotMarker) {
        map.removeLayer(SpotEditor.selectedSpotMarker);
    }

    // spotMarkerMapから削除
    if (SpotEditor.selectedSpotFeature) {
        spotMarkerMap.delete(SpotEditor.selectedSpotFeature);
    }

    // allSpotsから削除
    const spotIndex = SpotEditor.allSpots.findIndex(spot => spot.feature === SpotEditor.selectedSpotFeature);
    if (spotIndex !== -1) {
        SpotEditor.allSpots.splice(spotIndex, 1);
    }

    // 選択状態をリセット
    SpotEditor.setSelectedSpotFeature(null);
    SpotEditor.setSelectedSpotMarker(null);

    // ドロップダウンと統計を更新
    SpotEditor.updateSpotDropdown();
    updateStats(getLoadedData());

    // ドロップダウンの選択をクリア
    document.getElementById('spotSelect').value = '';
    document.getElementById('selectedSpotName').value = '';
    document.getElementById('spotCategory').value = '';

    showMessage('スポットを削除しました', 'success');
});

// 初期統計表示
updateStats(null);
