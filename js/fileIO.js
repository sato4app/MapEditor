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

export { loadedDataInternal as loadedData };

// GeoJSONファイルの読み込み (廃止 -> Excel読み込みへ変更)
export function setupFileInput(map, geoJsonLayer, markerMap, spotMarkerMap) {
    document.getElementById('fileInput').addEventListener('change', async function (e) {
        const file = e.target.files[0];
        if (file) {
            // Excelファイルの読み込み処理（未実装）
            showMessage('ポイントGPS(Excel)の読み込み機能は現在実装中です', 'warning');

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
