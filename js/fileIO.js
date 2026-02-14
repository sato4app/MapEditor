// ファイル入出力機能

import { DEFAULTS, MODES } from './constants.js';
import { showMessage } from './message.js';
import { updateStats, getDateString } from './stats.js';
import { extractPointsAndRoutes, updateDropdowns } from './routeEditor.js';
import { extractSpots, updateSpotDropdown } from './spotEditor.js';

// ファイル入出力の状態管理
let loadedDataInternal = null;
let lastLoadedFileHandle = null;

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
                    let popupContent = `<b>${f.properties.name}</b>`;
                    if (f.properties.description) {
                        popupContent += `<br>${f.properties.description}`;
                    }
                    if (f.properties.elevation) {
                        popupContent += `<br>標高: ${f.properties.elevation}m`;
                    }
                    marker.bindPopup(popupContent);

                    geoJsonLayer.addLayer(marker);
                });

                // 統計情報を更新
                updateStats(data);

                showMessage(`${newFeatures.length}件のポイントGPSを読み込みました`, 'success');

                // 地図の範囲を調整（オプション）
                if (newFeatures.length > 0) {
                    // 簡易的に最後のポイントに移動
                    const lastPoint = newFeatures[newFeatures.length - 1];
                    map.panTo([lastPoint.geometry.coordinates[1], lastPoint.geometry.coordinates[0]]);
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

// GeoJSONファイルの読み込み
export function setupGeoJsonLoad(map, geoJsonLayer, markerMap, spotMarkerMap, areaLayerMap) {
    // ボタンではなく、隠しファイル入力要素のchangeイベントを監視
    // ラベルをクリックすると、関連付けられたinputが動作する
    document.getElementById('geoJsonInput').addEventListener('change', async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const json = JSON.parse(text);

            if (!json.features || !Array.isArray(json.features)) {
                throw new Error('有効なGeoJSONフォーマットではありません');
            }

            const features = json.features;

            // データ初期化 (追加モード)
            let data = initData();

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

                    let popupContent = `<b>${props.name || '名称未設定'}</b>`;
                    if (props.description) popupContent += `<br>${props.description}`;
                    marker.bindPopup(popupContent);

                    geoJsonLayer.addLayer(marker);
                }
                // 2. ルート (type="route") -> 中間点にオレンジ色の菱形 (線は描画しない)
                else if (type === 'route' && f.geometry.type === 'LineString') {
                    const coords = f.geometry.coordinates;
                    if (coords.length < 2) return;

                    // Leaflet用に [lat, lng] の配列に変換
                    const latLngs = coords.map(c => [c[1], c[0]]);

                    // 中間点の計算
                    const totalDistance = calculateTotalDistance(latLngs);
                    const midpoint = calculatePointAtDistance(latLngs, totalDistance / 2);

                    if (midpoint) {
                        // 菱形マーカー (CSSクラスを使用)
                        const icon = L.divIcon({
                            className: 'custom-div-icon',
                            html: '<div class="marker-pin marker-diamond"></div>',
                            iconSize: [12, 12],
                            iconAnchor: [6, 6]
                        });

                        const marker = L.marker(midpoint, { icon: icon });

                        let popupContent = `<b>${props.name || 'ルート'}</b>`;
                        if (props.description) popupContent += `<br>${props.description}`;
                        marker.bindPopup(popupContent);

                        geoJsonLayer.addLayer(marker);
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

                    let popupContent = `<b>${props.name || 'スポット'}</b>`;
                    if (props.description) popupContent += `<br>${props.description}`;
                    marker.bindPopup(popupContent);

                    geoJsonLayer.addLayer(marker);

                    if (spotMarkerMap) {
                        spotMarkerMap.set(f, marker);
                    }
                }
                // エリア (type="area") -> Polygon (ピンク色のポリゴン)
                else if (type === 'area' && f.geometry.type === 'Polygon') {
                    const coords = f.geometry.coordinates;

                    if (coords.length > 0) {
                        // GeoJSON Polygon coordinates are [[[lng, lat], ...]] (nested arrays for rings)
                        const latLngs = coords.map(ring => ring.map(c => [c[1], c[0]]));

                        const style = {
                            color: 'pink',
                            fillColor: 'pink',
                            fillOpacity: 0.5,
                            weight: 2
                        };

                        const polygon = L.polygon(latLngs, style);

                        let popupContent = `<b>${props.name || 'エリア'}</b>`;
                        if (props.description) popupContent += `<br>${props.description}`;
                        polygon.bindPopup(popupContent);

                        geoJsonLayer.addLayer(polygon);

                        if (areaLayerMap) {
                            areaLayerMap.set(f, polygon);
                        }
                    }
                }
            });

            // 統計情報を更新
            updateStats(data);
            showMessage(`${features.length}件のデータを読み込みました`, 'success');

        } catch (error) {
            console.error('GeoJSON load error:', error);
            showMessage(`読み込みエラー: ${error.message}`, 'error');
        } finally {
            this.value = '';
        }
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

        const dataStr = JSON.stringify(loadedDataInternal, null, 2);
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
