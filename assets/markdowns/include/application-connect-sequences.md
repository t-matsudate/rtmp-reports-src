@startuml
== ハンドシェイクが完了した. ==
クライアント -> サーバ: Invoke(connect)
サーバ -> クライアント: Invoke(_result)
クライアント -> サーバ: Invoke(createStream)
サーバ -> クライアント: Invoke(_result)
クライアント -> サーバ: Invoke(publish)
サーバ -> クライアント: Invoke(onStatus)
== 映像・音声データの送受信へ ==
@enduml

