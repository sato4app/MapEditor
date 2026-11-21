/**
 * Excelファイル操作を管理するモジュール
 * - ポイントGPS(Excel)の読み込み
 * - ルート・スポット(Excel)の読み込み・出力（名称・英語名のみを扱い、位置情報は扱わない）
 * tmp/js/file-handler.js のロジックを移植
 */
import { DEFAULTS } from './constants.js';

// 設定値（constants.jsに定義されたDEFAULTSから取得、なければデフォルト値）
const MAX_ROWS = DEFAULTS.MAX_EXCEL_ROWS || 1000;

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ルート・スポット(Excel)のシート名と列名。各シートの先頭の列が照合のキー
const ROUTE_SHEET_NAME = 'ルート';
const SPOT_SHEET_NAME = 'スポット';
const ROUTE_COLUMNS = ['ルートID', '名称', '英語名'];
const SPOT_COLUMNS = ['名称', '英語名'];

/**
 * ポイントGPS(Excel)の読み込み
 * @param {File} file - アップロードされたファイル
 * @returns {Promise<Array>} パースされたJSONデータ
 */
export async function loadExcelFile(file) {
    const workbook = await readWorkbook(file);
    try {
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        return validateAndConvertExcelData(sheetToRows(firstSheet));
    } catch (error) {
        throw new Error('Excelファイルの読み込みに失敗しました: ' + error.message);
    }
}

/**
 * ルート・スポット(Excel)の読み込み
 * 「ルート」シート（ルートID・名称・英語名）と「スポット」シート（名称・英語名）を読む。
 * どちらか一方のシートがあればよく、無いシートは null を返す。
 * シートに必要な列が無い場合は、どちらのシートも適用されないよう例外を投げる。
 * 照合のキー（ルートID・スポットの名称）が空の行は読み飛ばす。
 * @param {File} file - アップロードされたファイル
 * @returns {Promise<{routes: Array<{routeId: string, name: string, englishName: string}>|null,
 *                    spots: Array<{name: string, englishName: string}>|null}>}
 */
export async function loadRouteSpotExcel(file) {
    const workbook = await readWorkbook(file);
    try {
        const routeSheet = findSheet(workbook, ROUTE_SHEET_NAME);
        const spotSheet = findSheet(workbook, SPOT_SHEET_NAME);
        if (!routeSheet && !spotSheet) {
            throw new Error(`「${ROUTE_SHEET_NAME}」「${SPOT_SHEET_NAME}」シートが見つかりません。`);
        }

        const routes = routeSheet
            ? readNameSheet(routeSheet, ROUTE_SHEET_NAME, ROUTE_COLUMNS).map(values => ({
                routeId: values['ルートID'],
                name: values['名称'],
                englishName: values['英語名']
            }))
            : null;
        const spots = spotSheet
            ? readNameSheet(spotSheet, SPOT_SHEET_NAME, SPOT_COLUMNS).map(values => ({
                name: values['名称'],
                englishName: values['英語名']
            }))
            : null;

        return { routes, spots };
    } catch (error) {
        throw new Error('Excelファイルの読み込みに失敗しました: ' + error.message);
    }
}

/**
 * ルート・スポット(Excel)の内容を作成する（「ルート」「スポット」の2シート）
 * @param {Array<{routeId: string, name: string, englishName: string}>} routes
 * @param {Array<{name: string, englishName: string}>} spots
 * @returns {Blob} .xlsx ファイルの内容
 */
export function createRouteSpotExcelBlob(routes, spots) {
    assertSheetJsLoaded();

    const workbook = XLSX.utils.book_new();

    const routeSheet = XLSX.utils.aoa_to_sheet([
        ROUTE_COLUMNS,
        ...routes.map(r => [r.routeId, r.name, r.englishName])
    ]);
    routeSheet['!cols'] = [{ wch: 32 }, { wch: 24 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(workbook, routeSheet, ROUTE_SHEET_NAME);

    const spotSheet = XLSX.utils.aoa_to_sheet([
        SPOT_COLUMNS,
        ...spots.map(s => [s.name, s.englishName])
    ]);
    spotSheet['!cols'] = [{ wch: 24 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(workbook, spotSheet, SPOT_SHEET_NAME);

    const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob([data], { type: XLSX_MIME_TYPE });
}

/**
 * ファイル種別判定
 */
function isExcelFile(file) {
    // 拡張子またはMIMEタイプで判定
    return file.name.toLowerCase().endsWith('.xlsx') || file.type === XLSX_MIME_TYPE;
}

// SheetJS (XLSX) ライブラリは index.html で読み込まれていることを前提とする
function assertSheetJsLoaded() {
    if (typeof XLSX === 'undefined') {
        throw new Error('SheetJSライブラリが読み込まれていません');
    }
}

// Excelファイルを読み込み、SheetJS のワークブックを返す
async function readWorkbook(file) {
    if (!isExcelFile(file)) {
        throw new Error('Excelファイル(.xlsx)を選択してください');
    }

    let buffer;
    try {
        buffer = await file.arrayBuffer();
    } catch (error) {
        throw new Error('Excelファイル読み込みエラー');
    }

    try {
        assertSheetJsLoaded();
        return XLSX.read(new Uint8Array(buffer), { type: 'array' });
    } catch (error) {
        throw new Error('Excelファイルの読み込みに失敗しました: ' + error.message);
    }
}

// シート名（前後の空白は無視）でシートを探す
function findSheet(workbook, sheetName) {
    const actualName = workbook.SheetNames.find(name => name.trim() === sheetName);
    return actualName ? workbook.Sheets[actualName] : null;
}

// シートを行の配列（各行はセル値の配列）に変換する。読み込み行数は MAX_ROWS までに制限する
function sheetToRows(worksheet) {
    const range = worksheet['!ref'];
    if (range) {
        const decoded = XLSX.utils.decode_range(range);

        // データ行数を制限（設定値から1を引いて0ベースインデックスに調整）
        const maxRows = MAX_ROWS - 1;
        if (decoded.e.r > maxRows) {
            decoded.e.r = maxRows;
            worksheet['!ref'] = XLSX.utils.encode_range(decoded);
        }
    }

    return XLSX.utils.sheet_to_json(worksheet, { header: 1 });
}

// セル値を前後の空白を除いた文字列にする（空セルは空文字）
function toText(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

// ヘッダー行から列名 -> 列番号 の対応を作る（列名の前後の空白は無視）。
// requiredColumns の列が無い場合は例外を投げる
function getColumnIndexMap(headerRow, columns, requiredColumns, sheetLabel = '') {
    const headers = headerRow.map(toText);
    const columnIndexMap = {};
    for (const column of columns) {
        const index = headers.indexOf(column);
        if (index !== -1) {
            columnIndexMap[column] = index;
        } else if (requiredColumns.includes(column)) {
            throw new Error(`${sheetLabel}必須列「${column}」が見つかりません。`);
        }
    }
    return columnIndexMap;
}

// ルート・スポット(Excel)のシートを読み、列名 -> セル値（文字列） の配列を返す。
// columns はすべて必須列。先頭の列（キー）が空の行は読み飛ばす
function readNameSheet(worksheet, sheetName, columns) {
    const sheetLabel = `「${sheetName}」シートの`;
    const rows = sheetToRows(worksheet);
    const headerRow = rows[0];
    if (!headerRow || headerRow.length === 0) {
        throw new Error(`${sheetLabel}ヘッダー行が見つかりません。`);
    }

    const columnIndexMap = getColumnIndexMap(headerRow, columns, columns, sheetLabel);
    const keyColumn = columns[0];

    const result = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const values = {};
        columns.forEach(column => {
            values[column] = toText(row[columnIndexMap[column]]);
        });
        if (!values[keyColumn]) continue;

        result.push(values);
    }
    return result;
}

/**
 * ポイントGPS(Excel)のデータの検証と変換
 * @param {Array} rawData - Excel生データ
 * @returns {Array} 検証済みデータ
 */
function validateAndConvertExcelData(rawData) {
    try {
        if (!rawData || rawData.length === 0) {
            throw new Error('Excelファイルが空です。');
        }

        const requiredColumns = ['ポイントID', '名称', '緯度', '経度']; // 列・値とも必須
        const requiredHeaderColumns = ['英語名'];                       // 列は必須、値は空でもよい
        const optionalColumns = ['標高', '備考'];
        const allColumns = [...requiredColumns, ...requiredHeaderColumns, ...optionalColumns];

        const headerRow = rawData[0];
        if (!headerRow || headerRow.length === 0) {
            throw new Error('ヘッダー行が見つかりません。');
        }

        const columnIndexMap = getColumnIndexMap(
            headerRow, allColumns, [...requiredColumns, ...requiredHeaderColumns]
        );

        const validatedData = [];
        // データ行は1行目から開始
        for (let i = 1; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || row.length === 0) continue;

            const pointData = {};
            let isValidRow = true;

            for (const column of requiredColumns) {
                const value = row[columnIndexMap[column]];
                if (value === undefined || value === null || value === '') {
                    isValidRow = false;
                    break;
                }
                pointData[column] = value;
            }

            if (!isValidRow) continue;

            for (const column of optionalColumns) {
                if (columnIndexMap[column] !== undefined) {
                    const value = row[columnIndexMap[column]];
                    if (value !== undefined && value !== null && value !== '') {
                        pointData[column] = value;
                    }
                }
            }

            try {
                const lat = parseFloat(pointData['緯度']);
                const lng = parseFloat(pointData['経度']);

                if (isNaN(lat) || isNaN(lng)) {
                    continue;
                }

                if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                    continue;
                }

                validatedData.push({
                    pointId: pointData['ポイントID'],
                    name: pointData['名称'],
                    englishName: toText(row[columnIndexMap['英語名']]) || null,
                    lat: lat,
                    lng: lng,
                    elevation: pointData['標高'] || null,
                    description: pointData['備考'] || null
                });

            } catch (error) {
                continue;
            }
        }

        return validatedData;

    } catch (error) {
        console.error('Excel データ検証エラー', error);
        throw error;
    }
}
