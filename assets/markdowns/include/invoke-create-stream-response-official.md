1. コマンド名
   * AMF 型: String
   * 値: \_result / \_error
2. トランザクション ID
   * AMF 型: Number
   * 値: 応答メッセージが属するコマンドの ID.
3. コマンドオブジェクト
   * AMF 型: Object / Null
   * 値: 当該応答メッセージに設定する情報がある場合は Invoke(connect) と同じフォーマットのコマンドオブジェクトを入力する. そうでなければ AMF における Null を入力する.
4. **メッセージストリーム ID**
   * AMF 型: Number / Object
   * 値: メッセージストリーム ID か**エラー情報が入力されたインフォメーションオブジェクト**を入力する.
