// ファイル入出力機能

import { DEFAULTS, MODES } from './constants.js';
import { showMessage } from './message.js';
import { updateStats, getDateString, getDateIso, getDateTimeIso } from './stats.js';
import { extractPointsAndRoutes, updateDropdowns, initAllRouteLines, state as routeEditorState } from './routeEditor.js';
import { extractSpots, updateSpotDropdown, highlightSpot, allSpots, isExtractDuplicateMode } from './spotEditor.js';
import { extractAreas, updateAreaDropdown, highlightArea, allAreas, bindAreaLabel } from './areaEditor.js';
import { extractClosures, updateClosureDropdown, createClosureMarker, nextClosureId } from './closureEditor.js';

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
                        description: p.description
                    },
                    geometry: {
                        type: "Point",
                        coordinates: p.elevation != null ? [p.lng, p.lat, p.elevation] : [p.lng, p.lat]
                    }
                }));

                // 既存データに追加（同IDのポイントGPSがあればExcelを優先して入れ替え）
                let replacedCount = 0;
                newFeatures.forEach(f => {
                    const id = f.properties.id;

                    // 同じIDの既存ポイントGPSを除去
                    const existingIndex = data.features.findIndex(
                        ef => ef.properties && ef.properties.type === 'ポイントGPS' && ef.properties.id === id
                    );
                    if (existingIndex !== -1) {
                        data.features.splice(existingIndex, 1);
                        const oldMarker = markerMap && markerMap.get(id);
                        if (oldMarker && geoJsonLayer) {
                            geoJsonLayer.removeLayer(oldMarker);
                        }
                        if (markerMap) markerMap.delete(id);
                        replacedCount++;
                    }

                    data.features.push(f);

                    const lat = f.geometry.coordinates[1];
                    const lng = f.geometry.coordinates[0];
                    const style = DEFAULTS.FEATURE_STYLES['ポイントGPS'];
                    const marker = L.circleMarker([lat, lng], style);
                    const popupContent = `${f.properties.id}<br>${f.properties.name}<br>(PointGPS)`;
                    marker.bindPopup(popupContent);
                    geoJsonLayer.addLayer(marker);
                    if (id && markerMap) {
                        markerMap.set(id, marker);
                    }
                });

                // 統計情報を更新
                loadedFileCount++;
                updateFileCount();
                updateStats(data);

                const addedCount = newFeatures.length - replacedCount;
                const msg = replacedCount > 0
                    ? `${newFeatures.length}件のポイントGPSを読み込みました（${replacedCount}件をExcelで上書き、${addedCount}件を新規追加）`
                    : `${newFeatures.length}件のポイントGPSを読み込みました`;
                showMessage(msg, 'success');

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
            const existingGpsIds = new Set(
                data.features
                    .filter(f => f.properties && f.properties.type === 'ポイントGPS' && f.properties.id != null)
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
                if (f.properties && f.properties.type === 'ポイントGPS' && f.properties.id != null) {
                    if (existingGpsIds.has(f.properties.id)) {
                        skippedCount++;
                        return false;
                    }
                    existingGpsIds.add(f.properties.id); // バッチ内重複も除外
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

                    marker.bindPopup(`${props.id || props.pointId || ''}<br>(Point)`);

                    geoJsonLayer.addLayer(marker);
                }
                // 1b. ポイントGPS (type="ポイントGPS") -> circleMarker + markerMap登録
                else if (type === 'ポイントGPS' && f.geometry.type === 'Point') {
                    const lat = f.geometry.coordinates[1];
                    const lng = f.geometry.coordinates[0];
                    const style = DEFAULTS.FEATURE_STYLES['ポイントGPS'];

                    const marker = L.circleMarker([lat, lng], style);

                    const popupContent = `${props.id || ''}<br>${props.name || ''}<br>(PointGPS)`;
                    marker.bindPopup(popupContent);

                    geoJsonLayer.addLayer(marker);

                    if (props.id && markerMap) {
                        markerMap.set(props.id, marker);
                    }
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

                    // 正方形マーカー (CSSクラスを使用, 10x10px)
                    const icon = L.divIcon({
                        className: 'custom-div-icon',
                        html: '<div class="marker-pin marker-square" style="width: 10px; height: 10px;"></div>',
                        iconSize: [10, 10],
                        iconAnchor: [5, 5]
                    });

                    const marker = L.marker([lat, lng], { icon: icon });

                    marker.bindPopup(`${props.name || 'スポット'}<br>(Spot)`);

                    // スポットモードでクリックしたときにドロップダウンと連動
                    marker.on('click', function(e) {
                        // 重複スポット抽出モード中はドロップダウン選択を行わない(削除ハンドラに委ねる)
                        if (isExtractDuplicateMode) return;
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
                    const [wLng, wLat, wEle] = coord;
                    const wpCoords = wEle !== undefined ? [wLng, wLat, wEle] : [wLng, wLat];
                    const wpFeature = {
                        type: 'Feature',
                        properties: {
                            type: 'route_waypoint',
                            route_id: routeId,
                            waypoint_number: (index + 1).toString()
                        },
                        geometry: { type: 'Point', coordinates: wpCoords }
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

// 座標値を小数点以下5桁に丸める（経度・緯度・標高を含む。ネスト構造に再帰対応）
function roundCoord(value) {
    if (typeof value === 'number') {
        return Math.round(value * 100000) / 100000;
    }
    if (Array.isArray(value)) {
        return value.map(roundCoord);
    }
    return value;
}

// ジオメトリ座標（およびルートのGPS座標プロパティ）を丸めた新しいFeatureを返す
// 元のFeature/内部データは変更しない（読み込んだ精度はメモリ上では維持）
function withRoundedGeometry(feature) {
    if (!feature || !feature.geometry || !feature.geometry.coordinates) {
        return feature;
    }

    const rounded = {
        ...feature,
        geometry: {
            ...feature.geometry,
            coordinates: roundCoord(feature.geometry.coordinates)
        }
    };

    const props = feature.properties;
    if (props && (props.startPointGPS || props.endPointGPS)) {
        rounded.properties = {
            ...props,
            startPointGPS: props.startPointGPS ? roundCoord(props.startPointGPS) : props.startPointGPS,
            endPointGPS: props.endPointGPS ? roundCoord(props.endPointGPS) : props.endPointGPS
        };
    }

    return rounded;
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

        // route_waypoint Point をルートIDでグループ化し、ルートLineStringを生成
        const waypointsByRoute = {};
        loadedDataInternal.features
            .filter(f => f.properties && f.properties.type === 'route_waypoint'
                      && f.geometry && f.geometry.type === 'Point')
            .forEach(f => {
                const routeId = f.properties.route_id;
                if (!waypointsByRoute[routeId]) waypointsByRoute[routeId] = [];
                waypointsByRoute[routeId].push(f);
            });

        // ID から現在座標を解決（[4.2.3 ID 解決順序] に準拠）
        // refLngLat: 同名スポット複数時に近傍探索の基準とする相手端点座標（[lng, lat]）
        const features = loadedDataInternal.features;
        function resolveCoordsById(id, refLngLat) {
            if (!id) return null;
            const gps = features.find(f =>
                f.properties && f.properties.type === 'ポイントGPS' &&
                (f.properties.id === id || f.properties.pointId === id) &&
                f.geometry && f.geometry.type === 'Point'
            );
            if (gps) return gps.geometry.coordinates;

            const pt = features.find(f =>
                f.properties && f.properties.type === 'point' &&
                f.properties.id === id &&
                f.geometry && f.geometry.type === 'Point'
            );
            if (pt) return pt.geometry.coordinates;

            const spots = features.filter(f =>
                f.properties && f.properties.type === 'spot' &&
                (f.properties.id === id || f.properties.name === id) &&
                f.geometry && f.geometry.type === 'Point'
            );
            if (spots.length === 1) return spots[0].geometry.coordinates;
            if (spots.length > 1 && refLngLat) {
                const [refLng, refLat] = refLngLat;
                let nearest = null;
                let minDist = Infinity;
                spots.forEach(s => {
                    const [lng, lat] = s.geometry.coordinates;
                    const d = (lat - refLat) ** 2 + (lng - refLng) ** 2;
                    if (d < minDist) { minDist = d; nearest = s; }
                });
                if (nearest) return nearest.geometry.coordinates;
            }
            if (spots.length > 0) return spots[0].geometry.coordinates;
            return null;
        }

        const routeLineFeatures = Object.entries(waypointsByRoute).map(([routeId, waypoints]) => {
            waypoints.sort((a, b) =>
                parseInt(a.properties.waypoint_number) - parseInt(b.properties.waypoint_number)
            );
            const coordinates = waypoints.map(wp => wp.geometry.coordinates);
            const match = routeId.match(/^route_(.+)_to_(.+)$/);
            const startPoint = match ? match[1] : '';
            const endPoint = match ? match[2] : '';

            // 同名スポット解決のため、まず曖昧でない側を引き、その座標を相手側の参照に使う
            let endCoords = resolveCoordsById(endPoint, null);
            const startCoords = resolveCoordsById(startPoint, endCoords ? [endCoords[0], endCoords[1]] : null);
            if (startCoords) {
                endCoords = resolveCoordsById(endPoint, [startCoords[0], startCoords[1]]);
            }

            return {
                type: 'Feature',
                properties: {
                    type: 'route',
                    id: routeId,
                    startPoint,
                    endPoint,
                    startPointGPS: startCoords || null,
                    endPointGPS: endCoords || null
                },
                geometry: { type: 'LineString', coordinates }
            };
        });

        // 個別route_waypoint PointとLineString routeを除外し、生成したLineStringを追加
        // 出力時は座標（経度・緯度・標高）を小数点以下5桁に丸める
        const exportData = {
            ...loadedDataInternal,
            features: [
                ...loadedDataInternal.features.filter(f =>
                    !(f.properties && (
                        (f.properties.type === 'route_waypoint' && f.geometry && f.geometry.type === 'Point') ||
                        (f.properties.type === 'route' && f.geometry && f.geometry.type === 'LineString')
                    ))
                ),
                ...routeLineFeatures
            ].map(withRoundedGeometry)
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const filename = `MapGPS-${getDateString()}_P${pointCount}_R${routeCount}_S${spotCount}.geojson`;

        const saved = await saveBlobAsFile(blob, filename);
        if (saved) {
            showMessage('GeoJSONファイルを出力しました');
        }
    });
}

// BlobをGeoJSONファイルとして保存（File System Access API、未対応時はダウンロードにフォールバック）
// 戻り値: 保存した場合はtrue、ユーザーがキャンセルした場合はfalse
async function saveBlobAsFile(blob, filename) {
    if ('showSaveFilePicker' in window) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{
                    description: 'GeoJSON Files',
                    accept: { 'application/json': ['.geojson', '.json'] }
                }]
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return true;
        } catch (err) {
            if (err.name === 'AbortError') {
                return false;
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
    return true;
}

// closureフィーチャーのプロパティを正規化（読み込み時）
// idが無ければ採番、kind/statusが無ければ既定値を補う
function normalizeImportedClosure(feature, existingIds) {
    const props = feature.properties || (feature.properties = {});
    props.type = 'closure';

    if (!props.id) {
        props.id = nextClosureId(existingIds);
    }
    if (props.kind !== 'closed' && props.kind !== 'difficult') {
        props.kind = 'closed';
    }
    if (props.status !== 'draft' && props.status !== 'published') {
        props.status = 'draft';
    }
    return feature;
}

// 通行止め・通行困難場所のファイル読み込み（GeoJSONからclosureのみを抽出）
export function setupClosureFileLoad(map, geoJsonLayer, closureMarkerMap) {
    document.getElementById('closureFileInput').addEventListener('change', async function (e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        let addedCount = 0;
        let skippedCount = 0;
        try {
            const data = initData();

            // 既存のclosure IDを収集（ID重複の検出・新規採番に使用）
            const existingIds = new Set(
                data.features
                    .filter(f => f.properties && f.properties.type === 'closure' && f.properties.id)
                    .map(f => f.properties.id)
            );

            for (const file of files) {
                let json;
                try {
                    const text = await file.text();
                    json = JSON.parse(text);
                } catch (parseError) {
                    showMessage(`読み込みエラー (${file.name}): ${parseError.message}`, 'error');
                    continue;
                }

                if (!json.features || !Array.isArray(json.features)) {
                    showMessage(`読み込みエラー (${file.name}): 有効なGeoJSONフォーマットではありません`, 'error');
                    continue;
                }

                json.features.forEach(f => {
                    if (!(f.properties && f.properties.type === 'closure' &&
                          f.geometry && f.geometry.type === 'Point')) {
                        return;
                    }

                    // 既存IDと重複する地点はスキップ（IDは全地点で一意）
                    if (f.properties.id && existingIds.has(f.properties.id)) {
                        skippedCount++;
                        return;
                    }

                    normalizeImportedClosure(f, existingIds);
                    existingIds.add(f.properties.id);

                    data.features.push(f);
                    createClosureMarker(f, closureMarkerMap, geoJsonLayer);
                    addedCount++;
                });
            }

            // ドロップダウン・件数・統計を更新
            extractClosures(data);
            updateClosureDropdown();
            updateStats(data);

            if (addedCount > 0) {
                loadedFileCount++;
                updateFileCount();
                const msg = skippedCount > 0
                    ? `${addedCount}件の通行止め・通行困難場所を読み込みました（${skippedCount}件のID重複をスキップ）`
                    : `${addedCount}件の通行止め・通行困難場所を読み込みました`;
                showMessage(msg, 'success');
            } else if (skippedCount > 0) {
                showMessage(`${skippedCount}件すべてがID重複のためスキップされました`, 'warning');
            } else {
                showMessage('通行止め・通行困難場所のデータが見つかりませんでした', 'warning');
            }
        } catch (error) {
            console.error('Closure load error:', error);
            showMessage(`読み込みエラー: ${error.message}`, 'error');
        } finally {
            this.value = '';
        }
    });
}

// closureフィーチャーをスキーマ準拠のプロパティ順に整形（出力時）
function buildClosureExportFeature(feature) {
    const p = feature.properties || {};
    const props = {
        type: 'closure',
        id: p.id || '',
        name: p.name || '',
        kind: (p.kind === 'difficult') ? 'difficult' : 'closed'
    };
    if (p.reason) props.reason = p.reason;
    props.status = (p.status === 'published') ? 'published' : 'draft';
    if (p.note) props.note = p.note;
    if (p.relatedRoute) props.relatedRoute = p.relatedRoute;
    props.updatedAt = p.updatedAt || getDateIso();

    // 座標（経度・緯度・標高）を小数点以下5桁に丸める
    const geometry = (feature.geometry && feature.geometry.coordinates)
        ? { ...feature.geometry, coordinates: roundCoord(feature.geometry.coordinates) }
        : feature.geometry;

    return {
        type: 'Feature',
        properties: props,
        geometry: geometry
    };
}

// 通行止め・通行困難場所のファイル出力（closureのみをGeoJSONスキーマとして出力）
export function setupClosureFileExport() {
    document.getElementById('exportClosureBtn').addEventListener('click', async function () {
        if (!loadedDataInternal || !loadedDataInternal.features) {
            showMessage('出力するデータがありません。', 'warning');
            return;
        }

        const closureFeatures = loadedDataInternal.features.filter(f =>
            f.properties && f.properties.type === 'closure' &&
            f.geometry && f.geometry.type === 'Point'
        );

        if (closureFeatures.length === 0) {
            showMessage('出力する通行止め・通行困難場所がありません。', 'warning');
            return;
        }

        const exportData = {
            type: 'FeatureCollection',
            updatedAt: getDateTimeIso(),
            features: closureFeatures.map(buildClosureExportFeature)
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const filename = `Closure-${getDateString()}_N${closureFeatures.length}.geojson`;

        const saved = await saveBlobAsFile(blob, filename);
        if (saved) {
            showMessage('通行止め・通行困難場所を出力しました');
        }
    });
}
