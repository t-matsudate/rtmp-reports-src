@startuml
== TCP 接続に成功した. ==
クライアント -> サーバ: C0+C1
サーバ -> クライアント: S0+S1+S2
クライアント -> サーバ: C2
== RTMP ハンドシェイクが完了した. ==
クライアント -> サーバ: Invoke(connect)
サーバ -> クライアント: Invoke(_result)
サーバ -> クライアント: Window Acknowledgement Size / Server BandWidth
サーバ -> クライアント: Set Peer BandWidth / Client BandWidth
サーバ -> クライアント: User Control(Stream Begin)
サーバ -> クライアント: Chunk Size
サーバ -> クライアント: Invoke(_result)
== アプリケーション接続が完了した. ==
クライアント -> サーバ: Invoke(releaseStream)
クライアント -> サーバ: Invoke(FCPublish)
クライアント -> サーバ: Invoke(createStream)
サーバ -> クライアント: Invoke(_result)
サーバ -> クライアント: Invoke(onFCPublish)
サーバ -> クライアント: Invoke(_result)
== メッセージストリーム ID の付番が完了した. ==
クライアント -> サーバ: Invoke(publish)
サーバ -> クライアント: User Control(Stream Begin)
サーバ -> クライアント: Invoke(onStatus)
== 映像/音声の送受信を開始する. ==
クライアント -> サーバ ++ : Metadata
クライアント -> サーバ: Audio
クライアント -> サーバ: Video
== 映像/音声の送信が完了するまで. ==
@enduml

