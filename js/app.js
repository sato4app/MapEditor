// メインアプリケーションファイル

import { MODES } from './constants.js';
import { showMessage } from './message.js';
import { updateStats } from './stats.js';
import { initializeMap } from './mapCore.js';
import { getLoadedData, initData, setupFileInput, setupFileExport, setupGeoJsonLoad, setupClosureFileLoad, setupClosureFileExport } from './fileIO.js';
import * as RouteEditor from './routeEditor.js';
import * as SpotEditor from './spotEditor.js';
import * as AreaEditor from './areaEditor.js';
import * as ClosureEditor from './closureEditor.js';

// 地図とレイヤーの初期化
const { map, geoJsonLayer, markerMap, spotMarkerMap, areaLayerMap, closureMarkerMap } = initializeMap();

// グローバルアクセス用（最適化関数で使用）
window.geoJsonLayer = geoJsonLayer;

// ファイル入出力の設定
setupFileInput(map, geoJsonLayer, markerMap, spotMarkerMap);
setupFileExport();
setupGeoJsonLoad(map, geoJsonLayer, markerMap, spotMarkerMap, areaLayerMap);
setupClosureFileLoad(map, geoJsonLayer, closureMarkerMap);
setupClosureFileExport();

// モード切り替え処理
document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', function () {
        // 選択状態の表示更新
        document.querySelectorAll('.control-section label span').forEach(span => {
            span.classList.remove('selected');
        });

        if (this.checked) {
            this.nextElementSibling.classList.add('selected');
        }

        // スポットモードから離れる場合、スポット関連の状態をリセット
        if (this.value !== MODES.SPOT) {
            if (SpotEditor.isExtractDuplicateMode) {
                SpotEditor.exitExtractDuplicateMode(map, spotMarkerMap);
            }

            SpotEditor.resetSpotHighlight();

            if (SpotEditor.isAddMoveSpotMode) {
                SpotEditor.exitAddMoveSpotMode(map);
            }

            document.getElementById('spotSelect').value = '';
            document.getElementById('selectedSpotName').value = '';
            document.getElementById('spotCategory').value = '';
        }

        // エリアモードから離れる場合、エリア関連の状態をリセット
        if (this.value !== MODES.AREA) {
            AreaEditor.resetAreaHighlight(map);

            if (AreaEditor.isAddAreaMode) {
                AreaEditor.exitAddAreaMode(map);
            }
            if (AreaEditor.isMoveAreaMode) {
                AreaEditor.exitMoveAreaMode(map);
            }

            document.getElementById('areaSelect').value = '';
            const nameInput = document.getElementById('selectedAreaName');
            if (nameInput) nameInput.value = '';
        }

        // 通行止めモードから離れる場合、通行止め関連の状態をリセット
        if (this.value !== MODES.CLOSURE) {
            ClosureEditor.resetClosureHighlight();

            if (ClosureEditor.isAddMoveClosureMode) {
                ClosureEditor.exitAddMoveClosureMode(map);
            }

            document.getElementById('closureSelect').value = '';
            ClosureEditor.clearClosureInputs();
        }

        // パネルの表示切り替え
        const fileIoContainer = document.getElementById('fileIoContainer');
        const routePanel = document.getElementById('routePanel');
        const spotPanel = document.getElementById('spotPanel');
        const areaPanel = document.getElementById('areaPanel');
        const closurePanel = document.getElementById('closurePanelWrapper');

        // 一旦すべて非表示にし、選択モードのパネルのみ表示する
        fileIoContainer.style.display = 'none';
        routePanel.style.display = 'none';
        spotPanel.style.display = 'none';
        if (areaPanel) areaPanel.style.display = 'none';
        if (closurePanel) closurePanel.style.display = 'none';

        if (this.value === MODES.GEOJSON) {
            fileIoContainer.style.display = 'block';
        } else if (this.value === MODES.ROUTE) {
            routePanel.style.display = 'block';
        } else if (this.value === MODES.SPOT) {
            spotPanel.style.display = 'block';
        } else if (this.value === MODES.CLOSURE) {
            if (closurePanel) closurePanel.style.display = 'block';
        } else if (this.value === MODES.AREA) {
            if (areaPanel) areaPanel.style.display = 'block';
        }
    });
});

// ========================================
// ルート編集モードのイベントハンドラー
// ========================================

// 絞り込みドロップダウンの変更イベントリスナー
document.getElementById('routeStart').addEventListener('change', function () {
    const prevRoute = document.getElementById('routePath').value;
    RouteEditor.updateRouteLongDropdown(getLoadedData());
    if (prevRoute && document.getElementById('routePath').value !== prevRoute) {
        if (RouteEditor.state.isAddMoveMode) RouteEditor.exitAddMoveMode(markerMap, map);
        if (RouteEditor.state.isDeleteMode) RouteEditor.exitDeleteMode(markerMap);
        RouteEditor.resetRouteHighlight(markerMap, map, getLoadedData());
    }
});

document.getElementById('routeEnd').addEventListener('change', function () {
    const prevRoute = document.getElementById('routePath').value;
    RouteEditor.updateRoutePathDropdown(getLoadedData());
    if (prevRoute && document.getElementById('routePath').value !== prevRoute) {
        if (RouteEditor.state.isAddMoveMode) RouteEditor.exitAddMoveMode(markerMap, map);
        if (RouteEditor.state.isDeleteMode) RouteEditor.exitDeleteMode(markerMap);
        RouteEditor.resetRouteHighlight(markerMap, map, getLoadedData());
    }
});

// route-dropdown-fullの変更イベントリスナー（ルートハイライト）
document.getElementById('routePath').addEventListener('change', function () {
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
document.getElementById('addMoveRouteBtn').addEventListener('click', function () {
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

    // ルートを最適化してラインを再描画
    RouteEditor.optimizeRoute(path, false, getLoadedData(), markerMap);
    RouteEditor.redrawRouteLine(path, getLoadedData(), map);

    // カーソルを十字に変更
    map.getContainer().style.cursor = 'crosshair';

    // 中間点をクリック可能にする（移動モード用）
    RouteEditor.makeWaypointsClickableForAddMove(path, getLoadedData(), markerMap, map);

    showMessage('地図上をクリックして中間点を追加できます。\n中間点をクリックして、ドラッグして移動できます。\nボタンをもう一度クリックで解除', 'success');

    // 地図クリックイベントを設定（追加用）
    const handler = function (e) {
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
document.getElementById('deleteRouteBtn').addEventListener('click', function () {
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
document.getElementById('clearRouteBtn').addEventListener('click', async function () {
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
document.getElementById('resetDropdownBtn').addEventListener('click', function () {
    // モードが有効な場合は解除
    if (RouteEditor.state.isAddMoveMode) RouteEditor.exitAddMoveMode(markerMap, map);
    if (RouteEditor.state.isDeleteMode) RouteEditor.exitDeleteMode(markerMap);

    // ハイライトをリセット
    RouteEditor.resetRouteHighlight(markerMap, map, getLoadedData());

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
document.getElementById('spotSelect').addEventListener('change', function () {
    const selectedIndex = this.value;
    SpotEditor.highlightSpot(selectedIndex, spotMarkerMap);
});

// テキストボックスのフォーカス離脱時の処理
document.getElementById('selectedSpotName').addEventListener('blur', function () {
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
document.getElementById('spotCategory').addEventListener('change', function () {
    const newCategory = this.value;

    if (!SpotEditor.selectedSpotFeature) return;

    // GeoJSONデータのスポット区分を更新
    if (SpotEditor.selectedSpotFeature.properties) {
        SpotEditor.selectedSpotFeature.properties.category = newCategory;
    }

    showMessage('スポット区分を更新しました', 'success');
});

// 追加・移動ボタン
document.getElementById('addMoveSpotBtn').addEventListener('click', function () {
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

    // 重複スポット抽出モードが有効な場合は解除
    if (SpotEditor.isExtractDuplicateMode) {
        SpotEditor.exitExtractDuplicateMode(map, spotMarkerMap);
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
    const spotHandler = function (e) {
        if (!SpotEditor.isAddMoveSpotMode) return;

        // クリック位置に新しいスポットを追加
        SpotEditor.addSpotToMap(e.latlng, getLoadedData(), spotMarkerMap, geoJsonLayer);

        showMessage('スポットを追加しました', 'success');
    };

    SpotEditor.setSpotMapClickHandler(spotHandler);
    map.on('click', spotHandler);
});

// 削除ボタン
document.getElementById('deleteSpotBtn').addEventListener('click', function () {
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
    if (SpotEditor.isExtractDuplicateMode) {
        SpotEditor.exitExtractDuplicateMode(map, spotMarkerMap);
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

// 重複スポット抽出ボタン
document.getElementById('extractDuplicateSpotsBtn').addEventListener('click', function () {
    // 既に抽出モードの場合は解除
    if (SpotEditor.isExtractDuplicateMode) {
        SpotEditor.exitExtractDuplicateMode(map, spotMarkerMap);
        showMessage('重複スポット抽出モードを解除しました', 'success');
        return;
    }

    // データが読み込まれていない場合
    if (!getLoadedData()) {
        showMessage('先にGeoJSONファイルを読み込んでください', 'warning');
        return;
    }

    // 他のスポットモードが有効な場合は解除
    if (SpotEditor.isAddMoveSpotMode) {
        SpotEditor.exitAddMoveSpotMode(map);
    }

    SpotEditor.enterExtractDuplicateMode(map, spotMarkerMap, getLoadedData, geoJsonLayer);
    showMessage('地図上でドラッグして長方形を描いてください。\n長方形内の同名スポットの重複を抽出します。\nアクア色のスポットをクリックすると削除できます。\nボタンをもう一度クリックで解除', 'success');
});

// ========================================
// エリア編集モードのイベントハンドラー
// ========================================

// エリアドロップダウンの変更イベントリスナー
document.getElementById('areaSelect').addEventListener('change', function () {
    const selectedIndex = this.value;
    AreaEditor.highlightArea(selectedIndex, areaLayerMap, map);
});

// エリア名の変更イベントリスナー
const areaNameInput = document.getElementById('selectedAreaName');
if (areaNameInput) {
    areaNameInput.addEventListener('blur', function () {
        const newName = this.value.trim();
        if (!AreaEditor.selectedAreaFeature || !newName) return;

        // GeoJSONデータの名称を更新
        if (AreaEditor.selectedAreaFeature.properties) {
            AreaEditor.selectedAreaFeature.properties.name = newName;
        }

        // allAreasの名称を更新
        const areaSelect = document.getElementById('areaSelect');
        const currentIndex = parseInt(areaSelect.value);
        if (AreaEditor.allAreas[currentIndex]) {
            AreaEditor.allAreas[currentIndex].name = newName;
        }

        // Update dropdown
        AreaEditor.updateAreaDropdown();
        areaSelect.value = currentIndex;

        // 選択中レイヤーのポップアップとラベルも更新
        if (AreaEditor.selectedAreaLayer) {
            AreaEditor.selectedAreaLayer.bindPopup(`<b>${newName}</b>`);
            AreaEditor.bindAreaLabel(AreaEditor.selectedAreaFeature, AreaEditor.selectedAreaLayer);
        }

        showMessage('エリア名を更新しました', 'success');
    });
}

// 追加ボタン（新規エリア作成）
document.getElementById('addAreaBtn').addEventListener('click', function () {
    // 既に追加モードなら解除
    if (AreaEditor.isAddAreaMode) {
        AreaEditor.exitAddAreaMode(map);
        showMessage('追加モードを解除しました', 'success');
        return;
    }

    // 移動モードが有効なら解除
    if (AreaEditor.isMoveAreaMode) {
        AreaEditor.exitMoveAreaMode(map);
    }

    // データ初期化
    let loadedData = getLoadedData();
    if (!loadedData) {
        loadedData = initData();
    }

    AreaEditor.setIsAddAreaMode(true);
    this.classList.add('active');
    map.getContainer().style.cursor = 'crosshair';

    showMessage('地図をクリックしてエリアの頂点を追加してください。（3点以上で始点付近をクリックして完了）\nボタンをもう一度クリックで解除', 'success');

    const areaHandler = function (e) {
        if (!AreaEditor.isAddAreaMode) return;
        AreaEditor.addAreaVertex(e.latlng, map, loadedData, areaLayerMap, geoJsonLayer);
    };

    AreaEditor.setAreaMapClickHandler(areaHandler);
    map.on('click', areaHandler);
});

// 移動ボタン（選択中エリアの移動）
document.getElementById('moveAreaBtn').addEventListener('click', function () {
    // 既に移動モードなら解除
    if (AreaEditor.isMoveAreaMode) {
        AreaEditor.exitMoveAreaMode(map);
        showMessage('移動モードを解除しました', 'success');
        return;
    }

    if (!AreaEditor.selectedAreaFeature) {
        showMessage('移動するエリアを選択してください', 'warning');
        return;
    }

    // 追加モードが有効なら解除
    if (AreaEditor.isAddAreaMode) {
        AreaEditor.exitAddAreaMode(map);
    }

    AreaEditor.setIsMoveAreaMode(true);
    this.classList.add('active');
    map.getContainer().style.cursor = 'crosshair';

    AreaEditor.setupAreaDragMarker(AreaEditor.selectedAreaLayer, AreaEditor.selectedAreaFeature, map, areaLayerMap);
    showMessage('中心マーカーをドラッグしてエリアを移動できます。\nボタンをもう一度クリックで解除', 'success');
});


// 削除ボタン
document.getElementById('deleteAreaBtn').addEventListener('click', function () {
    if (!AreaEditor.selectedAreaFeature) {
        showMessage('削除するエリアを選択してください', 'warning');
        return;
    }

    const areaName = AreaEditor.selectedAreaFeature.properties && AreaEditor.selectedAreaFeature.properties.name;
    if (!confirm(`エリア「${areaName}」を削除しますか？`)) return;

    if (AreaEditor.isAddAreaMode) {
        AreaEditor.exitAddAreaMode(map);
    }
    if (AreaEditor.isMoveAreaMode) {
        AreaEditor.exitMoveAreaMode(map);
    }

    // 削除前に参照を保持
    const featureToDelete = AreaEditor.selectedAreaFeature;
    const layerToDelete = AreaEditor.selectedAreaLayer;

    // 頂点マーカー等を削除してハイライト状態をリセット
    AreaEditor.resetAreaHighlight(map);

    const data = getLoadedData();
    if (data && data.features) {
        const featureIndex = data.features.findIndex(f => f === featureToDelete);
        if (featureIndex !== -1) data.features.splice(featureIndex, 1);
    }

    // Remove layer
    if (layerToDelete) {
        if (geoJsonLayer.hasLayer(layerToDelete)) {
            geoJsonLayer.removeLayer(layerToDelete);
        }
        if (map.hasLayer(layerToDelete)) {
            map.removeLayer(layerToDelete);
        }
    }

    // Remove from allAreas
    const idx = AreaEditor.allAreas.findIndex(a => a.feature === featureToDelete);
    if (idx !== -1) {
        AreaEditor.allAreas.splice(idx, 1);
    }

    // Remove from marker map
    areaLayerMap.delete(featureToDelete);

    // Update Dropdown/Stats
    AreaEditor.updateAreaDropdown();
    updateStats(getLoadedData());

    // Reset inputs
    document.getElementById('areaSelect').value = '';
    const nameInput = document.getElementById('selectedAreaName');
    if (nameInput) nameInput.value = '';

    showMessage('エリアを削除しました', 'success');
});

// ========================================
// 通行禁止・困難場所の指定モードのイベントハンドラー
// ========================================

// 登録地点ドロップダウンの変更イベントリスナー
document.getElementById('closureSelect').addEventListener('change', function () {
    ClosureEditor.highlightClosure(this.value, closureMarkerMap);
});

// 選択地点名のフォーカス離脱時の処理
document.getElementById('selectedClosureName').addEventListener('blur', function () {
    const newName = this.value.trim();

    if (!ClosureEditor.selectedClosureFeature || !newName) return;

    // GeoJSONデータの名称を更新
    if (ClosureEditor.selectedClosureFeature.properties) {
        ClosureEditor.selectedClosureFeature.properties.name = newName;
    }
    ClosureEditor.touchUpdatedAt(ClosureEditor.selectedClosureFeature);

    // 現在の選択インデックスを取得
    const closureSelect = document.getElementById('closureSelect');
    const currentIndex = parseInt(closureSelect.value);

    // allClosuresのデータを更新
    if (ClosureEditor.allClosures[currentIndex]) {
        ClosureEditor.allClosures[currentIndex].name = newName;
    }

    // ドロップダウンを更新して選択を維持
    ClosureEditor.updateClosureDropdown();
    closureSelect.value = currentIndex;

    // マーカーのポップアップを更新
    ClosureEditor.updateClosurePopup(ClosureEditor.selectedClosureFeature, closureMarkerMap);

    showMessage('登録地点名を更新しました', 'success');
});

// 区分（kind）ラジオボタンの変更イベントリスナー
document.querySelectorAll('input[name="closureKind"]').forEach(radio => {
    radio.addEventListener('change', function () {
        if (!ClosureEditor.selectedClosureFeature) return;

        if (ClosureEditor.selectedClosureFeature.properties) {
            ClosureEditor.selectedClosureFeature.properties.kind = this.value;
        }
        // 区分に応じてマーカーの形状を更新（選択中はハイライト色を維持）
        ClosureEditor.refreshSelectedClosureIcon();
        ClosureEditor.touchUpdatedAt(ClosureEditor.selectedClosureFeature);
        ClosureEditor.updateClosurePopup(ClosureEditor.selectedClosureFeature, closureMarkerMap);

        showMessage('区分を更新しました', 'success');
    });
});

// 登録理由（reason）ラジオボタンの変更イベントリスナー
document.querySelectorAll('input[name="closureReason"]').forEach(radio => {
    radio.addEventListener('change', function () {
        if (!ClosureEditor.selectedClosureFeature) return;

        if (ClosureEditor.selectedClosureFeature.properties) {
            ClosureEditor.selectedClosureFeature.properties.reason = this.value;
        }
        ClosureEditor.touchUpdatedAt(ClosureEditor.selectedClosureFeature);
        ClosureEditor.updateClosurePopup(ClosureEditor.selectedClosureFeature, closureMarkerMap);

        showMessage('登録理由を更新しました', 'success');
    });
});

// 追加・移動ボタン
document.getElementById('addMoveClosureBtn').addEventListener('click', function () {
    // 既に追加・移動モードの場合は解除
    if (ClosureEditor.isAddMoveClosureMode) {
        ClosureEditor.exitAddMoveClosureMode(map);
        showMessage('追加・移動モードを解除しました', 'success');
        return;
    }

    // データが未読み込みの場合は初期化（新規追加できるようにする）
    if (!getLoadedData()) {
        initData();
    }

    // 追加・移動モードを開始
    ClosureEditor.setIsAddMoveClosureMode(true);
    this.classList.add('active');

    // 地点が選択されている場合は移動モードとしても動作
    if (ClosureEditor.selectedClosureFeature && ClosureEditor.selectedClosureMarker) {
        ClosureEditor.makeClosureDraggable(ClosureEditor.selectedClosureMarker, ClosureEditor.selectedClosureFeature);
        showMessage('地点をドラッグして移動できます。\n地図をクリックで新しい地点を追加できます。\nボタンをもう一度クリックで解除', 'success');
    } else {
        showMessage('地図上をクリックして新しい地点を追加してください。\nボタンをもう一度クリックで解除', 'success');
    }

    // カーソルを十字に変更
    map.getContainer().style.cursor = 'crosshair';

    // 地図クリックイベントを設定（地点追加用）
    const closureHandler = function (e) {
        if (!ClosureEditor.isAddMoveClosureMode) return;

        ClosureEditor.addClosureToMap(e.latlng, getLoadedData(), closureMarkerMap, geoJsonLayer);

        showMessage('地点を追加しました', 'success');
    };

    ClosureEditor.setClosureMapClickHandler(closureHandler);
    map.on('click', closureHandler);
});

// 削除ボタン
document.getElementById('deleteClosureBtn').addEventListener('click', function () {
    // 地点が選択されていない場合
    if (!ClosureEditor.selectedClosureFeature || !ClosureEditor.selectedClosureMarker) {
        showMessage('削除する地点を選択してください', 'warning');
        return;
    }

    // 地点名を取得
    const closureName = ClosureEditor.selectedClosureFeature.properties && ClosureEditor.selectedClosureFeature.properties.name;

    // 確認メッセージを表示
    const confirmed = confirm(`地点「${closureName}」を削除しますか？`);
    if (!confirmed) {
        return;
    }

    // 追加・移動モードが有効な場合は解除
    if (ClosureEditor.isAddMoveClosureMode) {
        ClosureEditor.exitAddMoveClosureMode(map);
    }

    // 削除対象を保持
    const featureToDelete = ClosureEditor.selectedClosureFeature;
    const markerToDelete = ClosureEditor.selectedClosureMarker;

    // GeoJSONデータから削除
    const data = getLoadedData();
    if (data && data.features) {
        const featureIndex = data.features.findIndex(f => f === featureToDelete);
        if (featureIndex !== -1) {
            data.features.splice(featureIndex, 1);
        }
    }

    // 地図からマーカーを削除
    if (markerToDelete) {
        if (geoJsonLayer.hasLayer(markerToDelete)) {
            geoJsonLayer.removeLayer(markerToDelete);
        }
        if (map.hasLayer(markerToDelete)) {
            map.removeLayer(markerToDelete);
        }
    }

    // closureMarkerMapから削除
    closureMarkerMap.delete(featureToDelete);

    // allClosuresから削除
    const closureIndex = ClosureEditor.allClosures.findIndex(c => c.feature === featureToDelete);
    if (closureIndex !== -1) {
        ClosureEditor.allClosures.splice(closureIndex, 1);
    }

    // 選択状態をリセット
    ClosureEditor.setSelectedClosureFeature(null);
    ClosureEditor.setSelectedClosureMarker(null);

    // ドロップダウンと統計を更新
    ClosureEditor.updateClosureDropdown();
    updateStats(getLoadedData());

    // 入力をクリア
    document.getElementById('closureSelect').value = '';
    ClosureEditor.clearClosureInputs();

    showMessage('地点を削除しました', 'success');
});

