1. コマンド名
   * AMF 型: String
   * 値: onStatus
2. トランザクション ID:
   * AMF 型: Number
   * 値: 0
3. コマンドオブジェクト
   * AMF 型: Null
   * 値: onStatusメッセージにコマンドオブジェクトは存在しないので AMF における Null を入力する.
4. インフォメーションオブジェクト
   * AMF 型: Object
   * 値: 少なくとも以下の 3 つのプロパティを持つオブジェクト.
     * level
       * AMF 型: String
       * 値: warning / status / error
     * code
       * AMF 型: String
       * 値: メッセージのステータスコード. 例えば NetStream.Play.Start.
     * description
       * AMF 型: String
       * 値: メッセージの人間が読める記述.

インフォメーションオブジェクトは code に応じて他のプロパティを含め**てもよい**.
