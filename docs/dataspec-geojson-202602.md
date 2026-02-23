# GeoReferencer データ仕様書 (GeoJSON)

## 1. 概要
本ドキュメントは、GeoReferencer (v2.0) からエクスポートされるGeoJSONファイルのフォーマット仕様を定義します。
このファイルには、ジオリファレンス（アフィン変換）によって画像座標からGPS座標（緯度・経度）に変換されたデータが含まれます。

## 2. 共通仕様
- **フォーマット**: GeoJSON (RFC 7946)
- **タイプ**: FeatureCollection
- **座標系**: WGS84 (EPSG:4326)
  - 座標順序: [経度, 緯度, 標高(ない場合は省略)]

## 3. Feature構成

エクスポートされるFeatureCollectionには、以下の4種類のFeatureが含まれる可能性があります。

### 3.1 ポイント (Point)
ジオリファレンスに使用された基準点。

- **Geometry Type**: `Point`
- **Properties**:
  - `id`: ポイントID
  - `name`: ポイント名称
  - `type`: `"point"` (固定)
  - `source`: `"image_transformed"` (固定)
  - `description`: `"画像ポイント（GPS変換済）"`

```json
{
  "type": "Feature",
  "properties": {
    "id": "A-01",
    "name": "登山口",
    "type": "point",
    "source": "image_transformed",
    "description": "画像ポイント（GPS変換済）"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [139.123456, 35.654321, 150.5]
  }
}
```

### 3.2 ルート (Route)
画像上のルートを変換したもの。

- **Geometry Type**: `LineString`
- **Properties**:
  - `id`: ルートID (例: `route_[start]_[end]` またはルート名)
  - `name`: ルート名称
  - `type`: `"route"` (固定)
  - `source`: `"image_transformed"` (固定)
  - `description`: `"ルート（GPS変換済）"`

```json
{
  "type": "Feature",
  "properties": {
    "id": "route_start_to_end",
    "name": "表参道ルート",
    "type": "route",
    "source": "image_transformed",
    "description": "ルート（GPS変換済）"
  },
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [139.100, 35.600, 100],
      [139.101, 35.601, 110],
      [139.102, 35.602, 120]
    ]
  }
}
```

### 3.3 スポット (Spot)
画像上のスポットを変換したもの。

- **Geometry Type**: `Point`
- **Properties**:
  - `id`: スポットID
  - `name`: スポット名称
  - `type`: `"spot"` (固定)
  - `source`: `"image_transformed"` (固定)
  - `description`: `"スポット（GPS変換済）"`

```json
{
  "type": "Feature",
  "properties": {
    "id": "spot01_Viewpoint",
    "name": "見晴台",
    "type": "spot",
    "source": "image_transformed",
    "description": "スポット（GPS変換済）"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [139.200, 35.700, 400]
  }
}
```

### 3.4 エリア (Area)
画像上のエリアを変換したもの。

- **Geometry Type**: `Polygon`
- **Properties**:
  - `id`: エリアID
  - `name`: エリア名称
  - `type`: `"area"` (固定)
  - `source`: `"image_transformed"` (固定)
  - `description`: `"エリア（GPS変換済）"`

```json
{
  "type": "Feature",
  "properties": {
    "id": "area_01",
    "name": "駐車場エリア",
    "type": "area",
    "source": "image_transformed",
    "description": "エリア（GPS変換済）"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [139.300, 35.800],
      [139.301, 35.800],
      [139.301, 35.801],
      [139.300, 35.801],
      [139.300, 35.800]
    ]]
  }
}
```

**作成日**: 2026年2月13日
**バージョン**: 2.0
