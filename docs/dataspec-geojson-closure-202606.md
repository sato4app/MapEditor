# GeoJSON データ仕様書（通行止め・通行困難場所）

## 1. 概要

本ドキュメントは、**MapEditor** の「通行止め・通行困難場所情報」機能（以下 **closure**）が入出力する GeoJSON ファイルのフォーマットを定義します。

closure データは、GeoReferencer 由来のポイント／ルート／スポット／エリアを束ねた統合 GeoJSON（[`dataspec-geojson-202606.md`](dataspec-geojson-202606.md)）とは**独立した専用ファイル**として読み書きされます。

- **入力元**: GeoReferencer は関与しません。closure データは MapEditor 上で地図をクリックして新規作成し、ドラッグで移動して編集します（手動オーサリング）。
- **専用 I/O**: 統合 GeoJSON とは別に、専用の「ファイル読み込み」「ファイル出力」操作で読み書きします。
- **統合 GeoJSON への混入なし**: closure Feature は統合 GeoJSON の出力には含まれません。逆に、closure の入出力には closure 以外の Feature を含めません。

### 1.1 データフロー

```
                       MapEditor（通行止め・通行困難場所モード）
                       ・地図クリックで地点を新規作成（区分／登録理由／備考を編集）
                       ・ドラッグで位置を移動
                       ・国土地理院標高 API で標高を自動付与
                                  │
              ┌───────────────────┼───────────────────┐
              ▼（出力）                                ▲（読み込み）
   [Closure-YYYYMMDD_N{件数}.geojson]   ←─ 複数ファイルをまとめて読み込み可
```

## 2. 共通仕様

| 項目 | 値 |
|------|----|
| フォーマット | GeoJSON (RFC 7946) |
| ルートタイプ | `FeatureCollection` |
| 拡張子 | `.geojson` |
| 文字コード | UTF-8 |
| 座標系 | WGS84 (EPSG:4326) |
| Geometry | `Point` のみ |
| 座標順序 | `[経度(longitude), 緯度(latitude)]` または `[経度, 緯度, 標高(メートル)]` |
| 標高 | 標高取得済みの場合のみ3番目の要素として含む。未取得時は `[lng, lat]` の2要素 |

### 2.1 数値精度

- 経度・緯度・標高をいずれも **小数点以下5桁** に丸めて出力します。
- 内部に保持する座標値は読み込んだ精度を維持し、丸めは出力時のみ適用します。

### 2.2 FeatureCollection の基本構造

closure 専用ファイルの FeatureCollection は、トップレベルに出力日時 `updatedAt` を持ちます。

```json
{
  "type": "FeatureCollection",
  "updatedAt": "2026-06-21T10:30:00+09:00",
  "features": [ /* closure Feature の配列 */ ]
}
```

| プロパティ | 値・型 | 説明 |
|-----------|--------|------|
| `type` | `"FeatureCollection"` | 固定 |
| `updatedAt` | String (ISO 8601) | ファイル出力日時。タイムゾーンオフセット付き（例 `2026-06-21T10:30:00+09:00`） |
| `features` | Array | closure Feature の配列 |

---

## 3. Feature 仕様（`type: "closure"`）

closure ファイルの `features` には、`type: "closure"` かつ Geometry が `Point` の Feature のみが含まれます。

### 3.1 プロパティ

| プロパティ | 値・型 | 必須 | 説明 |
|-----------|--------|:----:|------|
| `type` | `"closure"` | ○ | 固定値 |
| `id` | String | ○ | 地点 ID。`C-{連番2桁}` 形式（例 `C-01`、`C-02`）。MapEditor が一意に自動採番 |
| `name` | String | ○ | 地点名称。新規作成時の初期値は `"地点{連番}"`（例 `"地点1"`、`"地点2"`） |
| `kind` | `"closed"` / `"difficult"` / `"unknown"` | ○ | 区分。出力時、未選択の場合は `"unknown"` |
| `reason` | String | 任意 | 登録理由。値があるときのみ出力。標準値は `"工事"` / `"倒木"` / `"落石"` |
| `status` | `"draft"` | ○ | 公開状態。現状は常に `"draft"`（テスト中）で出力（[6 章](#6-status-フィールドについて)参照） |
| `note` | String | 任意 | 備考。値があるときのみ出力 |
| `relatedRoute` | String | 任意 | 関連ルート ID。値があるときのみ出力（入力に含まれていれば保持して再出力。現状 UI からの設定手段はなし） |
| `updatedAt` | String (YYYY-MM-DD) | ○ | 地点の最終更新日（地点の追加・移動・備考編集などで更新） |

**プロパティの出力順**: `type` → `id` → `name` → `kind` →（`reason`）→ `status` →（`note`）→（`relatedRoute`）→ `updatedAt`。
（`reason` / `note` / `relatedRoute` は値があるときのみ出力されます。）

#### `kind`（区分）の値と意味

| 値 | 意味 | 地図上の表示形状 |
|----|------|------------------|
| `closed` | 通行止め | ×印 |
| `difficult` | 通行困難 | 三角形 |
| `unknown` | 未選択（区分が指定されていない） | ？（疑問符） |

### 3.2 Geometry

- `type`: `"Point"`
- `coordinates`: `[経度, 緯度]` または `[経度, 緯度, 標高]`
- 標高は国土地理院標高 API から取得済みの場合のみ3番目の要素として含みます。

### 3.3 出力例

```json
{
  "type": "Feature",
  "properties": {
    "type": "closure",
    "id": "C-01",
    "name": "崩落地点",
    "kind": "closed",
    "reason": "落石",
    "status": "draft",
    "note": "復旧時期未定",
    "updatedAt": "2026-06-21"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [135.47204, 34.85367, 320.5]
  }
}
```

最小構成（任意項目なし・標高未取得）の例:

```json
{
  "type": "Feature",
  "properties": {
    "type": "closure",
    "id": "C-02",
    "name": "地点2",
    "kind": "difficult",
    "status": "draft",
    "updatedAt": "2026-06-21"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [135.47500, 34.85800]
  }
}
```

---

## 4. 出力処理仕様（ファイル出力）

「ファイル出力」操作時、MapEditor は次の処理を行います。

1. 内部データから `type: "closure"` かつ Geometry が `Point` の Feature のみを抽出します。
2. 抽出件数が 0 件の場合は出力しません（警告メッセージを表示）。
3. 各 Feature を [3 章](#3-feature-仕様type-closure)のスキーマ・プロパティ順に整形します。
   - `kind` が `closed` / `difficult` 以外（未選択）の場合は `"unknown"` として出力。
   - `status` は常に `"draft"` として出力。
   - `reason` / `note` / `relatedRoute` は値があるときのみ含める。
   - `updatedAt` が無い場合は出力日（`YYYY-MM-DD`）を補完。
   - 座標（経度・緯度・標高）を小数点以下5桁に丸める。
4. トップレベルに `type` / `updatedAt`（出力日時）/ `features` を持つ FeatureCollection として JSON 化します。

### 4.1 ファイル名

```
Closure-{YYYYMMDD}_N{件数}.geojson
```

- **件数**: 出力対象の closure 件数。
- **日付**: 出力日 `YYYYMMDD`。

**例**: `Closure-20260621_N3.geojson`

---

## 5. 読み込み処理仕様（ファイル読み込み）

「ファイル読み込み」操作時、MapEditor は次の処理を行います。

1. **複数ファイルの一括選択**: 複数の `.geojson` ファイルを同時に選択でき、全ファイルの closure を 1 つの内部データに統合します。
2. **closure のみ抽出**: 各ファイルの `features` から、`type: "closure"` かつ Geometry が `Point` の Feature のみを取り込みます。それ以外の Feature は無視します。
3. **同一 ID 重複の除外**: 既存データ（および同一バッチ内）と同一 `id` を持つ Feature はスキップします。`id` は全 closure 地点で一意です。
4. **プロパティの正規化**（取り込み時）:
   - `type` を `"closure"` に固定。
   - `id` が無い場合は `C-{連番2桁}` 形式で自動採番。
   - `kind` が `closed` / `difficult` 以外（`unknown` や空文字など）の場合は未選択（`?` 表示・内部値は空）として扱う。
   - `status` を常に `"draft"` に設定。
   - `reason` / `note` / `relatedRoute` / `updatedAt` / 座標は入力値をそのまま保持。
5. **標高**: 読み込み時には標高を再取得しません（入力ファイルの座標をそのまま使用）。標高は地点の新規追加時・移動時にのみ国土地理院標高 API から取得します。

---

## 6. status フィールドについて

`status` は地点の公開状態を表す予約フィールドですが、**現状の実装では読み込み時・出力時ともに常に `"draft"`（テスト中）に固定**されます。入力ファイルに `published` 等の別の値が含まれていても、`draft` に正規化されます。

---

## 7. 補足

- **標高の自動付与**: 地点の新規追加時、およびドラッグによる移動時に、国土地理院標高 API から標高を取得し、座標の3番目の要素として付与します。取得に成功した場合のみ `updatedAt` も更新されます。
- **地図上の表示**: `kind` に応じてマーカー形状が変化します（`closed`=×印 / `difficult`=三角形 / 未選択=？）。これは表示仕様であり、ファイルフォーマットには影響しません。
- **GeoReferencer 非経由**: closure は MapEditor 上で手動作成するデータであり、GeoReferencer からは出力されません。

## 8. 関連ドキュメント

- 統合 GeoJSON 仕様（ポイント／ルート／スポット／エリア）: [`dataspec-geojson-202606.md`](dataspec-geojson-202606.md)
- 入力 JSON 仕様: `dataspec-json-202604.md`
- 機能仕様: `funcspec-202604.md`
- 利用者の手引: `UsersGuide-202604.md`

---

**作成日**: 2026 年 6 月 21 日
**バージョン**: 1.0（通行止め・通行困難場所 GeoJSON 入出力仕様を統合 GeoJSON 仕様から分離・独立）

**変更履歴**:
- v1.0 (2026-06-21): `dataspec-geojson-202606.md` への統合に先立ち、closure（通行止め・通行困難場所）の GeoJSON 入出力仕様を独立ファイルとして新規作成。
