@startuml
== ハンドシェイクが完了した. ==
クライアント -> サーバ: Invoke(connect)
サーバ -> クライアント: Window Acknowledgement Size / Server BandWidth
サーバ -> クライアント: Set Peer BandWidth / Client BandWidth
サーバ -> クライアント: User Control(Stream Begin)
サーバ -> クライアント: Chunk Size
サーバ -> クライアント: Invoke(_result)
サーバ -> クライアント: Invoke(onBWDone)
@enduml

