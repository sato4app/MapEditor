# GeoJSON データ仕様書

## 1. 概要

本ドキュメントは、**GeoReferencer** からエクスポートされ **MapEditor** に取り込まれる GeoJSON ファイル、および MapEditor が出力する統合 GeoJSON ファイルのフォーマットを定義します。

### 1.1 データフロー

```
[ハイキングマップPNG (地域A)] ──┐
[ハイキングマップPNG (地域B)] ──┤  GeoReferencer
[ハイキングマップPNG (地域C)] ──┘  ・画像をジオリファレンス
                                    ・画像座標→GPS座標へ変換
                                    ・地域ごとに GeoJSON を出力
                                              │
                                              ▼
                            [地域A.geojson] [地域B.geojson] [地域C.geojson]
                                              │
                                              ▼
                                          MapEditor
                                          ・Excel(.xlsx)からの GPS ポイント取り込み
                                          ・複数 GeoJSON をまとめて読み込み
                                          ・地図上で編集（ポイント／ルート／スポット／エリア）
                                          ・1つの統合 GeoJSON として出力
                                              │
                                              ▼
                                       [統合.geojson]
```

- **GeoReferencer**: PNG 画像を国土地理院地図に対してジオリファレンス（最小二乗法による 6 パラメータアフィン変換）し、画像内座標を GPS 座標（緯度・経度）に変換した結果を GeoJSON で出力します。地域ごとに 1 ファイルを出力する運用を想定します。
- **MapEditor**: GeoReferencer が地域ごとに出力した複数 GeoJSON をまとめて読み込み、地図上で編集後、1 つの GeoJSON として再出力します。

> **通行止め・通行困難場所（closure）について**: closure データは MapEditor では扱いません（本ドキュメントが扱う統合 GeoJSON には含まれず、読み込み時も無視されます）。closure の編集と入出力は別アプリケーション **ClosureEditor** が担当し、その仕様は ClosureEditor 側のドキュメントを参照してください。

## 2. 共通仕様

| 項目 | 値 |
|------|----|
| フォーマット | GeoJSON (RFC 7946) |
| ルートタイプ | `FeatureCollection` |
| 拡張子 | `.geojson` |
| 文字コード | UTF-8 |
| 座標系 | WGS84 (EPSG:4326) |
| 座標順序 | `[経度(longitude), 緯度(latitude)]` または `[経度, 緯度, 標高(メートル)]` |
| 標高 | 取得済みの場合のみ3番目の要素として含む。未取得時は `[lng, lat]` の2要素 |

### 2.1 数値精度

- GeoReferencer 出力: 経度・緯度を **小数点以下5桁** に丸めて出力（標高は小数点以下1桁）。
- MapEditor 出力: 経度・緯度・標高をいずれも **小数点以下5桁** に丸めて出力（内部に保持した座標値は読み込んだ精度を維持し、丸めは出力時のみ適用）。

### 2.2 FeatureCollection の基本構造

```json
{
  "type": "FeatureCollection",
  "features": [ /* Feature の配列 */ ]
}
```

---

## 3. GeoReferencer 出力ファイル仕様（MapEditor の入力）

GeoReferencer が「GeoJSON 出力」操作で生成するファイルの仕様です。MapEditor はこのフォーマットの複数ファイルを読み込みます。

### 3.1 ファイル名

```
{略称}-GPS-{P{point数}_R{route数}_S{spot数}_A{area数}}-{YYYYMMDD}.geojson
```

- **略称**: PNG 画像ファイル名の先頭から区切り文字（`-`、`_`、半角スペース、`.`）の前までを使用。
- **件数部**: ポイント／ルート／スポット／エリアの件数。0 件の項目は省略。すべて 0 件の場合は件数部全体を省略。
- **日付**: 出力日 `YYYYMMDD`。

**例**:
- `minoh-GPS-P5_R2_S3-20260427.geojson`
- `takao-GPS-P10_A1-20260427.geojson`

### 3.2 Feature 種別

`features` 配列には次の 4 種類の Feature が含まれます。

| type | Geometry | 説明 |
|------|----------|------|
| `point` | Point | ジオリファレンス基準点／画像内ポイント |
| `route` | LineString | 画像上のルートを変換した経路 |
| `spot` | Point | 画像上のスポット |
| `area` | Polygon | 画像上のエリア |

#### 3.2.1 ポイント（`type: "point"`）

| プロパティ | 値・型 | 説明 |
|-----------|--------|------|
| `id` | String | ポイント ID |
| `name` | String | ポイント名称 |
| `type` | `"point"` | 固定値 |
| `source` | `"image_transformed"` | 固定値 |
| `description` | `"画像ポイント（GPS変換済）"` | 固定値 |

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
    "coordinates": [135.47204, 34.85367, 150.5]
  }
}
```

#### 3.2.2 ルート（`type: "route"`）

中間点（waypoint）を順番に並べた LineString。

| プロパティ | 値・型 | 説明 |
|-----------|--------|------|
| `id` | String | ルート ID。形式 `route_{startPoint}_to_{endPoint}` |
| `name` | String | 表示名。形式 `{startPoint} ～ {endPoint}` |
| `type` | `"route"` | 固定値 |
| `startPoint` | String | 開始ポイント ID（取得不能時 `"unknown_start"`） |
| `endPoint` | String | 終了ポイント ID（取得不能時 `"unknown_end"`） |
| `startPointGPS` | `[lng, lat]` または `null` | 開始ポイントの GPS 座標。同一 GeoJSON 内のポイント／スポット Feature から解決 |
| `endPointGPS` | `[lng, lat]` または `null` | 終了ポイントの GPS 座標 |
| `source` | `"image_transformed"` | 固定値 |
| `description` | `"ルート（GPS変換済）"` | 固定値 |

`coordinates` は中間点を順番に並べた `[lng, lat]` または `[lng, lat, elevation]` の配列。

```json
{
  "type": "Feature",
  "properties": {
    "id": "route_A-01_to_A-02",
    "name": "A-01 ～ A-02",
    "type": "route",
    "startPoint": "A-01",
    "endPoint": "A-02",
    "startPointGPS": [135.47204, 34.85367, 100.1],
    "endPointGPS": [135.47500, 34.85800, 120.3],
    "source": "image_transformed",
    "description": "ルート（GPS変換済）"
  },
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [135.47210, 34.85400, 100.1],
      [135.47300, 34.85500, 110.2],
      [135.47400, 34.85700, 120.3]
    ]
  }
}
```

**`startPointGPS` / `endPointGPS` の解決優先順位**:
1. 同一 GeoJSON 内のポイント／スポット Feature から、`id` または `name` の一致でルックアップ。
2. ルート定義中に `startPoint` / `endPoint` の `lat` / `lng` がある場合はそれを使用。
3. いずれも該当しない場合は `null`。

#### 3.2.3 スポット（`type: "spot"`）

| プロパティ | 値・型 | 説明 |
|-----------|--------|------|
| `id` | String | スポット ID。`spot{連番2桁}_{spotName}` 形式（例 `spot01_見晴台`）またはスポット名 |
| `name` | String | スポット名称 |
| `type` | `"spot"` | 固定値 |
| `source` | `"image_transformed"` | 固定値 |
| `description` | `"スポット（GPS変換済）"` | 固定値 |

```json
{
  "type": "Feature",
  "properties": {
    "id": "spot01_見晴台",
    "name": "見晴台",
    "type": "spot",
    "source": "image_transformed",
    "description": "スポット（GPS変換済）"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [135.47210, 34.85400, 400.9]
  }
}
```

#### 3.2.4 エリア（`type: "area"`）

| プロパティ | 値・型 | 説明 |
|-----------|--------|------|
| `id` | String | エリア ID（未指定時は `area_{タイムスタンプ}` を自動付与） |
| `name` | String | エリア名称（未指定時は `"名称未設定エリア"`） |
| `type` | `"area"` | 固定値 |
| `source` | `"image_transformed"` | 固定値 |
| `description` | `"エリア（GPS変換済）"` | 固定値 |

`coordinates` は GeoJSON Polygon 仕様に従い `[ [ [lng,lat], ..., [lng,lat] ] ]` の 3 重ネスト構造。多角形の閉合（始点と終点を一致させる）は出力時に自動付与されます。各頂点の標高が取得済みの場合は `[lng, lat, elevation]` として出力。

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
      [135.47200, 34.85300, 100.2],
      [135.47210, 34.85300, 100.2],
      [135.47210, 34.85310, 100.3],
      [135.47200, 34.85310, 100.3],
      [135.47200, 34.85300, 100.2]
    ]]
  }
}
```

### 3.3 出力に関する注意事項

- **重複出力の回避**: 同一データが複数の内部データソースに存在する場合、片方のみが出力されます。
- **スポットの最新採用**: 同一 ID のスポットが複数存在する場合、最新のもののみが出力されます。
- **ルートのグルーピング**: 中間点はルート ID ごとにグループ化され、各グループが 1 つの LineString Feature として出力されます。
- **標高**: 国土地理院標高 API から取得した値が利用可能な場合のみ、3 番目の座標要素として含まれます。

---

## 4. MapEditor 出力ファイル仕様（統合 GeoJSON）

MapEditor が「GeoJSON 出力」操作で生成する統合ファイルの仕様です。GeoReferencer 由来の Feature と、Excel から取り込んだ GPS ポイントを 1 つの FeatureCollection としてまとめて出力します。

### 4.1 ファイル名

```
MapGPS-{YYYYMMDD}_P{ポイント数}_R{ルート数}_S{スポット数}.geojson
```

**例**: `MapGPS-20260427_P15_R5_S8.geojson`

### 4.2 Feature 種別

| type | Geometry | 由来 |
|------|----------|------|
| `point` | Point | GeoReferencer 等から読み込んだ画像変換ポイント（入力時のプロパティを保持） |
| `ポイントGPS` | Point | Excel(.xlsx) 読み込みによる GPS ポイント |
| `route` | LineString | ルート編集結果（内部の `route_waypoint` から再構成） |
| `spot` | Point | スポット編集結果 |
| `area` | Polygon | エリア編集結果 |

> **注**: 内部編集用の `type: "route_waypoint"` Point Feature は出力時に `route` LineString に集約され、ファイルには出力されません（[4.2.6 参照](#426-内部表現route_waypointファイル出力なし)）。

#### 4.2.1 ポイント（`type: "point"`）

GeoReferencer 等の外部ツールでジオリファレンス変換された基準点。MapEditor は入力時の `properties` をそのまま保持して再出力します。

| プロパティ | 値・型 | 説明 |
|-----------|--------|------|
| `type` | `"point"` | 固定、必須 |
| `id` | String | ポイント ID |
| `name` | String | ポイント名称 |
| `source` | String | 入力時の値を保持（例: `"image_transformed"`） |
| `description` | String | 入力時の値を保持 |

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

#### 4.2.2 ポイントGPS（`type: "ポイントGPS"`）

Excel(.xlsx) から読み込んだ GPS ポイントデータ。MapEditor 独自の中間種別。

| プロパティ | 値・型 | 説明 |
|-----------|--------|------|
| `type` | `"ポイントGPS"` | 固定、必須 |
| `id` | String | ポイント ID（Excel の `pointId` 列と同値） |
| `name` | String | ポイント名称 |
| `pointId` | String | ポイント ID（`id` と同値） |
| `description` | String | 備考（Excel に備考列がある場合） |

座標は `[経度, 緯度]` または `[経度, 緯度, 標高]`（Excel に標高列がある場合）。

```json
{
  "type": "Feature",
  "properties": {
    "type": "ポイントGPS",
    "id": "G-51",
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

#### 4.2.3 ルート（`type: "route"`）

ルート編集結果。内部の中間点群を順序通りに並べた LineString として出力。GeoReferencer 出力仕様（[3.2.2 節](#322-ルートtype-route)）と整合する形で、ID と座標を分離して保持します。

| プロパティ | 値・型 | 説明 |
|-----------|--------|------|
| `type` | `"route"` | 固定、必須 |
| `id` | String | ルート ID。フォーマット: `route_{startPoint}_to_{endPoint}`。`startPoint` / `endPoint` と常に一致 |
| `startPoint` | String | 開始ポイント ID（**真の参照情報**） |
| `endPoint` | String | 終了ポイント ID（**真の参照情報**） |
| `startPointGPS` | `[lng, lat]` / `[lng, lat, elevation]` / `null` | 開始ポイントの GPS 座標。出力時点での `startPoint` 解決結果のスナップショット。解決失敗時は `null` または省略 |
| `endPointGPS` | `[lng, lat]` / `[lng, lat, elevation]` / `null` | 終了ポイントの GPS 座標。出力時点での `endPoint` 解決結果のスナップショット。解決失敗時は `null` または省略 |

座標は中間点の座標を順番に並べたもの。各座標は `[経度, 緯度]` または `[経度, 緯度, 標高]`。

**ID と座標の関係（補完ルール）**:
- `startPoint` / `endPoint`（ID）が **真の参照情報源** です。
- `startPointGPS` / `endPointGPS`（座標）は出力時点でのスナップショットであり、参照先ポイントが移動・改名された場合は古くなり得ます。
- **読み込み時の優先順位**:
  1. `startPoint` / `endPoint` の ID で動的解決を試み、解決できればその **現在座標** を採用（ポイント追随を維持）
  2. ID で解決できない場合のみ、`startPointGPS` / `endPointGPS` の **座標値** にフォールバック
- **出力時の整合保証**:
  - `id`（routeId）に含まれる ID と `startPoint` / `endPoint` は常に一致させて出力
  - `startPointGPS` / `endPointGPS` は、`startPoint` / `endPoint` から下記解決順序で **引き直した現在座標** で書き出す

**開始・終了ポイントの ID 解決順序**: `startPoint` / `endPoint` の値をキーとして、以下の優先順位で対応する Feature を検索します。
1. `type: "ポイントGPS"` の `id` に一致
2. `type: "point"` の `id` に一致
3. `type: "spot"` の `id` または `name` に一致（同名スポットが複数ある場合は、相手側端点に最も近いものを採用）
4. 上記すべてで解決できない場合は `startPointGPS` / `endPointGPS` の座標値にフォールバック

```json
{
  "type": "Feature",
  "properties": {
    "type": "route",
    "id": "route_A-01_to_A-05",
    "startPoint": "A-01",
    "endPoint": "A-05",
    "startPointGPS": [135.472041, 34.853667, 150.5],
    "endPointGPS": [135.474000, 34.855000, 170.0]
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

#### 4.2.4 スポット（`type: "spot"`）

ポイント以外の地物（見晴台、休憩所等）。

| プロパティ | 値・型 | 説明 |
|-----------|--------|------|
| `type` | `"spot"` | 固定、必須 |
| `name` | String | スポット名称。MapEditor 上で新規作成した場合の初期値は `"仮{連番}"`（例: `"仮1"`、`"仮2"`、…） |
| `id` | String | スポット ID（入力ファイル由来。MapEditor 新規作成時は付与されない） |
| `description` | String | 入力ファイル由来のプロパティを保持 |

座標は `[経度, 緯度]` または `[経度, 緯度, 標高]`。

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

#### 4.2.5 エリア（`type: "area"`）

領域を表すポリゴン（駐車場、休憩エリア等）。

| プロパティ | 値・型 | 説明 |
|-----------|--------|------|
| `type` | `"area"` | 固定、必須 |
| `name` | String | エリア名称。MapEditor 上で新規作成した場合の初期値は `"エリア{連番}"`（例: `"エリア1"`、`"エリア2"`、…） |
| `id` | String | エリア ID（入力ファイル由来。MapEditor 新規作成時は付与されない） |

座標は GeoJSON Polygon 仕様に従い、最初の配列が外周リング、以降が穴を表すリング。各リングの始点と終点の座標は同一であること。

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
      [135.470, 34.850, 100.2],
      [135.471, 34.850, 100.2],
      [135.471, 34.851, 100.3],
      [135.470, 34.851, 100.3],
      [135.470, 34.850, 100.2]
    ]]
  }
}
```

#### 4.2.6 内部表現: `route_waypoint`（ファイル出力なし）

MapEditor 内部での編集中、各ルートの全座標を Point Feature として保持しています。**エクスポートファイルには出力されません**。

| プロパティ | 値・型 | 説明 |
|-----------|--------|------|
| `type` | `"route_waypoint"` | 固定 |
| `route_id` | String | 所属するルート ID（例: `route_A-01_to_A-05`） |
| `waypoint_number` | String | 中間点番号（`"1"` から開始） |

---

## 5. MapEditor の読み込み処理仕様（ファイル単位の振る舞い）

GeoJSON 読み込み時、MapEditor はファイルレベルで次の処理を行います。

1. **複数ファイルの一括選択**: 複数の `.geojson` ファイルを同時に選択でき、全ファイルの Feature を 1 つに統合します。
2. **読み込み種別選択モーダル**: 全ファイルの合計件数（ポイント／ルート／スポット／エリア）を表示し、種別ごとに読み込み対象を選択できます。
3. **同一 ID 重複の除外**: `type: "point"` および `type: "ポイントGPS"` について、既存データと同一 `id` を持つ Feature は新規追加分をスキップします。バッチ内の重複も除外されます。
4. **`type: "route"` LineString の自動展開**: `id` が `route_{X}_to_{Y}` パターンに一致するルートは、内部編集用に `route_waypoint` Point Feature へ自動展開されます。各座標が順番に `waypoint_number` 1, 2, 3, … として登録されます。
5. **編集対象としての登録**: `route_waypoint` Point は `route_id` ごとにグループ化し `waypoint_number` 順に並べて編集対象として登録します。

### 5.1 Excel(.xlsx) 読み込み

`.xlsx` ファイルを選択した場合は、各行を `type: "ポイントGPS"` の Feature に変換して取り込みます。同一 `id` の既存ポイントGPS が存在する場合は Excel の内容で上書きされます。

| Excel 列 | GeoJSON プロパティ |
|----------|------------------|
| ポイントID | `id`、`pointId` |
| 名称 | `name` |
| 緯度 | `coordinates[1]` |
| 経度 | `coordinates[0]` |
| 標高（任意） | `coordinates[2]` |
| 備考（任意） | `description` |

---

## 6. MapEditor の出力処理仕様（ファイル単位の振る舞い）

エクスポート時、MapEditor は内部状態に対して次の変換を行います。

1. **`type: "route_waypoint"` Point** をすべて除外する。
2. **`type: "route"` LineString** をすべて除外する（再生成のため）。
3. 除外した `route_waypoint` Point を `route_id` でグループ化し、`waypoint_number` 昇順に並べて LineString へ集約する。
4. 集約された LineString を `type: "route"` Feature として追加する。プロパティは以下の通り付与する：
   - `type` / `id` を付与（`id` は `route_{startPoint}_to_{endPoint}` 形式）
   - `startPoint` / `endPoint`（ID）を `id`（routeId）から抽出して付与
   - `startPointGPS` / `endPointGPS`（座標）を、`startPoint` / `endPoint` の ID から [4.2.3 ID 解決順序](#423-ルートtype-route) に従って引き直した現在座標で付与（解決失敗時は `null` または省略）
5. その他の Feature（`point`、`ポイントGPS`、`spot`、`area`）はそのまま保持する。

---

## 7. 補足

- **`source` / `description` フィールド**: 入力 GeoJSON に含まれていれば保持して再出力されますが、MapEditor が新規生成するルート（`route`）、スポット（`spot`）、エリア（`area`）の Feature には付与されません。
- **`name` フィールド**: ルート（`route`）Feature にはエクスポート時に付与されません（`startPoint` / `endPoint` で識別）。
- **ポイントGPS** は MapEditor 独自の中間種別であり、GeoReferencer 標準仕様には含まれません。Excel 読み込み機能の入力データとして使用されます。

## 8. 関連ドキュメント

- 入力 JSON 仕様: `dataspec-json-202604.md`
- Firebase DB 仕様: `firebase-dbspec-202512.md`
- 機能仕様: `funcspec-202607.md`
- 前バージョン: `dataspec-geojson-202606.md`

---

**作成日**: 2026 年 7 月 28 日
**バージョン**: 2.6（通行止め・通行困難場所を ClosureEditor へ移行）

**変更履歴**:
- v2.6 (2026-07-28): 通行止め・通行困難場所（closure）の編集・入出力機能が MapEditor から別アプリケーション **ClosureEditor** へ移行したことに伴い、MapEditor 側ドキュメント `dataspec-geojson-closure-202606.md` への参照を削除。
- v2.5 (2026-06-21): 通行止め・通行困難場所（closure）の GeoJSON 入出力仕様を独立ドキュメント `dataspec-geojson-closure-202606.md` として分離。本ドキュメントが扱う統合 GeoJSON には closure を含めないことを概要に明記。
- v2.4 (2026-04-28): MapEditor の `route` Feature に `startPoint` / `endPoint`（ID）プロパティを追加し、`startPointGPS` / `endPointGPS` を座標値（`[lng, lat]` または `[lng, lat, elevation]`）に変更（GeoReferencer 形式に統合）。ID を真の参照情報、座標を出力時スナップショットとする補完ルールを追記（読み込み時は ID 動的解決を優先、解決失敗時のみ座標フォールバック。出力時は ID から現在座標を引き直して書き出し）。
- v2.3 (2026-04-27): GeoReferencer 出力仕様（旧 `tmp/dataspec-geojson-202604.md`）と MapEditor 入出力仕様を統合し、データフローを明示。コード構造に関する記述を除外し、ファイル仕様に絞った内容に再構成。
- v2.2 (2026-04-27): ルート Feature のプロパティ名を `startPoint` / `endPoint` から `startPointGPS` / `endPointGPS` に変更。開始・終了ポイントの解決優先順位（ポイントGPS → point → spot）を追記。エリア新規作成時の初期名 `"エリア{連番}"` を明記。
- v2.1 (2026-04-26): MapEditor 現状コード準拠版を作成。
