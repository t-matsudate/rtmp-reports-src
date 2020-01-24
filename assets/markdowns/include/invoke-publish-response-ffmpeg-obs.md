1. コマンド名
   * AMF 型: String
   * 値: onStatus
2. トランザクション ID
   * AMF 型: Number
   * 値: 0
3. コマンドオブジェクト
   * AMF 型: Null
   * 値: AMF における Null.
4. インフォメーションオブジェクト
   * AMF 型: Object
   * 値: 以下の名前と値のペア.
     * level
       * AMF 型: String
       * 値: status
     * code
       * AMF 型: String
       * 値: 何らかのステータスコード. FFmpeg/rtmpproto.c#L1965-L1973[^FFmpeg/rtmpproto.c#L1965-L1973] より, 今回は NetStream.Publish.Start が入力されている.
     * description
       * AMF 型: String
       * 値: "**playpath** is now published".
     * details
       * AMF 型: String
       * 値: playpath と同じ値.
