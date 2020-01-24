* app
  * AMF 型: String
  * 値: クライアントが接続しているサーバアプリケーションの名前. 多くの場合において, 起動時に渡される URL から参照する. そのパターンは次の通りである.
    * protocol://server[:port][/app][/playpath]
* type
  * AMF 型: String
  * 値: nonprivate. 公式ドキュメントには定義されていないが FFmpeg や OBS で入力されている.
* flashVer
  * AMF 型: String
  * 値: Flash Player のバージョン. 入力側と出力側で入力内容が違う.
    * 出力側: FMLE/3.0 (compatible; &lt;クライアント側のツールやライブラリの識別情報&gt;)
    * 入力側: &lt;OS の識別名&gt; &lt;Flash Player のバージョン&gt;
* swfUrl
  * AMF 型: String
  * 値: アプリケーション接続に必要な SWF ファイルのURL. ツールによってデフォルトの入力内容に違いがある.
    * FFmpeg: 入力なし.
    * OBS: tcUrl と同じ値.
* tcUrl
  * AMF 型: String
  * 値: 接続先サーバのURL. protocol://server[:port][/app] のフォーマットに従って入力する. デフォルトは起動時にコマンドラインで渡された URL を参照する.
* fpad
  * AMF 型: Boolean
  * 値: プロキシが使われているなら true を入力する.
* capabilities
  * AMF 型: Number
  * 値: 15. 公式ドキュメントには定義されていないが FFmpeg や OBS では入力されている capabilities
    * AMF 型: Number
    * 値: 15. 公式ドキュメントには定義されていないが FFmpeg や OBS では入力されている.
* audioCodecs
  * AMF 型: Number
  * 値: クライアントがサポートする音声コーデックの情報.
* videoCodecs
  * AMF 型: Number
  * 値: クライアントがサポートする映像コーデックの情報.
* videoFunction
  * AMF 型: Number
  * 値: クライアントがサポートする特別なビデオ機能の情報.
* pageUrl
  * AMF 型: String
  * 値: SWF ファイルがロードされた Web ページの URL.
* objectEncoding
  * AMF 型: Number
  * 値: AMF のエンコーディングメソッド.
