// 地図のコア機能

import { DEFAULTS } from './constants.js';

// 地図とレイヤーの初期化
export function initializeMap() {
    const map = L.map('map').setView(DEFAULTS.MAP_CENTER, DEFAULTS.MAP_ZOOM);

    L.tileLayer(DEFAULTS.GSI_TILE_URL, {
        attribution: DEFAULTS.GSI_ATTRIBUTION,
        maxZoom: DEFAULTS.MAP_MAX_ZOOM
    }).addTo(map);

    L.control.scale({
        position: 'bottomright',
        metric: true,
        imperial: false
    }).addTo(map);

    const CustomZoomControl = L.Control.extend({
        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');

            const zoomInBtn = L.DomUtil.create('a', 'zoom-in-btn', container);
            zoomInBtn.innerHTML = '＋';
            zoomInBtn.href = '#';
            zoomInBtn.title = 'ズームイン';

            const zoomOutBtn = L.DomUtil.create('a', 'zoom-out-btn', container);
            zoomOutBtn.innerHTML = '－';
            zoomOutBtn.href = '#';
            zoomOutBtn.title = 'ズームアウト';

            L.DomEvent.on(zoomInBtn, 'click', function(e) {
                L.DomEvent.preventDefault(e);
                map.zoomIn();
            });

            L.DomEvent.on(zoomOutBtn, 'click', function(e) {
                L.DomEvent.preventDefault(e);
                map.zoomOut();
            });
            return container;
        },

        onRemove: function(map) {
            // クリーンアップは特に必要なし
        }
    });

    map.removeControl(map.zoomControl);
    new CustomZoomControl({ position: 'bottomright' }).addTo(map);
    new CustomZoomControl({ position: 'topleft' }).addTo(map);

    const geoJsonLayer = L.layerGroup().addTo(map);
    const markerMap = new Map();
    const spotMarkerMap = new Map();

    return { map, geoJsonLayer, markerMap, spotMarkerMap };
}
