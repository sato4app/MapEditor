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

// データベースの読み込み
export function setupDatabaseLoad(map, geoJsonLayer, markerMap, spotMarkerMap) {
    const btn = document.getElementById('loadDbBtn');
    if (btn) {
        btn.addEventListener('click', function () {
            // データベース読み込み処理（未実装）
            showMessage('データベースの読み込み機能は現在実装中です', 'warning');
        });
    }
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
