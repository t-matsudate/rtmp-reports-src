SWF Verification Request:

* Event ID: 26
* メッセージ長: 0 byte
* 入力内容:
  * 相手側に SWF の内容が正しいことを確かめてもらうためのリクエスト.

SWF Verification Response:

* Event ID: 27
* メッセージ長: 42 bytes
* 入力内容:
  * 相手側から返される SWF のバイト列から生成された HMAC-SHA256 ダイジェスト.
  * メッセージの内訳は以下の通りである:
    * 0 byte目: 1
    * 1 byte目: 1
    * 2 - 5 bytes目: 解凍された SWF のサイズ
    * 6 - 9 bytes目: 同上
    * 10 - 31 bytes目: 解凍された SWF のハッシュをハンドシェイクチャンクのダイジェストで署名したバイト列
