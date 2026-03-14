// ファイル入出力機能

import { DEFAULTS, MODES } from './constants.js';
import { showMessage } from './message.js';
import { updateStats, getDateString } from './stats.js';
import { extractPointsAndRoutes, updateDropdowns, initAllRouteLines, state as routeEditorState } from './routeEditor.js';
import { extractSpots, updateSpotDropdown, highlightSpot, allSpots } from './spotEditor.js';
import { extractAreas, updateAreaDropdown, highlightArea, allAreas, bindAreaLabel } from './areaEditor.js';

// ファイル入出力の状態管理
let loadedDataInternal = null;
let lastLoadedFileHandle = null;
let loadedFileCount = 0;

function updateFileCount() {
    const el = document.getElementById('fileCount');
    if (el) el.value = loadedFileCount;
}

// loadedDataへのアクセサー
export function getLoadedData() {
    return loadedDataInternal;
}

export function initData() {
    if (!loadedDataInternal) {
        loadedDataInternal = {
            type: "FeatureCollection",
            features: []
        };
    }
    return loadedDataInternal;
}

export { loadedDataInternal as loadedData };

// GeoJSONファイルの読み込み (廃止 -> Excel読み込みへ変更)
export function setupFileInput(map, geoJsonLayer, markerMap, spotMarkerMap) {
    document.getElementById('fileInput').addEventListener('change', async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            // Excelファイルの判定としきい値チェック
            // 拡張子で簡易判定
            if (file.name.toLowerCase().endsWith('.xlsx')) {
                // 動的インポートでExcelローダーを読み込む
                const { loadExcelFile } = await import('./excelLoader.js');
                const points = await loadExcelFile(file);

                if (!points || points.length === 0) {
                    showMessage('有効なポイントデータが見つかりませんでした', 'warning');
                    this.value = '';
                    return;
                }

                // データを初期化または取得
                let data = initData();

                // GeoJSON Featureに変換
                const newFeatures = points.map(p => ({
                    type: "Feature",
                    properties: {
                        type: "ポイントGPS",
                        id: p.pointId,
                        name: p.name,
                        pointId: p.pointId,
                        elevation: p.elevation,
                        description: p.description
                    },
                    geometry: {
                        type: "Point",
                        coordinates: [p.lng, p.lat]
                    }
                }));

                // 既存データに追加
                data.features.push(...newFeatures);

                // マーカーを表示
                newFeatures.forEach(f => {
                    const lat = f.geometry.coordinates[1];
                    const lng = f.geometry.coordinates[0];
                    // スタイルを適用
                    const style = DEFAULTS.FEATURE_STYLES['ポイントGPS'];

                    const marker = L.circleMarker([lat, lng], style);

                    // ポップアップを設定
                    const popupContent = `${f.properties.id}<br>${f.properties.name}<br>ポイントGPS`;
                    marker.bindPopup(popupContent);

                    geoJsonLayer.addLayer(marker);

                    // markerMapにidをキーとして登録（ルート編集で開始・終了点のハイライトに使用）
                    if (f.properties.id && markerMap) {
                        markerMap.set(f.properties.id, marker);
                    }
                });

                // 統計情報を更新
                loadedFileCount++;
                updateFileCount();
                updateStats(data);

                showMessage(`${newFeatures.length}件のポイントGPSを読み込みました`, 'success');

                // 地図の範囲を調整（オプション）
                // 箕面大滝を中心（初期表示）とするため、ここでは移動しない
                if (newFeatures.length > 0) {
                    // 何もしない
                }

            } else {
                showMessage('Excelファイル(.xlsx)を選択してください', 'warning');
            }
        } catch (error) {
            console.error('File load error:', error);
            showMessage(`読み込みエラー: ${error.message}`, 'error');
        } finally {
            // ファイル選択をリセット
            this.value = '';
        }
    });
}

// 読み込み種別選択モーダルを表示し、選択結果をPromiseで返す
function showImportTypeModal(features) {
    return new Promise((resolve) => {
        // 種別ごとの件数カウント
        const counts = { point: 0, route: 0, spot: 0, area: 0 };
        features.forEach(f => {
            if (!f.geometry) return;
            const type = f.properties && f.properties.type;
            const geomType = f.geometry.type;
            if (geomType === 'LineString') {
                counts.route++;
            } else if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
                counts.area++;
            } else if (geomType === 'Point') {
                if (type === 'spot') counts.spot++;
                else if (type === 'point' || type === 'ポイントGPS') counts.point++;
            }
        });

        // 件数表示を更新
        document.getElementById('importPointCount').textContent = `${counts.point}点`;
        document.getElementById('importRouteCount').textContent = `${counts.route}本`;
        document.getElementById('importSpotCount').textContent = `${counts.spot}個`;
        document.getElementById('importAreaCount').textContent = `${counts.area}件`;

        // 0件の場合はチェックをオフ、1件以上はオン
        document.getElementById('importPoint').checked = counts.point > 0;
        document.getElementById('importRoute').checked = counts.route > 0;
        document.getElementById('importSpot').checked = counts.spot > 0;
        document.getElementById('importArea').checked = counts.area > 0;

        // モーダルを表示
        const modal = document.getElementById('geoJsonImportModal');
        modal.style.display = 'flex';

        const confirmBtn = document.getElementById('importConfirmBtn');
        const cancelBtn = document.getElementById('importCancelBtn');

        const cleanup = () => {
            modal.style.display = 'none';
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
        };

        const onConfirm = () => {
            const selection = {
                point: document.getElementById('importPoint').checked,
                route: document.getElementById('importRoute').checked,
                spot: document.getElementById('importSpot').checked,
                area: document.getElementById('importArea').checked
            };
            cleanup();
            resolve(selection);
        };

        const onCancel = () => {
            cleanup();
            resolve(null);
        };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
    });
}

// GeoJSONファイルの読み込み
export function setupGeoJsonLoad(map, geoJsonLayer, markerMap, spotMarkerMap, areaLayerMap) {
    // ボタンではなく、隠しファイル入力要素のchangeイベントを監視
    // ラベルをクリックすると、関連付けられたinputが動作する
    document.getElementById('geoJsonInput').addEventListener('change', async function (e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        // 全ファイルのフィーチャーを収集
        const allFeatures = [];
        for (const file of files) {
            try {
                const text = await file.text();
                const json = JSON.parse(text);
                if (!json.features || !Array.isArray(json.features)) {
                    showMessage(`読み込みエラー (${file.name}): 有効なGeoJSONフォーマットではありません`, 'error');
                    continue;
                }
                allFeatures.push(...json.features);
            } catch (parseError) {
                showMessage(`読み込みエラー (${file.name}): ${parseError.message}`, 'error');
            }
        }
        if (allFeatures.length === 0) { this.value = ''; return; }

        try {
            // 読み込み種別選択モーダルを1回だけ表示（全ファイルの合計数）
            const selection = await showImportTypeModal(allFeatures);
            if (!selection) { this.value = ''; return; }

            // 選択に応じてフィーチャーをフィルタリング
            let features = allFeatures.filter(f => {
                if (!f.geometry) return false;
                const type = f.properties && f.properties.type;
                const geomType = f.geometry.type;
                if (geomType === 'LineString') return selection.route;
                if (geomType === 'Polygon' || geomType === 'MultiPolygon') return selection.area;
                if (geomType === 'Point') {
                    if (type === 'spot') return selection.spot;
                    if (type === 'route_waypoint') return selection.route;
                    if (type === 'point' || type === 'ポイントGPS') return selection.point;
                }
                return true;
            });

            // データ初期化 (追加モード)
            let data = initData();

            // 既存ポイントIDと重複するポイントを除外
            const existingPointIds = new Set(
                data.features
                    .filter(f => f.properties && f.properties.type === 'point' && f.properties.id != null)
                    .map(f => f.properties.id)
            );
            let skippedCount = 0;
            features = features.filter(f => {
                if (f.properties && f.properties.type === 'point' && f.properties.id != null) {
                    if (existingPointIds.has(f.properties.id)) {
                        skippedCount++;
                        return false;
                    }
                    existingPointIds.add(f.properties.id); // バッチ内重複も除外
                }
                return true;
            });

            data.features.push(...features);

            // マーカー/レイヤーの表示
            features.forEach(f => {
                if (!f.geometry || !f.geometry.coordinates) return;

                const props = f.properties || {};
                const type = props.type;

                // 1. ポイント (type="point") -> 赤色の丸型
                if (type === 'point' && f.geometry.type === 'Point') {
                    const lat = f.geometry.coordinates[1];
                    const lng = f.geometry.coordinates[0];
                    const style = DEFAULTS.FEATURE_STYLES['point'] || DEFAULTS.FEATURE_STYLES['ポイントGPS'];

                    const marker = L.circleMarker([lat, lng], style);

                    marker.bindPopup(`${props.id || props.pointId || ''}<br>ポイント(GPS変換済)`);

                    geoJsonLayer.addLayer(marker);
                }
                // 2. ルート (type="route") -> route_X_to_Y パターンはポリライン表示（変換処理でマーカー作成）
                //                           それ以外は全座標に菱形マーカー表示
                else if (type === 'route' && f.geometry.type === 'LineString') {
                    const coords = f.geometry.coordinates;
                    if (coords.length < 2) return;

                    const latLngs = coords.map(c => [c[1], c[0]]);
                    const routeId = props.id;
                    const isEditableRoute = routeId && /^route_(.+)_to_(.+)$/.test(routeId);

                    if (isEditableRoute) {
                        // 編集用ルート: ポリラインで参考表示（変換処理でポイントGPS/route_waypointマーカーを別途作成）
                        const line = L.polyline(latLngs, { color: '#f58220', weight: 2, opacity: 0.6 });
                        geoJsonLayer.addLayer(line);
                        // 背景ポリラインを routeLineMap に登録（waypoint削除時に再描画できるよう）
                        routeEditorState.routeLineMap.set(routeId, line);
                    } else {
                        // 非編集用ルート: 全ての座標に菱形マーカーを表示（従来動作）
                        latLngs.forEach((latLng) => {
                            const icon = L.divIcon({
                                className: 'custom-div-icon',
                                html: '<div class="marker-pin marker-diamond"></div>',
                                iconSize: [12, 12],
                                iconAnchor: [6, 6]
                            });

                            const marker = L.marker(latLng, { icon: icon });
                            geoJsonLayer.addLayer(marker);
                        });
                    }
                }
                // 3. スポット (type="spot") -> 青色の正方形
                else if (type === 'spot' && f.geometry.type === 'Point') {
                    const lat = f.geometry.coordinates[1];
                    const lng = f.geometry.coordinates[0];

                    // 正方形マーカー (CSSクラスを使用)
                    const icon = L.divIcon({
                        className: 'custom-div-icon',
                        html: '<div class="marker-pin marker-square"></div>',
                        iconSize: [12, 12],
                        iconAnchor: [6, 6]
                    });

                    const marker = L.marker([lat, lng], { icon: icon });

                    marker.bindPopup(`${props.name || 'スポット'}<br>スポット(GPS変換済)`);

                    // スポットモードでクリックしたときにドロップダウンと連動
                    marker.on('click', function(e) {
                        const currentMode = document.querySelector('input[name="mode"]:checked').value;
                        if (currentMode === MODES.SPOT) {
                            const spotIndex = allSpots.findIndex(spot => spot.feature === f);
                            if (spotIndex !== -1) {
                                document.getElementById('spotSelect').value = spotIndex;
                                highlightSpot(spotIndex, spotMarkerMap);
                            }
                        }
                    });

                    geoJsonLayer.addLayer(marker);

                    if (spotMarkerMap) {
                        spotMarkerMap.set(f, marker);
                    }

                    // markerMapにスポットを登録（ルート編集での開始・終了点ハイライト用）
                    if (markerMap) {
                        if (props.name) markerMap.set(props.name, marker);
                        if (props.id && props.id !== props.name) markerMap.set(props.id, marker);
                    }
                }
                // エリア (type="area") -> Polygon
                else if (type === 'area' && f.geometry.type === 'Polygon') {
                    const coords = f.geometry.coordinates;

                    if (coords.length > 0) {
                        // GeoJSON Polygon coordinates are [[[lng, lat], ...]] (nested arrays for rings)
                        const latLngs = coords.map(ring => ring.map(c => [c[1], c[0]]));

                        const areaStyle = DEFAULTS.FEATURE_STYLES['area'];
                        const polygonStyle = {
                            color: areaStyle.color,
                            fillColor: areaStyle.color,
                            fillOpacity: areaStyle.fillOpacity,
                            opacity: areaStyle.opacity,
                            weight: areaStyle.weight
                        };

                        const polygon = L.polygon(latLngs, polygonStyle);

                        polygon.bindPopup(`<b>${props.name || 'エリア'}</b>`);

                        // エリアモードでクリックしたときにドロップダウンと連動
                        polygon.on('click', function(e) {
                            const currentMode = document.querySelector('input[name="mode"]:checked').value;
                            if (currentMode === MODES.AREA) {
                                const index = allAreas.findIndex(a => a.feature === f);
                                if (index !== -1) {
                                    document.getElementById('areaSelect').value = index;
                                    highlightArea(index, areaLayerMap, map);
                                    L.DomEvent.stopPropagation(e);
                                }
                            }
                        });

                        geoJsonLayer.addLayer(polygon);
                        bindAreaLabel(f, polygon);

                        if (areaLayerMap) {
                            areaLayerMap.set(f, polygon);
                        }
                    }
                }
            });

            // route_waypoint マーカーを route_id でグループ化し waypoint_number 順にソートして markerMap に登録
            const routeWaypointGroups = new Map();
            features.forEach(f => {
                if (f.properties && f.properties.type === 'route_waypoint' &&
                    f.geometry && f.geometry.type === 'Point') {
                    const routeId = f.properties.route_id;
                    if (routeId) {
                        if (!routeWaypointGroups.has(routeId)) {
                            routeWaypointGroups.set(routeId, []);
                        }
                        routeWaypointGroups.get(routeId).push(f);
                    }
                }
            });

            routeWaypointGroups.forEach((waypoints, routeId) => {
                waypoints.sort((a, b) => {
                    const numA = parseInt(a.properties.waypoint_number) || 0;
                    const numB = parseInt(b.properties.waypoint_number) || 0;
                    return numA - numB;
                });

                const style = DEFAULTS.FEATURE_STYLES['route_waypoint'];
                const markers = [];

                waypoints.forEach(wp => {
                    const [lng, lat] = wp.geometry.coordinates;
                    const marker = L.marker([lat, lng], {
                        icon: L.divIcon({
                            className: 'diamond-marker',
                            html: `<div style="width: ${style.radius * 2}px; height: ${style.radius * 2}px; background-color: #f58220; transform: rotate(45deg); opacity: ${style.fillOpacity};"></div>`,
                            iconSize: [style.radius * 2, style.radius * 2],
                            iconAnchor: [style.radius, style.radius]
                        })
                    });
                    geoJsonLayer.addLayer(marker);
                    markers.push(marker);
                });

                if (markerMap) {
                    markerMap.set(routeId, markers);
                }
            });

            // type='route' LineString (route_X_to_Y パターン) を MapEditor内部形式に変換
            // ポイントGPS + route_waypoint を自動生成してルート編集を可能にする
            features.forEach(f => {
                if (!f.properties || !f.geometry || f.geometry.type !== 'LineString') return;
                if (f.properties.type !== 'route') return;

                const routeId = f.properties.id;
                if (!routeId) return;

                const match = routeId.match(/^route_(.+)_to_(.+)$/);
                if (!match) return;

                // 既に route_waypoint が存在する場合はスキップ（重複防止）
                const alreadyHasWaypoints = data.features.some(feat =>
                    feat.properties && feat.properties.route_id === routeId && feat.properties.type === 'route_waypoint'
                );
                if (alreadyHasWaypoints) return;

                const coords = f.geometry.coordinates;
                if (coords.length < 2) return;

                const wpStyle = DEFAULTS.FEATURE_STYLES['route_waypoint'];

                // 全座標を中間点(route_waypoint)として登録
                // 開始・終了ポイントはLineStringに含まれず、別途ポイントGPSフィーチャーとして存在する
                const waypointMarkers = [];

                coords.forEach((coord, index) => {
                    const [wLng, wLat] = coord;
                    const wpFeature = {
                        type: 'Feature',
                        properties: {
                            type: 'route_waypoint',
                            route_id: routeId,
                            waypoint_number: (index + 1).toString()
                        },
                        geometry: { type: 'Point', coordinates: [wLng, wLat] }
                    };
                    data.features.push(wpFeature);

                    const marker = L.marker([wLat, wLng], {
                        icon: L.divIcon({
                            className: 'diamond-marker',
                            html: `<div style="width: ${wpStyle.radius * 2}px; height: ${wpStyle.radius * 2}px; background-color: #f58220; transform: rotate(45deg); opacity: ${wpStyle.fillOpacity};"></div>`,
                            iconSize: [wpStyle.radius * 2, wpStyle.radius * 2],
                            iconAnchor: [wpStyle.radius, wpStyle.radius]
                        })
                    });
                    geoJsonLayer.addLayer(marker);
                    waypointMarkers.push(marker);
                });

                if (markerMap && waypointMarkers.length > 0) {
                    markerMap.set(routeId, waypointMarkers);
                }
            });

            // ルート編集ドロップダウンを更新（GeoJSON読み込み後に選択可能にする）
            extractPointsAndRoutes(data);
            updateDropdowns(data);
            initAllRouteLines(data, geoJsonLayer);

            // スポット編集ドロップダウンを更新
            extractSpots(data);
            updateSpotDropdown();

            // エリア編集ドロップダウンを更新
            extractAreas(data);
            updateAreaDropdown();

            // 統計情報を更新
            loadedFileCount++;
            updateFileCount();
            updateStats(data);
            const msg = skippedCount > 0
                ? `${features.length}件のデータを読み込みました（${skippedCount}件の重複ポイントをスキップ）`
                : `${features.length}件のデータを読み込みました`;
            showMessage(msg, 'success');

        } catch (error) {
            console.error('GeoJSON load error:', error);
            showMessage(`読み込みエラー: ${error.message}`, 'error');
        }

        this.value = '';
    });
}

// 距離計算ヘルパー (メートル単位近似値)
function calculateTotalDistance(latLngs) {
    let total = 0;
    for (let i = 0; i < latLngs.length - 1; i++) {
        total += L.latLng(latLngs[i]).distanceTo(L.latLng(latLngs[i + 1]));
    }
    return total;
}

// 距離地点計算ヘルパー
function calculatePointAtDistance(latLngs, targetDistance) {
    let covered = 0;
    for (let i = 0; i < latLngs.length - 1; i++) {
        const p1 = L.latLng(latLngs[i]);
        const p2 = L.latLng(latLngs[i + 1]);
        const dist = p1.distanceTo(p2);

        if (covered + dist >= targetDistance) {
            // このセグメント内に中間点がある
            const ratio = (targetDistance - covered) / dist;
            const lat = p1.lat + (p2.lat - p1.lat) * ratio;
            const lng = p1.lng + (p2.lng - p1.lng) * ratio;
            return [lat, lng];
        }
        covered += dist;
    }
    // 端数誤差などで見つからない場合は最後の点
    return latLngs[latLngs.length - 1];
}

// GeoJSONファイルの出力
export function setupFileExport() {
    document.getElementById('exportBtn').addEventListener('click', async function () {
        if (!loadedDataInternal) {
            showMessage('出力するデータがありません。先にデータを読み込んでください。', 'warning');
            return;
        }

        const pointCount = parseInt(document.getElementById('pointCount').value) || 0;
        const routeCount = parseInt(document.getElementById('routeCount').value) || 0;
        const spotCount = parseInt(document.getElementById('spotCount').value) || 0;

        // type="route" の LineString は route_waypoint Point に変換済みのため除外
        const exportData = {
            ...loadedDataInternal,
            features: loadedDataInternal.features.filter(f =>
                !(f.properties && f.properties.type === 'route' &&
                  f.geometry && f.geometry.type === 'LineString')
            )
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const filename = `MapGPS-${getDateString()}_P${pointCount}_R${routeCount}_S${spotCount}.geojson`;

        if ('showSaveFilePicker' in window) {
            try {
                const options = {
                    suggestedName: filename,
                    types: [{
                        description: 'GeoJSON Files',
                        accept: { 'application/json': ['.geojson', '.json'] }
                    }]
                };

                const handle = await window.showSaveFilePicker(options);
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();

                showMessage('GeoJSONファイルを出力しました');
                return;
            } catch (err) {
                if (err.name === 'AbortError') {
                    return;
                }
                console.warn('File System Access API使用失敗、フォールバック:', err);
            }
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showMessage('GeoJSONファイルを出力しました');
    });
}
