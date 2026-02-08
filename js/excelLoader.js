/**
 * Excelファイル操作を管理するモジュール
 * tmp/js/file-handler.js のロジックを移植
 */
import { DEFAULTS } from './constants.js';

// 設定値（constants.jsに定義されたDEFAULTSから取得、なければデフォルト値）
const MAX_ROWS = DEFAULTS.MAX_EXCEL_ROWS || 1000;

/**
 * Excelファイル読み込み
 * @param {File} file - アップロードされたファイル
 * @returns {Promise<Array>} パースされたJSONデータ
 */
export async function loadExcelFile(file) {
    if (!isExcelFile(file)) {
        throw new Error('Excelファイル(.xlsx)を選択してください');
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                // SheetJS (XLSX) ライブラリを使用
                // index.htmlで読み込まれていることを前提とする
                if (typeof XLSX === 'undefined') {
                    throw new Error('SheetJSライブラリが読み込まれていません');
                }

                const workbook = XLSX.read(data, { type: 'array' });

                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // 読み込み行数を制限
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

                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                const validatedData = validateAndConvertExcelData(jsonData);
                resolve(validatedData);
            } catch (error) {
                reject(new Error('Excelファイルの読み込みに失敗しました: ' + error.message));
            }
        };

        reader.onerror = () => reject(new Error('Excelファイル読み込みエラー'));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * ファイル種別判定
 */
function isExcelFile(file) {
    // 拡張子またはMIMEタイプで判定
    return file.name.toLowerCase().endsWith('.xlsx') ||
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

/**
 * Excelデータの検証と変換
 * @param {Array} rawData - Excel生データ
 * @returns {Array} 検証済みデータ
 */
function validateAndConvertExcelData(rawData) {
    try {
        if (!rawData || rawData.length === 0) {
            throw new Error('Excelファイルが空です。');
        }

        const requiredColumns = ['ポイントID', '名称', '緯度', '経度'];
        const optionalColumns = ['標高', '備考'];
        const allColumns = [...requiredColumns, ...optionalColumns];

        const headerRow = rawData[0];
        if (!headerRow || headerRow.length === 0) {
            throw new Error('ヘッダー行が見つかりません。');
        }

        const columnIndexMap = {};
        for (const column of allColumns) {
            const index = headerRow.indexOf(column);
            if (index !== -1) {
                columnIndexMap[column] = index;
            } else if (requiredColumns.includes(column)) {
                throw new Error(`必須列「${column}」が見つかりません。`);
            }
        }

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
