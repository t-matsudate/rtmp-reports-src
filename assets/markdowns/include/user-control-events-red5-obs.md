Buffer Empty:

* Event ID: 31
* メッセージ長: 4 bytes
* 入力内容:
  * クライアントに割り当てられているメッセージストリーム ID.
  * rtmpdump などの一部のプログラムはバッファのサイズをできるだけ大きく設定し, サーバ側にできるだけ高速にデータを送信させる.
  * サーバ側が完全なバッファをそのようなクライアント側へ送信した際に, バッファを完全に送信し現在のバッファは空の状態であることをクライアント側へ伝えるためにこのイベントを送信する.
  * その後, サーバ側はクライアント側がそのバッファを消費しきるまで送信を待つ.
