# MapEditor データ仕様書 (GeoJSON)

## 1. 概要
本ドキュメントは、MapEditor からエクスポートされるGeoJSONファイル、および読み込み可能なGeoJSONファイルのフォーマット仕様を定義します。
MapEditorは、GeoReferencer等から出力されたGeoJSONデータ、およびExcelから読み込んだGPSポイントデータを統合・編集し、GeoJSON形式で再エクスポートするツールです。

## 2. 共通仕様
- **フォーマット**: GeoJSON (RFC 7946)
- **タイプ**: FeatureCollection
- **座標系**: WGS84 (EPSG:4326)
  - 座標順序: `[経度, 緯度, 標高(ない場合は省略)]`
- **出力ファイル名**: `MapGPS-<YYYYMMDD>_P<ポイント数>_R<ルート数>_S<スポット数>.geojson`

## 3. Feature構成

エクスポートされるFeatureCollectionには、以下の5種類のFeatureが含まれる可能性があります。

| type | Geometry | 由来 |
| ---- | -------- | ---- |
| `point` | Point | GeoJSON読み込み（GeoReferencer等の画像変換ポイント）|
| `ポイントGPS` | Point | Excel読み込みによるGPSポイント |
| `route` | LineString | ルート編集結果（`route_waypoint`から再構成）|
| `spot` | Point | スポット編集結果 |
| `area` | Polygon | エリア編集結果 |

> **注意**: 内部編集用の `route_waypoint` Point Featureは、エクスポート時に `route` LineStringに集約され、ファイルには出力されません。

### 3.1 ポイント (Point) — `type: "point"`
GeoReferencer等の外部ツールでジオリファレンス変換された基準点。MapEditorではGeoJSON読み込み時にそのまま保持し、出力時にも入力時の `properties` を維持します。

- **Geometry Type**: `Point`
- **Properties** (入力ファイル由来。MapEditorは下記フィールドを認識します):
  - `type`: `"point"` (固定、必須)
  - `id`: ポイントID
  - `name`: ポイント名称
  - `source`: 入力時の値を保持 (例: `"image_transformed"`)
  - `description`: 入力時の値を保持

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

### 3.2 ポイントGPS (Point) — `type: "ポイントGPS"`
Excel(.xlsx)から読み込んだGPSポイントデータ。同じIDで読み込まれた場合はExcel側で上書きされます。

- **Geometry Type**: `Point`
- **Properties**:
  - `type`: `"ポイントGPS"` (固定、必須)
  - `id`: ポイントID（ExcelのpointId列と同じ）
  - `name`: ポイント名称
  - `pointId`: ポイントID（`id`と同値）
  - `description`: 備考（Excelに備考列がある場合）
- **座標**: `[経度, 緯度]` または `[経度, 緯度, 標高]`（Excelに標高列がある場合）

```json
{
  "type": "Feature",
  "properties": {
    "type": "ポイントGPS",
    "id": "G-001",
    "name": "登山口",
    "pointId": "G-001",
    "description": "駐車場あり"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [135.472041, 34.853667, 150.5]
  }
}
```

### 3.3 ルート (Route) — `type: "route"`
ルート編集結果として、内部の `route_waypoint` Point群を `waypoint_number` 昇順に並べてLineStringに集約したもの。

- **Geometry Type**: `LineString`
- **Properties** (エクスポート時にMapEditorが生成):
  - `type`: `"route"` (固定、必須)
  - `id`: ルートID（フォーマット: `route_<startPoint>_to_<endPoint>`）
  - `startPoint`: 開始ポイントID（`id`から正規表現抽出）
  - `endPoint`: 終了ポイントID（`id`から正規表現抽出）
- **座標**: `route_waypoint` の座標を `waypoint_number` 順に並べたもの。各座標は `[経度, 緯度]` または `[経度, 緯度, 標高]`

```json
{
  "type": "Feature",
  "properties": {
    "type": "route",
    "id": "route_A-01_to_A-05",
    "startPoint": "A-01",
    "endPoint": "A-05"
  },
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [135.472041, 34.853667, 150.5],
      [135.473000, 34.854000, 160.0],
      [135.474000, 34.855000, 170.0]
    ]
  }
}
```

> **読み込み時の動作**: GeoJSONを読み込む際、`type: "route"` の LineString のうち、`id` が `^route_(.+)_to_(.+)$` パターンに一致するものは、内部編集用に `route_waypoint` Point Featureへ自動展開されます。各座標が順番に `waypoint_number` 1, 2, 3, ... として登録されます。

#### 3.3.1 ルート中間点 (route_waypoint) — 内部表現のみ
エクスポートファイルには出力されません。MapEditor内部での編集中の状態として、各ルートの全座標を Point Feature として保持しています。

- **Geometry Type**: `Point`
- **Properties**:
  - `type`: `"route_waypoint"` (固定)
  - `route_id`: 所属するルートID（例: `route_A-01_to_A-05`）
  - `waypoint_number`: 中間点番号（文字列、`"1"` から開始）

### 3.4 スポット (Spot) — `type: "spot"`
ポイント以外の地物（見晴台、休憩所等）。

- **Geometry Type**: `Point`
- **Properties**:
  - `type`: `"spot"` (固定、必須)
  - `name`: スポット名称
    - MapEditor上で新規作成した場合、初期値は `"仮<連番>"`（例: `"仮1"`、`"仮2"`、…）
  - `id`: スポットID（入力ファイル由来。MapEditor新規作成時は付与されない）
  - その他、入力ファイル由来のプロパティ（`description` 等）は保持されます
- **座標**: `[経度, 緯度]` または `[経度, 緯度, 標高]`

```json
{
  "type": "Feature",
  "properties": {
    "type": "spot",
    "name": "見晴台"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [135.480, 34.860, 400]
  }
}
```

### 3.5 エリア (Area) — `type: "area"`
領域を表すポリゴン（駐車場、休憩エリア等）。

- **Geometry Type**: `Polygon`
- **Properties**:
  - `type`: `"area"` (固定、必須)
  - `name`: エリア名称
    - MapEditor上で新規作成した場合、初期値は連番付きの仮名称
  - `id`: エリアID（入力ファイル由来。MapEditor新規作成時は付与されない）
  - その他、入力ファイル由来のプロパティは保持されます
- **座標**: GeoJSON Polygon仕様に従い、最初の配列は外周リング、以降は穴を表すリング。各リングの始点と終点の座標は同一であること。

```json
{
  "type": "Feature",
  "properties": {
    "type": "area",
    "name": "駐車場エリア"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [135.470, 34.850],
      [135.471, 34.850],
      [135.471, 34.851],
      [135.470, 34.851],
      [135.470, 34.850]
    ]]
  }
}
```

## 4. 出力時の処理仕様

エクスポート時、MapEditorは内部状態 (`loadedData.features`) に対して以下の変換を行います:

1. **`type: "route_waypoint"` Point** をすべて除外する
2. **`type: "route"` LineString** をすべて除外する（再生成のため）
3. 除外した `route_waypoint` Point を `route_id` でグループ化し、`waypoint_number` 昇順に並べてLineStringへ集約 (`3.3` 参照)
4. 集約されたLineStringを `type: "route"` Featureとして追加
5. その他のFeature (`point`, `ポイントGPS`, `spot`, `area`) はそのまま保持される

## 5. 読み込み時の処理仕様

GeoJSON読み込み時にMapEditorは以下の処理を行います:

1. ファイル選択モーダルでポイント/ルート/スポット/エリアの読み込み対象を選択
2. `type: "point"` および `type: "ポイントGPS"` の同一ID重複は新規追加分をスキップ
3. `type: "route"` LineString のうち `id` が `route_X_to_Y` パターンのものは、`route_waypoint` Point に自動展開
4. `type: "route_waypoint"` Point は `route_id` ごとにグループ化し、`waypoint_number` 順に並べて編集対象として登録

## 6. 補足

- **ポイントGPS** は MapEditor 独自の中間種別であり、GeoReferencer等の標準仕様には含まれない場合があります。Excel読み込み機能の入力データとして使用されます。
- **`source` / `description` フィールド** は、入力GeoJSONに含まれていれば保持して再出力されますが、MapEditorが新規生成するルート (`route`)、スポット (`spot`)、エリア (`area`) のFeatureには付与されません。
- **`name` フィールド** は、ルート (`route`) Feature にはエクスポート時に付与されません（`startPoint` / `endPoint` で識別）。

---

**作成日**: 2026年4月26日
**バージョン**: 2.1（MapEditor現状コード準拠）
**前バージョン**: `dataspec-geojson-202602.md`（GeoReferencer v2.0仕様）
