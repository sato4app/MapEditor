// メッセージ表示機能

// メッセージ表示関数（タイプによって表示時間が異なる）
export function showMessage(message, type = 'success') {
    // 既存のメッセージがあれば削除
    const existingMsg = document.querySelector('.toast-message');
    if (existingMsg) {
        existingMsg.remove();
    }

    // メッセージ要素を作成
    const msgDiv = document.createElement('div');
    msgDiv.className = `toast-message ${type}`;
    // ファイル名やファイル内の値を含むため HTML として解釈しない。改行(\n)だけを <br> にする
    message.split('\n').forEach((line, i) => {
        if (i > 0) msgDiv.appendChild(document.createElement('br'));
        msgDiv.appendChild(document.createTextNode(line));
    });
    document.body.appendChild(msgDiv);

    // タイプによって表示時間を変更
    const displayTime = type === 'error' ? 6000 : type === 'warning' ? 4500 : 3000;

    // 指定時間後に削除
    setTimeout(() => {
        msgDiv.classList.add('fade-out');
        setTimeout(() => msgDiv.remove(), 300);
    }, displayTime);
}
