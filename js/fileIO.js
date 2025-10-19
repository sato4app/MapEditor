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

// GeoJSONファイルの読み込み
export function setupFileInput(map, geoJsonLayer, markerMap, spotMarkerMap) {
    document.getElementById('fileInput').addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (file) {
            try {
                if ('showOpenFilePicker' in window && file.handle) {
                    lastLoadedFileHandle = file.handle;
                }
            } catch (err) {
                // File System Access APIが使えない場合は無視
            }

            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const geoJsonData = JSON.parse(e.target.result);

                    geoJsonLayer.clearLayers();
                    markerMap.clear();
                    spotMarkerMap.clear();

                    L.geoJSON(geoJsonData, {
                        filter: function(feature) {
                            // route_waypointは後で個別に描画するため、ここではフィルタリング
                            const featureType = feature.properties && feature.properties.type;
                            return featureType !== 'route_waypoint';
                        },
                        style: function(feature) {
                            const type = feature && feature.geometry && feature.geometry.type;
                            if (type === 'LineString' || type === 'MultiLineString' || type === 'Polygon' || type === 'MultiPolygon') {
                                return DEFAULTS.LINE_STYLE;
                            }
                            return undefined;
                        },
                        pointToLayer: function(feature, latlng) {
                            const featureType = feature.properties && feature.properties.type;

                            const style = DEFAULTS.FEATURE_STYLES[featureType] || DEFAULTS.POINT_STYLE;

                            let marker;
                            if (style.shape === 'diamond') {
                                marker = L.marker(latlng, {
                                    icon: L.divIcon({
                                        className: 'diamond-marker',
                                        html: `<div style="width: ${style.radius * 2}px; height: ${style.radius * 2}px; background-color: ${style.fillColor}; transform: rotate(45deg); opacity: ${style.fillOpacity};"></div>`,
                                        iconSize: [style.radius * 2, style.radius * 2],
                                        iconAnchor: [style.radius, style.radius]
                                    })
                                });
                            } else if (style.shape === 'square') {
                                marker = L.marker(latlng, {
                                    icon: L.divIcon({
                                        className: 'square-marker',
                                        html: `<div style="width: ${style.radius}px; height: ${style.radius}px; background-color: ${style.fillColor}; opacity: ${style.fillOpacity};"></div>`,
                                        iconSize: [style.radius, style.radius],
                                        iconAnchor: [style.radius / 2, style.radius / 2]
                                    })
                                });
                            } else {
                                marker = L.circleMarker(latlng, style);
                            }

                            if (featureType === 'ポイントGPS' && feature.properties && feature.properties.id) {
                                markerMap.set(feature.properties.id, marker);
                            }

                            return marker;
                        },
                        onEachFeature: function(feature, layer) {
                            const featureType = feature.properties && feature.properties.type;
                            const geometryType = feature.geometry && feature.geometry.type;

                            if (featureType === 'ポイントGPS' && feature.properties && feature.properties.id) {
                                layer.bindPopup(feature.properties.id);
                            } else if (feature.properties && feature.properties.name) {
                                layer.bindPopup(feature.properties.name);
                            }

                            if ((geometryType === 'Polygon' || geometryType === 'MultiPolygon') ||
                                (geometryType === 'Point' && featureType === 'spot')) {

                                spotMarkerMap.set(feature, layer);

                                layer.on('click', async function(e) {
                                    const currentMode = document.querySelector('input[name="mode"]:checked').value;
                                    if (currentMode === MODES.SPOT) {
                                        const { allSpots, highlightSpot } = await import('./spotEditor.js');
                                        const spotIndex = allSpots.findIndex(spot => spot.feature === feature);
                                        if (spotIndex !== -1) {
                                            document.getElementById('spotSelect').value = spotIndex;
                                            highlightSpot(spotIndex, spotMarkerMap);
                                        }
                                    }
                                });
                            }
                        }
                    }).addTo(geoJsonLayer);

                    loadedDataInternal = geoJsonData;
                    updateStats(geoJsonData);
                    extractPointsAndRoutes(geoJsonData);
                    updateDropdowns(geoJsonData);
                    extractSpots(geoJsonData);
                    updateSpotDropdown();

                    // 全ルートの中間点マーカーを作成
                    const { state, redrawWaypointMarkers } = await import('./routeEditor.js');
                    state.allRoutes.forEach(route => {
                        redrawWaypointMarkers(route.routeId, geoJsonData, markerMap, geoJsonLayer);
                    });

                    const group = new L.featureGroup();
                    geoJsonLayer.eachLayer(layer => group.addLayer(layer));
                    if (group.getBounds().isValid()) {
                        map.fitBounds(group.getBounds(), {padding: [10, 10]});
                    }

                    geoJsonLayer.eachLayer(layer => {
                        if (layer.feature && layer.feature.properties && layer.feature.properties.type === 'ポイントGPS') {
                            layer.openPopup();
                        }
                    });

                    showMessage('GeoJSONファイルを読み込みました');
                } catch (error) {
                    showMessage('ファイルの読み込みに失敗しました: ' + error.message, 'error');
                }
            };

            reader.readAsText(file);
        }
    });
}

// GeoJSONファイルの出力
export function setupFileExport() {
    document.getElementById('exportBtn').addEventListener('click', async function() {
        if (!loadedDataInternal) {
            showMessage('出力するデータがありません。先にGeoJSONファイルを読み込んでください。', 'warning');
            return;
        }

        const pointCount = parseInt(document.getElementById('pointCount').value) || 0;
        const routeCount = parseInt(document.getElementById('routeCount').value) || 0;
        const spotCount = parseInt(document.getElementById('spotCount').value) || 0;

        const dataStr = JSON.stringify(loadedDataInternal, null, 2);
        const blob = new Blob([dataStr], {type: 'application/json'});
        const filename = `MapGPS-${getDateString()}_P${pointCount}_R${routeCount}_S${spotCount}.geojson`;

        if ('showSaveFilePicker' in window) {
            try {
                const options = {
                    suggestedName: filename,
                    types: [{
                        description: 'GeoJSON Files',
                        accept: {'application/json': ['.geojson', '.json']}
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
